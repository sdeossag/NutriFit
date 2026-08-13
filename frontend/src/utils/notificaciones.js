// Utilidades para Web Push — subscribe/unsubscribe/check

const BASE            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function getToken() {
  return localStorage.getItem('access_token')
}

export function soportaNotificaciones() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function permisoActual() {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

export async function estasSuscrito() {
  if (!soportaNotificaciones()) return false
  try {
    const sw  = await navigator.serviceWorker.ready
    const sub = await sw.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export async function suscribir() {
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY no definida')

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Permiso denegado')

  const sw  = await navigator.serviceWorker.ready
  const sub = await sw.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const { endpoint, keys: { p256dh, auth } = {} } = sub.toJSON()

  const res = await fetch(`${BASE}/push/subscribe/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body:    JSON.stringify({ endpoint, p256dh, auth }),
  })
  if (!res.ok) throw new Error('Error al registrar suscripción en el backend')
  return sub
}

export async function desuscribir() {
  try {
    const sw  = await navigator.serviceWorker.ready
    const sub = await sw.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch { /* ignore */ }

  await fetch(`${BASE}/push/unsubscribe/`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
}

export async function checkPushHoy() {
  if (!soportaNotificaciones()) return null
  const suscrito = await estasSuscrito()
  if (!suscrito) return null
  try {
    const res = await fetch(`${BASE}/push/check/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}
