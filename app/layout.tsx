import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/home/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "财智通 · 金融安全智能体",
  description: "截图或文字丢进来，先翻成人话，再看有没有风险。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <Nav />
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-line bg-paper">
          <div className="mx-auto max-w-5xl px-4 py-8 text-[length:calc(13px*var(--fs))] leading-relaxed text-ink-mute">
            <p>
              投资者教育用途，不构成投资建议，不推荐具体产品。遇到疑似诈骗拨 110，反诈专线 12381。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
