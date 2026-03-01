"use client";

import { useEffect, useState } from "react";
import { Download, CheckCircle, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/40">
        <CheckCircle className="h-4 w-4" />
        앱 설치됨
      </div>
    );
  }

  if (!deferredPrompt) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/40">
        <Smartphone className="h-4 w-4" />
        앱 설치
      </div>
    );
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }

  return (
    <button
      onClick={handleInstall}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sky-blue transition-colors hover:bg-white/10"
    >
      <Download className="h-4 w-4" />
      앱 설치
    </button>
  );
}
