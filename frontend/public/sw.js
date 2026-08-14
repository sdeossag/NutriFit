self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', event => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'NutriFit', body: event.data.text() } }
  event.waitUntil(self.registration.showNotification(data.title ?? 'NutriFit', {
    body:     data.body ?? '',
    icon:     '/pwa-192x192.png',
    badge:    '/pwa-192x192.png',
    vibrate:  [200, 100, 200],
    tag:      'bruce-daily',
    renotify: false,
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus() }
      if (clients.openWindow) return clients.openWindow('/')
    })
  )
})
