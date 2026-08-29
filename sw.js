var CACHE = 'ast-admin-v2';   // ขึ้นเวอร์ชันใหม่ ให้เครื่องที่เคยแคชหน้าร้านไว้ทิ้งของเก่า

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(['./', './index.html', './admin.html', './manifest.json', './icon-192.png']).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        // ไม่มีหน้าร้านลูกค้าแล้ว ทุกที่อยู่คือหน้าพนักงานหน้าเดียวกัน
        return hit || caches.match('./index.html');
      });
    })
  );
});
