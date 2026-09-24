// Web Push: activar, desactivar y saber si ESTE dispositivo recibe.
// Las llamadas pasan por api.js, que renueva la sesión si el token venció.
import { estadoPush, quitarPush, registrarPush } from '../api'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').replace(/^["']|["']$/g, '').trim()

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function soportaNotificaciones() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// En iPhone solo funcionan con la app instalada en la pantalla de inicio
export const esIOSSinInstalar = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && window.navigator.standalone !== true

export function permisoActual() {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// El service worker de la app (el mismo que hace el caché offline)
async function registro() {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ?? navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

// Suscrito de verdad = el navegador tiene la suscripción Y el servidor la conoce.
// Si el servidor la borró (el navegador la invalidó), se trata como apagado.
export async function estasSuscrito() {
  if (!soportaNotificaciones() || permisoActual() !== 'granted') return false
  try {
    const sub = await (await registro()).pushManager.getSubscription()
    if (!sub) return false
    const { suscrito } = await estadoPush(sub.endpoint)
    return suscrito
  } catch {
    return false
  }
}

export async function suscribir() {
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY no definida')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Permiso denegado')

  await navigator.serviceWorker.ready
  const reg = await registro()
  // Una suscripción vieja puede tener claves que el servidor ya no reconoce
  const anterior = await reg.pushManager.getSubscription()
  if (anterior) await anterior.unsubscribe().catch(() => {})

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const { endpoint, keys: { p256dh, auth } = {} } = sub.toJSON()
  await registrarPush({ endpoint, p256dh, auth })
  return sub
}

// Solo este dispositivo: los demás siguen recibiendo
export async function desuscribir() {
  let endpoint = null
  try {
    const sub = await (await registro()).pushManager.getSubscription()
    if (sub) {
      endpoint = sub.endpoint
      await sub.unsubscribe()
    }
  } catch { /* el navegador ya no la tenía */ }
  if (endpoint) await quitarPush(endpoint)
}
