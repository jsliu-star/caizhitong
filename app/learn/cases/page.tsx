import Link from "next/link";
import type { Metadata } from "next";
import { SCAM_CASES } from "@/lib/rules/playbook";
import { CasesList } from "@/components/shield/CasesList";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "骗局图鉴 · 财智通",
  description: "投资理财骗局的运作机制与推进剧本。",
};

export default function CasesPage() {
  return (
    <PageShell
      title="骗局图鉴"
      py="py-10"
      footLink={
        <Link href="/learn" className="font-semibold text-brand-700 underline">
          ← 回到学习
        </Link>
      }
    >
      <header>
        <Link href="/" className="text-[length:calc(14px*var(--fs))] font-medium text-brand-700 hover:text-brand-900">
          ← 返回识别
        </Link>
        <h1 className="mt-4 text-[length:calc(28px*var(--fs))] font-bold tracking-tight text-brand-950 sm:text-[length:calc(34px*var(--fs))]">骗局图鉴</h1>
        <p className="mt-4 text-[length:calc(15px*var(--fs))] leading-relaxed text-ink-soft">
          {SCAM_CASES.length} 类骗局，每类写清两件事：
          <b>钱是怎么没的</b>，以及<b>对方会按什么顺序推进</b>。

        </p>
      </header>

      <div className="mt-8">
        <CasesList cases={SCAM_CASES} />
      </div>

      <section data-outline="共同点" className="mt-10 rounded-2xl bg-brand-900 p-6 text-brand-50">
        <h2 className="text-[length:calc(17px*var(--fs))] font-bold text-on-brand">共同点</h2>
        <ul className="mt-4 space-y-2.5 text-[length:calc(14px*var(--fs))] leading-relaxed">
          {[
            "承诺的收益远高于市场，同时声称没有风险——这两件事在金融上不可能同时成立",
            "让你脱离持牌渠道成交：加微信、进群、下载非应用商店的 App",
            "催你尽快决定，并要求先别告诉家里人",
            "宣称的资质、背景、头衔都拿不出可核验的编号",
            "先让你小额赚一次，再劝你加大投入",
          ].map((x) => (
            <li key={x} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl bg-brand-50 px-5 py-2.5 text-[length:calc(15px*var(--fs))] font-semibold text-brand-900 transition hover:bg-paper"
        >
          去做一次体检 →
        </Link>
      </section>


    </PageShell>
  );
}
