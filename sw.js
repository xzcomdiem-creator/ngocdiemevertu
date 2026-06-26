/* ─── TimeFlow Service Worker v3 ─── */
const CACHE = 'timeflow-v3';
const FILES = [
  './HTMLPage.htm',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400&family=JetBrains+Mono:wght@400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

/* ── Install ── */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(FILES.map(f => c.add(f)))
    )
  );
});

/* ── Activate ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch (offline-first, giữ nguyên logic cũ) ── */
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('anthropic.com') || url.includes('supabase.co') || url.includes('workers.dev')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    }).catch(() => caches.match('./HTMLPage.htm'))
  );
});

/* ══════════════════════════════════════════════
   WEB PUSH — nhận push từ Supabase Edge Function
   ══════════════════════════════════════════════ */
self.addEventListener('push', e => {
  if (!e.data) return;

  let payload;
  try { payload = e.data.json(); }
  catch (_) { payload = { title: '⏰ TimeFlow', body: e.data.text() }; }

  const {
    title = '⏰ TimeFlow',
    body = '',
    taskId,
    taskTime,
    url = './HTMLPage.htm'
  } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './badge-72.png',
      tag: taskId ? `task-${taskId}` : 'timeflow-general',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url, taskId, taskTime },
      actions: [
        { action: 'done',   title: '✅ Hoàn thành' },
        { action: 'snooze', title: '💤 Nhắc lại 5p' },
      ],
    })
  );
});

/* ── Notification click ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { action } = e;
  const { url, taskId } = e.notification.data || {};

  /* Tìm tab đang mở hoặc mở tab mới */
  const openOrFocus = (msg) =>
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const timeflowTab = clients.find(c => c.url.includes('HTMLPage'));
      if (timeflowTab) {
        if (msg) timeflowTab.postMessage(msg);
        return timeflowTab.focus();
      }
      return self.clients.openWindow(url || './HTMLPage.htm');
    });

  if (action === 'done' && taskId) {
    e.waitUntil(openOrFocus({ type: 'COMPLETE_TASK', taskId }));
  } else if (action === 'snooze' && taskId) {
    e.waitUntil(openOrFocus({ type: 'SNOOZE_TASK', taskId }));
  } else {
    e.waitUntil(openOrFocus(null));
  }
});

/* ── Background sync (khi có lại mạng) ── */
self.addEventListener('sync', e => {
  if (e.tag === 'sync-tasks') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }))
      )
    );
  }
});
