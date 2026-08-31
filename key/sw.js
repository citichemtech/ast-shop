/* Service worker เล็ก ๆ ของหน้าเปิดแอป
   มีไว้สองอย่าง: ให้ Chrome ยอมนับว่าเป็น "แอปติดตั้งได้" จริง (ไอคอนจะได้ไม่ติดตรา
   Chrome มุมล่าง) และให้กดไอคอนตอนเน็ตไม่ดีแล้วยังเปิดขึ้น ไม่ขึ้นหน้าไดโนเสาร์ */
var CACHE = 'ast-key-v1';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(['./', './index.html', './manifest.json', './icon-192.png']).catch(function () {});
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    self.clients.claim().then(function () { return caches.keys() }).then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k) }));
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* เอาจากเน็ตก่อนเสมอ แคชไว้เผื่อเน็ตล่ม จะได้ไม่ค้างหน้าเก่าเวลามีของใหม่ */
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}) });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html') });
    })
  );
});
