"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

type Status = "loading" | "unsupported" | "default" | "denied" | "subscribed";

export function NotificationToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (!reg) {
        setStatus("default");
        return;
      }

      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "default");
    } catch {
      setStatus("default");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function toggleNotifications() {
    if (status === "unsupported" || status === "denied" || status === "loading") return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (status === "subscribed") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const res = await fetch("/api/admin/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (!res.ok) {
            console.error("Unsubscribe API failed:", res.status);
            return;
          }
          await sub.unsubscribe();
        }
        setStatus("default");
      } else {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setStatus("denied");
          return;
        }
        if (permission !== "granted") return;

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          console.error("VAPID public key not configured");
          return;
        }

        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });

        const subJson = sub.toJSON();
        const res = await fetch("/api/admin/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth,
            },
          }),
        });

        if (!res.ok) {
          console.error("Subscribe API failed:", res.status);
          await sub.unsubscribe();
          return;
        }

        setStatus("subscribed");
      }
    } catch (err) {
      console.error("Notification toggle error:", err);
    } finally {
      setBusy(false);
    }
  }

  const config: Record<Status, { icon: typeof Bell; label: string; clickable: boolean; highlight: boolean }> = {
    loading:     { icon: BellOff,  label: "알림 확인 중...", clickable: false, highlight: false },
    unsupported: { icon: BellOff,  label: "알림 미지원",     clickable: false, highlight: false },
    denied:      { icon: BellOff,  label: "알림 차단됨",     clickable: false, highlight: false },
    default:     { icon: BellOff,  label: "알림 받기",       clickable: true,  highlight: false },
    subscribed:  { icon: BellRing, label: "알림 켜짐",       clickable: true,  highlight: true },
  };

  const { icon: Icon, label, clickable, highlight } = config[busy ? "loading" : status];

  return (
    <button
      onClick={clickable ? toggleNotifications : undefined}
      disabled={busy || !clickable}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        highlight
          ? "text-sky-yellow hover:bg-white/10"
          : clickable
            ? "text-white/70 hover:bg-white/10 hover:text-white"
            : "text-white/40 cursor-default"
      } disabled:opacity-50`}
    >
      <Icon className="h-4 w-4" />
      {busy ? "처리 중..." : label}
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
