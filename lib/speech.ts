/**
 * 语音：朗读 + 录音（转成 16kHz 单声道 WAV，交给 /api/asr 识别）。
 *
 * 朗读优先用小通自己的声音（/api/tts，阿里云语音合成）；连不上、超时、断网时，
 * 自动退回浏览器自带的中文语音，所以没网也照样能读。
 * 朗读的内容只会是页面上已经显示、已经过审查层的文字——语音只是换一种方式把它读出来。
 *
 * 录音只在浏览器里转格式；音频发往语音识别服务转成文字，识别出来的文字再走原来的问答流程。
 */

// ── 朗读 ─────────────────────────────────────────

/** 同一时间只读一段。开始读新的一段时通知其他朗读按钮复位 */
export const SPEAK_EVENT = "caidun:speak";

export function canSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return typeof Audio !== "undefined" || ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
}

function canSystemSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** 系统语音里挑一个听着最自然的女声；Eddy、Grandpa 这类趣味音色排在后面 */
const PREFERRED = [/Tingting|婷婷/i, /Lili|莉莉/i, /Xiaoxiao|晓晓/i, /Flo/i, /Shelley/i, /Sandy/i];
function zhVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === "zh");
  for (const re of PREFERRED) {
    const v = zh.find((x) => re.test(x.name));
    if (v) return v;
  }
  return zh.find((v) => v.localService) ?? zh[0] ?? voices.find((v) => v.lang.toLowerCase().startsWith("zh"));
}

/** 去掉页面上的排版符号，只留要读的字 */
export function speakable(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/[「」『』【】《》“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 按句切开逐句读。Chrome 读长段落十几秒后会无声中断，切成短句排队就不会。
 */
function sentences(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/(?<=[。！？；!?;\n])/)) {
    const s = part.trim();
    if (!s) continue;
    // 太长的句子再按逗号切
    if (s.length > 80) out.push(...s.split(/(?<=[，,、])/).map((x) => x.trim()).filter(Boolean));
    else out.push(s);
  }
  return out;
}

/** 云端合成按段请求：几句并成一段，少发几次请求，段与段之间的停顿也更自然 */
export function clipsOf(parts: string[], max = 120): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length > max) {
      out.push(cur);
      cur = "";
    }
    cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

/** 首段等多久没回来就改用系统语音 */
const CLOUD_FIRST_MS = 5000;
/** 云端失败后这段时间内直接用系统语音，免得每次都白等 */
const CLOUD_COOLDOWN_MS = 60_000;
let cloudDownUntil = 0;
const CLIPS = new Map<string, string>(); // 文字 → blob URL

