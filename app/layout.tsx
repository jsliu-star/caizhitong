import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Nav } from "@/components/home/Nav";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { Assistant } from "@/components/assistant/Assistant";
import "./globals.css";

export const metadata: Metadata = {
  title: "财智通 · 金融安全智能体",
  description: "让每个人都能读懂金融，守护每一分财富。截图或文字丢进来，先翻成人话，再看有没有风险。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 shadow-card backdrop-blur-md">
          <Nav />
        </header>

        <main className="flex-1">{children}</main>

        {/* 滚动渐入 + 右下角小通助手：全站共用，挂一次 */}
        <Reveal />
        <Assistant />

        <footer className="mt-20 border-t border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="flex items-center gap-2 text-[length:calc(15px*var(--fs))] font-semibold text-brand-950">
                <Icon name="shieldCheck" className="h-5 w-5 text-brand-600" />
                财智通
              </p>
              <p className="mt-2 text-[length:calc(13.5px*var(--fs))] leading-relaxed text-ink-soft">
                让每个人都能读懂金融，守护每一分财富。
              </p>
              <p className="mt-3 text-[length:calc(12.5px*var(--fs))] leading-relaxed text-ink-mute">
                投资者教育用途，不构成投资建议，不推荐具体产品。
              </p>
            </div>

            <nav aria-label="页脚导航">
              <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-900">三个智能体</p>
              <ul className="mt-2 space-y-1.5 text-[length:calc(13.5px*var(--fs))]">
                {[
                  ["/", "识别与翻译"],
                  ["/learn", "学习"],
                  ["/plan", "规划师"],
                  ["/profile", "我的档案"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-soft transition-colors hover:text-brand-700 hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <p className="text-[length:calc(13px*var(--fs))] font-semibold text-brand-900">遇到疑似诈骗</p>
              <ul className="mt-2 space-y-1.5 text-[length:calc(13.5px*var(--fs))] text-ink-soft">
                <li className="flex items-center gap-2">
                  <Icon name="phone" className="h-4 w-4 text-brand-600" />
                  报警 <span className="font-semibold text-ink">110</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="phone" className="h-4 w-4 text-brand-600" />
                  反诈专线 <span className="font-semibold text-ink">12381</span>
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
