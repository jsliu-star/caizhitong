"use client";

import type { RiskType } from "@/lib/profile";
import type { Answers } from "@/lib/plan/questions";

/**
 * 品类优先级。
 * 比「给一组百分比」更可执行：明确先后顺序，前一步没做完不进入下一步。
 * 合规：只到品类层面，不出现任何具体产品、代码或管理人。
 */
interface Step {
  id: string;
  title: string;
  what: string;
  why: string;
  /** 满足什么条件才算这一步做完 */
  done: string;
  /** 该状态下是否已完成（由档案与答卷推断） */
  cleared?: (a: Answers) => boolean;
}

const STEPS: Step[] = [
  {
    id: "p1",
    title: "留出应急金",
    what: "3 到 6 个月生活费，放活期或货币类",
    why: "不是买错了，是被迫卖早了。",
    done: "算出金额并单独存放",
    cleared: (a) => ["3-6", "gt6"].includes(String(a.emergency)),
  },
  {
    id: "p2",
    title: "还清高息负债",
    what: "年化超过 10% 的分期、消费贷、信用卡",
    why: "回报等于借款利率，百分之百确定。",
    done: "高息部分清零",
    cleared: (a) => String(a.debt) === "none" || String(a.debt) === "low",
  },
  {
    id: "p3",
    title: "配齐基础保障",
    what: "医疗险、重疾险等保障型保险",
    why: "一场大病的自付部分能吃掉多年收益。",
    done: "保额覆盖主要风险",
  },
  {
    id: "p4",
    title: "搭固收底仓",
    what: "银行存款、国债、债券类基金",
    why: "组合的安全垫。存款在限额内本息受保障。",
    done: "达到你风险等级对应的固收比例",
  },
  {
    id: "p5",
    title: "再谈权益",
    what: "以宽基指数为主，行业主题谨慎且小比例",
    why: "回报和波动的主要来源。要用五年以上不动的钱。",
    done: "只用长钱，且能承受三成以上回撤",
  },
  {
    id: "p6",
    title: "小比例分散",
    what: "黄金等与股债相关性较低的品类",
    why: "用来分散，不是用来赚钱。",
    done: "占比控制在小比例内",
  },
];

export function Priority({ answers, riskType }: { answers: Answers; riskType: RiskType }) {
  const firstUncleared = STEPS.findIndex((s) => !s.cleared?.(answers));

  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <h3 className="text-[length:calc(16px*var(--fs))] font-semibold text-brand-900">先做什么，后做什么</h3>
      <p className="mt-1.5 text-[length:calc(14px*var(--fs))] text-ink-soft">前一步没做完，别做后一步。</p>

      <ol className="mt-4 space-y-2.5">
        {STEPS.map((s, i) => {
          const done = s.cleared?.(answers) ?? false;
          const current = i === firstUncleared;
          return (
            <li
              key={s.id}
              className={`rounded-xl border p-4 ${
                done
                  ? "border-risk-green-line bg-risk-green-bg"
                  : current
                    ? "border-brand-600 bg-brand-50"
                    : "border-line bg-paper"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[length:calc(12px*var(--fs))] font-bold ${
                    done ? "bg-brand-700 text-white" : current ? "bg-brand-600 text-white" : "bg-paper-soft text-ink-mute"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="text-[length:calc(15px*var(--fs))] font-semibold text-brand-900">{s.title}</span>
                {done && <span className="text-[length:calc(12px*var(--fs))] font-medium text-brand-700">已完成</span>}
                {current && <span className="text-[length:calc(12px*var(--fs))] font-medium text-brand-700">从这一步开始</span>}
              </div>
              <p className="mt-1.5 text-[length:calc(14px*var(--fs))] text-ink">{s.what}</p>
              <p className="mt-1 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-soft">{s.why}</p>
              <p className="mt-1.5 text-[length:calc(12px*var(--fs))] text-ink-mute">做完的标准：{s.done}</p>
            </li>
          );
        })}
      </ol>


    </section>
  );
}