async function fetchClip(text: string, ms: number): Promise<string> {
  const cached = CLIPS.get(text);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    if (!r.ok || !(r.headers.get("Content-Type") ?? "").startsWith("audio/")) throw new Error(`tts ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    CLIPS.set(text, url);
    return url;
  } finally {
    window.clearTimeout(timer);
  }
}

function cloudAvailable(): boolean {
  return typeof Audio !== "undefined" && navigator.onLine !== false && Date.now() >= cloudDownUntil;
}

let current = 0;
let player: HTMLAudioElement | null = null;

function stopAll() {
  if (player) {
    player.pause();
    player = null;
  }
  if (canSystemSpeak()) window.speechSynthesis.cancel();
}

/** 用系统语音读这几句 */
function speakSystem(parts: string[], token: number, end: () => void) {
  if (!canSystemSpeak() || parts.length === 0) return end();
  const synth = window.speechSynthesis;
  const voice = zhVoice();
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = voice?.lang ?? "zh-CN";
    if (voice) u.voice = voice;
    // 稍慢一点，给长辈听；音调略高，贴近小通的形象
    u.rate = 0.95;
    u.pitch = 1.15;
    if (i === parts.length - 1) u.onend = () => token === current && end();
    u.onerror = () => token === current && end();
    synth.speak(u);
  });
}

/** 播放一段音频，播完 resolve；被打断或播放失败 reject */
function play(url: string, token: number): Promise<void> {
  return new Promise((ok, no) => {
    if (token !== current) return no(new Error("stopped"));
    const a = new Audio(url);
    player = a;
    a.onended = () => ok();
    a.onerror = () => no(new Error("play"));
    a.play().catch(no);
  });
}

/** 读一段话。返回的函数用来中途停止。onEnd 在读完或被停止时调用一次 */
export function speak(text: string, opts: { id?: string; onEnd?: () => void } = {}): () => void {
  const done = { called: false };
  const end = () => {
    if (done.called) return;
    done.called = true;
    opts.onEnd?.();
  };
  if (!canSpeak()) {
    end();
    return () => {};
  }
  stopAll();
  const token = (current += 1);
  window.dispatchEvent(new CustomEvent(SPEAK_EVENT, { detail: opts.id ?? "" }));

  const parts = sentences(speakable(text));
  if (parts.length === 0) {
    end();
    return () => {};
  }

  if (!cloudAvailable()) {
    speakSystem(parts, token, end);
  } else {
    const clips = clipsOf(parts);
    void (async () => {
      // 先要第一段，同时预取后面的
      const pending = clips.map((c, i) => (i === 0 ? fetchClip(c, CLOUD_FIRST_MS) : null));
      for (let i = 0; i < clips.length; i += 1) {
        if (token !== current) return;
        try {
          const url = await (pending[i] ?? fetchClip(clips[i], 8000));
          if (i + 1 < clips.length && !pending[i + 1]) pending[i + 1] = fetchClip(clips[i + 1], 8000);
          await play(url, token);
        } catch {
          if (token !== current) return;
          // 这一段起改用系统语音读完，不让用户听半截
          cloudDownUntil = Date.now() + CLOUD_COOLDOWN_MS;
          player = null;
          return speakSystem(sentences(clips.slice(i).join("")), token, end);
        }
      }
      if (token === current) {
        player = null;
        end();
      }
    })();
  }

  return () => {
    if (token === current) {
      current += 1;
      stopAll();
    }
    end();
  };
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  current += 1;
  stopAll();
  window.dispatchEvent(new CustomEvent(SPEAK_EVENT, { detail: "" }));
}

// ── 录音 ─────────────────────────────────────────

/** 一次最多录多久，超时自动结束 */
export const MAX_RECORD_MS = 30_000;

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export class MicError extends Error {
  constructor(
    public code: "denied" | "unsupported" | "empty",
    message: string,
  ) {
    super(message);
  }
}

export interface Recording {
  /** 结束录音，返回 data:audio/wav;base64,... */
  stop(): Promise<string>;
  /** 放弃这次录音 */
  cancel(): void;
}

export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  if (!canRecord()) throw new MicError("unsupported", "这个浏览器不支持录音，可以打字问我。");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new MicError("denied", "需要允许使用麦克风，才能语音提问。也可以直接打字。");
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const stopped = new Promise<void>((ok) => (rec.onstop = () => ok()));
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const timer = window.setTimeout(() => onAutoStop?.(), MAX_RECORD_MS);

  return {
    async stop() {
      window.clearTimeout(timer);
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1000) throw new MicError("empty", "没录到声音，再试一次？");
      return toWavDataUrl(blob);
    },
    cancel() {
      window.clearTimeout(timer);
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}

/** 浏览器录出来的是 webm / mp4，统一转成 16kHz 单声道 16bit WAV：体积小，识别服务也一定认 */
async function toWavDataUrl(blob: Blob): Promise<string> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  if (decoded.duration < 0.4) throw new MicError("empty", "录得太短了，按下后说完整一句再点结束。");
  return `data:audio/wav;base64,${base64(encodeWav(pcm, rate))}`;
}

export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 单声道
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
