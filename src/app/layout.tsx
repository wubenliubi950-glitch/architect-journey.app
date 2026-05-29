import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "建築巡り | Architect Journey",
  description:
    "建築学生・建築観光者のための旅程プランナー。行きたい県と建築を選ぶだけで、最適ルート・交通費・宿泊・予算を自動算出。",
  applicationName: "建築巡り",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "建築巡り",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f2937",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-100 text-stone-900">
        {children}
      </body>
    </html>
  );
}
