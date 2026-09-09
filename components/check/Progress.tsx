"use client";

export type StageKey = "vision" | "match" | "semantic" | "entity" | "citation" | "verdict";
export type StageStatus = "idle" | "running" | "done";

const STAGES: Array<{ key: StageKey; name: string; engine: "model" | "rule" }> = [
  { key: "vision", name: "识别文字", engine: "model" },
  { key: "match", name: "规则比对", engine: "rule" },
  { key: "semantic", name: "语义识别", engine: "model" },
  { key: "entity", name: "主体核查", engine: "rule" },
  { key: "citation", name: "法规引证", engine: "rule" },
  { key: "verdict", name: "汇总", engine: "model" },
];

/** 紧凑进度条：保留「看得见过程」，但不占半屏文字 */
export function Progress({
  status,
  detail,
  mode,
}: {
  status: Record<StageKey, StageStatus>;
  detail: string;
  mode: "translate" | "risk";
}) {
  const shown = mode === "translate" ? STAGES.filter((s) => s.key === "vision" || s.key === "verdict") : STAGES;
  return (
    <div className="rounded-xl border border-line bg-paper px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {shown.map((s, i) => {
          const st = status[s.key];
          return (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:calc(12px*var(--fs))] font-medium transition ${
                  st === "done"
                    ? "bg-brand-100 text-brand-800"
                    : st === "running"
                      ? "cd-pulse bg-brand-600 text-white"
                      : "bg-paper-soft text-ink-mute"
                }`}
              >
                {st === "done" ? "✓" : i + 1}
                {s.name}
                <span className={`text-[length:calc(10px*var(--fs))] ${st === "running" ? "text-brand-100" : "text-ink-mute"}`}>
                  {s.engine === "model" ? "模型" : "规则"}
                </span>
              </span>
              {i < shown.length - 1 && <span aria-hidden className="text-brand-200">›</span>}
            </span>
          );
        })}
      </div>
      {detail && <p className="cd-in mt-2.5 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{detail}</p>}
    </div>
  );
}

export { STAGES };
