// VitePWA inyecta aquí el listado de archivos precacheados
const _manifest = self.__WB_MANIFEST

// ── Push handler ─────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let data = {}
  try { data = event.data.json() } catch { data = { title: 'NutriFit', body: event.data.text() } }

  const title   = data.title ?? 'NutriFit'
  const options = {
    body:     data.body ?? '',
    icon:     '/pwa-192x192.png',
    badge:    '/pwa-192x192.png',
    vibrate:  [200, 100, 200],
    tag:      'bruce-daily',
    renotify: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click → abrir / enfocar la app ───────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow('/')
      })
  )
})
