const CACHE = "kr-next-green-v108";
const SHELL = [
  "./",
  "./index.html",
  "./white-surfaces.css?v=2",
  "./statement.html",
  "./statement.js?v=1",
  "./app.css",
  "./native.css",
  "./workflow.css?v=3",
  "./slip-extra.css?v=7",
  "./confirm-extra.css?v=4",
  "./api.css",
  "./inventory-process.css",
  "./inventory-workbench.css?v=2",
  "./visual-refresh.css",
  "./schedule-edit.css?v=2",
  "./recycle-native.css",
  "./sales-native.css",
  "./global-search.css",
  "./design-v2.css",
  "./flow-v2.css",
  "./phone-assessment.css",
  "./assessment-workbench.css?v=3",
  "./ux-v3.css",
  "./sales-workbench.css",
  "./ec-workbench.css",
  "./home-fulfillment.css",
  "./ui-v4.css",
  "./sales-flow.css",
  "./accent-v1.css",
  "./ui-v5.css",
  "./header-actions.css?v=2",
  "./inventory-photo.css?v=1",
  "./inventory-compact.css?v=1",
  "./slip-compact.css?v=2",
  "./gesture-ux.css?v=2",
  "./price-card.css?v=2",
  "./draft-db.js?v=2",
  "./green-api.js?v=5",
  "./core.js?v=26",
  "./performance-utils.js?v=1",
  "./loading-ux.js?v=1",
  "./loading-ux.css?v=1",
  "./schedule.js?v=3",
  "./appointments-ui.js?v=2",
  "./inventory.js?v=8",
  "./gesture-ux.js?v=2",
  "./price-card.js?v=2",
  "./home-field.js",
  "./assessment-adapter.js?v=15",
  "./assessment.js?v=25",
  "./phone-assessment.js",
  "./slips.js?v=5",
  "./recycle.js",
  "./sales.js",
  "./home-fulfillment.js",
  "./global-search.js",
  "./slip.js?v=21",
  "./slip-workspace.js?v=2",
  "./slip-workspace.css?v=4",
  "./slip-controls.js?v=3",
  "./menu-workspace.js?v=3",
  "./workflow-router.js?v=7",
  "./header-actions.js?v=1",
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
