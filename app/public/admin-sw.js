/// <reference lib="webworker" />

const CACHE_NAME = "audax-admin-v1";
const STATIC_ASSETS = [
  "/icons/icon-96x96.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for admin pages, cache-first for static assets, skip API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API requests and non-GET
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Admin pages: network-first with cache fallback
  if (url.pathname.startsWith("/admin")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});

// Push notification received
self.addEventListener("push", (event) => {
  let data = { title: "Audax 3chan", body: "새 알림이 있습니다.", url: "/admin" };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      vibrate: [200, 100, 200],
      tag: data.tag || "admin-notification",
      data: { url: data.url || "/admin" },
    })
  );
});

// Notification click: navigate to relevant admin page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/admin";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Try to focus an existing controlled admin tab
      for (const client of clients) {
        if (client.url.includes("/admin") && "focus" in client) {
          return client.navigate(targetUrl).then((c) => c ? c.focus() : self.clients.openWindow(targetUrl));
        }
      }
      // Open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
