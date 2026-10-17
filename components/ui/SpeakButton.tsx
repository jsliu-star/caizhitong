"use client";

/**
 * 朗读按钮：点一下读，再点一下停。同一时间全站只读一段——别处开始读时，这里自动复位。
 * 浏览器不支持语音合成时不显示。
 */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SPEAK_EVENT, canSpeak, speak } from "@/lib/speech";

export function SpeakButton({
  text,
  label = "读给我听",
  compact = false,
  className = "",
}: {
  text: string;
  label?: string;
  /** 小号：只显示图标（小通对话气泡里用） */
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const [ok, setOk] = useState(false);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => setOk(canSpeak()), []);

  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setPlaying(false);
    };
    window.addEventListener(SPEAK_EVENT, on);
    return () => window.removeEventListener(SPEAK_EVENT, on);
  }, [id]);

  // 离开页面 / 组件卸载时停止，免得换了页还在读
  useEffect(() => () => stopRef.current?.(), []);

  if (!ok || !text.trim()) return null;

  const toggle = () => {
    if (playing) {
      stopRef.current?.();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    stopRef.current = speak(text, { id, onEnd: () => setPlaying(false) });
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "停止朗读" : "朗读这条回答"}
        title={playing ? "停止朗读" : "读给我听"}
        className={`grid h-7 w-7 place-items-center rounded-full text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800 ${playing ? "bg-brand-100 text-brand-800" : ""} ${className}`}
      >
        <Icon name={playing ? "stop" : "volume"} className={`h-4 w-4 ${playing ? "cd-pulse" : ""}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[length:calc(13px*var(--fs))] font-semibold transition ${
        playing ? "border-brand-600 bg-brand-800 text-on-brand" : "border-brand-200 bg-paper text-brand-800 hover:bg-brand-50"
      } ${className}`}
    >
      <Icon name={playing ? "stop" : "volume"} className={`h-4 w-4 ${playing ? "cd-pulse" : ""}`} />
      {playing ? "停止" : label}
    </button>
  );
}
