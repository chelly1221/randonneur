import type { Metadata } from "next";
import Script from "next/script";
import { SessionProvider } from "@/components/auth/session-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { WeatherEffects } from "@/components/weather-effects";
import { Header } from "@/components/layout/header";
import "./globals.css";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://audax.3chan.kr";

export const metadata: Metadata = {
  title: {
    default: "Audax 3chan — 란도너스 자료 저장소",
    template: "%s | Audax 3chan",
  },
  description:
    "한국 랜도너링 퍼머넌트 코스 플랫폼. 달리고, 기록하고, 공유하세요.",
  metadataBase: new URL(baseUrl),
  openGraph: {
    title: "Audax 3chan — 란도너스 자료 저장소",
    description: "한국 랜도너링 퍼머넌트 코스 플랫폼",
    url: baseUrl,
    siteName: "Audax 3chan",
    locale: "ko_KR",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-75X17HCBCT"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-75X17HCBCT');
          `}
        </Script>
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1163834974598586"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <ThemeProvider>
          <SessionProvider>
            <WeatherEffects />
            <Header />
            <main>{children}</main>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
