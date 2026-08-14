// Utilidades para Web Push — subscribe/unsubscribe/check

const BASE            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').replace(/^["']|["']$/g, '').trim()

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

// Registra (o recupera) nuestro SW de push en /sw.js — independiente de VitePWA
async function getPushSW() {
  const existing = await navigator.serviceWorker.getRegistrations()
  const found    = existing.find(r => r.scope === `${location.origin}/`)

  // Si ya hay un SW activo en el scope raíz, lo reutilizamos
  if (found?.active) return found

  // Registrar el SW estático de public/sw.js
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

  // Esperar a que esté activo
  if (reg.active) return reg
  return new Promise(resolve => {
    const sw = reg.installing || reg.waiting
    if (!sw) { resolve(reg); return }
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') resolve(reg)
    })
  })
}

export async function estasSuscrito() {
  if (!soportaNotificaciones()) return false
  try {
    const reg = await getPushSW()
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export async function suscribir() {
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY no definida')

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Permiso denegado')

  const reg = await getPushSW()

  // Cancelar suscripción previa para evitar estado corrupto
  const subExistente = await reg.pushManager.getSubscription()
  if (subExistente) await subExistente.unsubscribe().catch(() => {})

  const sub = await reg.pushManager.subscribe({
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
    const reg = await getPushSW()
    const sub = await reg.pushManager.getSubscription()
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
