import type { Metadata } from "next";
import { SessionProvider } from "@/components/auth/session-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { WeatherEffects } from "@/components/weather-effects";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국 랜도너 퍼머넌트 코스",
  description:
    "Korea Randonneuring Permanent Courses — 한국 랜도너링 퍼머넌트 코스 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
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
