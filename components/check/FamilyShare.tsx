"use client";

/**
 * 发给家人：把结论整理成一段话，手机上直接调起系统分享（微信等），电脑上复制到剪贴板。
 * 内容由 lib/report/share.ts 用规则结果拼出，不调用模型；发出去之前先给用户看一眼全文。
 */
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { buildFamilyMessage } from "@/lib/report/share";
import type { ShieldReport } from "@/lib/types";

/** 本机地址发给家人打不开，就不附链接 */
function shareLink(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(hostname)) return undefined;
  return `自己也可以查：${origin}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非安全上下文（局域网 http）没有 clipboard API，退回老办法
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function FamilyShare({ report }: { report: ShieldReport }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "copied" | "shared" | "manual">("idle");

  const go = async () => {
    const text = buildFamilyMessage(report, { link: shareLink() });
    setMsg(text);
    // 触屏设备优先用系统分享面板（能直接选微信）；电脑上复制更顺手
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setState("shared");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setState("idle");
          return;
        }
      }
    }
    setState((await copy(text)) ? "copied" : "manual");
  };

  return (
    <section data-outline="发给家人" className="rounded-2xl border border-brand-300 bg-brand-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">拿不准？发给家人一起看看</h3>
          <p className="mt-0.5 text-[length:calc(13px*var(--fs))] text-ink-soft">把结论整理成一段话，直接粘贴到微信里。</p>
        </div>
        <button
          type="button"
          onClick={() => void go()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-800 px-4 py-2.5 text-[length:calc(14px*var(--fs))] font-semibold text-on-brand shadow-card transition hover:bg-brand-900"
        >
          <Icon name="share" className="h-[1.1em] w-[1.1em]" />
          {state === "copied" ? "已复制，再复制一次" : "发给家人"}
        </button>
      </div>
      {msg && (
        <div className="cd-in mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[length:calc(12.5px*var(--fs))] font-medium text-brand-700">
            <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />
            {state === "copied"
              ? "已复制。打开微信，粘贴给家人就行"
              : state === "shared"
                ? "已经交给系统分享了"
                : "复制不了的话，长按下面这段手动复制"}
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-paper p-3.5 font-sans text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink">
            {msg}
          </pre>
        </div>
      )}
    </section>
  );
}
