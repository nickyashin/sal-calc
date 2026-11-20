/**
 * sw.js — Service Worker עבור התקנה כאפליקציית מסך בית (PWA) ועבודה חלקה גם ללא קליטה
 */
const CACHE_NAME = "anna-shift-calc-rose-v4";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./salaryCalculator.js",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // לא לשמור במטמון בקשות Firestore / Hebcal כדי להבטיח נתונים עדכניים בזמן אמת
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("hebcal.com")
  ) {
    return;
  }

  // אסטרטגיית Network-First לקבצי האפליקציה עם גיבוי Cache במצב אופליין
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
  }
});
