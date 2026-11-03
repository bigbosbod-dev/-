// Service worker ของ StudyFlow: ทำให้เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต
// เมื่อแก้ไฟล์ของแอป ให้เปลี่ยนเลขเวอร์ชันนี้ เพื่อให้แคชเก่าถูกล้าง
const CACHE = 'studyflow-v26';

const APP_SHELL = [
  './',
  'index.html',
  'css/tailwind.css',
  'css/style.css',
  'js/app.js',
  'js/sync.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// ไลบรารีจาก CDN (ระบุเวอร์ชันตายตัว จึงแคชได้ถาวร)
const CDN_ASSETS = [
  'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res);
      } catch (e) { /* ออฟไลน์ตอนติดตั้ง: จะลองแคชใหม่ตอนใช้งาน */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // คำขอไปยังเซิร์ฟเวอร์ซิงก์ (Supabase) ต้องไปถึงเซิร์ฟเวอร์จริงเสมอ ห้ามใช้แคช
  if (url.hostname.endsWith('.supabase.co')) return;
  // ภาพแผนที่ (OpenStreetMap) มีจำนวนมาก ไม่เก็บลงแคชของแอป
  if (url.hostname.endsWith('tile.openstreetmap.org')) return;

  if (url.origin === self.location.origin) {
    // ไฟล์ของแอป: ใช้เวอร์ชันล่าสุดจากเน็ตก่อน ถ้าออฟไลน์ค่อยใช้จากแคช
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // no-cache: ถามเซิร์ฟเวอร์ทุกครั้งว่ามีไฟล์ใหม่ไหม กันไม่ให้ได้ไฟล์เก่าปนกับไฟล์ใหม่หลังอัปเดต
        const res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') return cache.match('index.html');
        throw e;
      }
    })());
    return;
  }

  // ไฟล์จาก CDN / Google Fonts: ใช้จากแคชก่อน ถ้าไม่มีค่อยโหลดแล้วเก็บไว้
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  })());
});

// ได้รับแจ้งเตือนจากเซิร์ฟเวอร์ (ทำงานแม้ปิดแอป)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'StudyFlow', {
    body: data.body || '',
    tag: data.tag || 'studyflow',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './' },
  }));
});

// แตะที่การแจ้งเตือน → เปิดแอปขึ้นมา
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.url.startsWith(self.registration.scope));
    if (client) return client.focus();
    return self.clients.openWindow('./');
  })());
});
