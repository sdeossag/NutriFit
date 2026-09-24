import { precacheAndRoute } from 'workbox-precaching'

// Inyecta el listado de archivos para precaching — requerido por VitePWA injectManifest
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Push handler ─────────────────────────────────────────────────────────
// Cada tipo (comida, gym, agua…) trae su propia etiqueta: una nueva del mismo
// tipo reemplaza a la anterior, pero de tipos distintos conviven y todas suenan.
self.addEventListener('push', event => {
  if (!event.data) return

  let data
  try { data = event.data.json() } catch { data = { title: 'NutriFit', body: event.data.text() } }

  const options = {
    body:     data.body ?? '',
    icon:     '/pwa-192x192.png',
    badge:    '/pwa-192x192.png',
    vibrate:  [120, 60, 120],
    tag:      data.tag ?? 'nf-bruce',
    renotify: true,
    data:     { destino: data.destino ?? 'inicio' },
  }

  event.waitUntil(self.registration.showNotification(data.title ?? 'NutriFit', options))
})

// ── Tocar la notificación → abrir la app en la pantalla que corresponde ────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const destino = event.notification.data?.destino ?? 'inicio'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const client of lista) {
        if ('focus' in client) {
          client.postMessage({ tipo: 'nf:navegar', destino })
          return client.focus()
        }
      }
      return self.clients.openWindow?.(`/?abrir=${encodeURIComponent(destino)}`)
    })
  )
})
