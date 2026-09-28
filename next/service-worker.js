const CACHE = "kr-next-green-v55";
const SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./native.css",
  "./workflow.css",
  "./slip-extra.css",
  "./confirm-extra.css",
  "./api.css",
  "./inventory-process.css",
  "./inventory-workbench.css",
  "./visual-refresh.css",
  "./schedule-edit.css",
  "./recycle-native.css",
  "./sales-native.css",
  "./global-search.css",
  "./design-v2.css",
  "./flow-v2.css",
  "./phone-assessment.css",
  "./ux-v3.css",
  "./sales-workbench.css",
  "./ec-workbench.css",
  "./home-fulfillment.css",
  "./ui-v4.css",
  "./sales-flow.css",
  "./accent-v1.css",
  "./ui-v5.css",
  "./draft-db.js",
  "./green-api.js",
  "./core.js",
  "./schedule.js",
  "./appointments-ui.js",
  "./inventory.js",
  "./home-field.js",
  "./assessment.js",
  "./phone-assessment.js",
  "./slips.js",
  "./recycle.js",
  "./sales.js",
  "./home-fulfillment.js",
  "./global-search.js",
  "./slip.js",
  "./workflow-router.js",
  "./manifest.webmanifest",
  "./data/snapshot.json",
  "./data/customers.json",
  "./data/masters.json",
  "./data/process.json",
  "./shop/app.js",
  "./shop/config.js",
  "./shop/styles.css",
  "./shop/index.html",
  "./shop/",
  "./data/catalog.json",
  "./data/ec-state.json",
  "../hub/assets/icon-192.png",
  "../hub/assets/icon-512.png",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const c = r.clone();
          caches
            .open(CACHE)
            .then((x) => x.put(e.request, c))
            .catch(() => {});
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request).then((r) => r || caches.match("./index.html")),
      ),
  );
});
