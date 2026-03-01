"use client";

import { useEffect, useRef } from "react";

export function useServiceWorker() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (!("serviceWorker" in navigator)) return;

    registered.current = true;

    navigator.serviceWorker
      .register("/admin-sw.js", { scope: "/admin/" })
      .then((reg) => {
        console.log("Admin SW registered, scope:", reg.scope);
      })
      .catch((err) => {
        console.error("Admin SW registration failed:", err);
      });
  }, []);
}
