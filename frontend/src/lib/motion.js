import { useEffect, useState } from 'react'

// Física de interfaz al estilo Apple (WWDC "Designing Fluid Interfaces").
// Resortes interrumpibles: siempre parten del valor y la velocidad actuales,
// así un gesto puede agarrar un elemento a mitad de animación sin saltos.

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Anima un número con un resorte definido por `response` (segundos, qué tan
 * rápido llega) y `damping` (1 = sin rebote, <1 = rebota).
 * Devuelve un controlador para detenerlo y leer el valor en pantalla.
 */
export function spring({
  from, to, velocity = 0,
  response = 0.4, damping = 1,
  restDelta = 0.5,
  onUpdate, onComplete,
}) {
  let x = from
  let v = velocity
  let raf = 0
  let done = false

  const finish = () => {
    done = true
    x = to
    v = 0
    onUpdate?.(to, 0)
    onComplete?.()
  }

  if (prefersReducedMotion()) {
    finish()
    return { stop() {}, get value() { return x }, get velocity() { return v } }
  }

  // Parámetros de Apple → física clásica (masa 1)
  const stiffness = (2 * Math.PI / response) ** 2
  const friction  = (4 * Math.PI * damping) / response
  let last = performance.now()

  const step = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const a = -stiffness * (x - to) - friction * v
      v += a * h
      x += v * h
    }
    if (Math.abs(v) < restDelta * 10 && Math.abs(x - to) < restDelta) return finish()
    onUpdate?.(x, v)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)

  return {
    stop() { if (!done) cancelAnimationFrame(raf) },
    get value() { return x },
    get velocity() { return v },
  }
}

// Dónde terminaría un lanzamiento si desacelerara como el scroll de iOS
export const project = (velocity, decelerationRate = 0.998) =>
  ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)

// Resistencia progresiva más allá de un límite — nada se detiene en seco
export const rubberband = (overshoot, dimension, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))

// Velocidad (px/s) a partir de las últimas muestras de un gesto
export function velocityFrom(samples) {
  const now = samples[samples.length - 1]
  if (!now) return 0
  const past = samples.find(s => now.t - s.t <= 100) ?? samples[0]
  const dt = (now.t - past.t) / 1000
  return dt > 0 ? (now.x - past.x) / dt : 0
}

// Háptica ligera donde el navegador la soporte (Android). Solo para momentos
// que lo merecen: completar, guardar, encajar.
export const haptic = (ms = 10) => {
  // El navegador solo permite vibrar después de que la persona tocó la página
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try { navigator.vibrate?.(ms) } catch { /* no soportado */ }
}

// Entrada escalonada solo la primera vez que se ve una pantalla.
// Las pestañas ocultas con display:none reinician sus animaciones CSS al
// volver a mostrarse; por eso quitamos la clase cuando ya se vio.

export function useEntrada(visible = true) {
  const [entrar, setEntrar] = useState(true)
  useEffect(() => {
    if (!visible || !entrar) return
    const t = setTimeout(() => setEntrar(false), 1200)
    return () => clearTimeout(t)
  }, [visible, entrar])
  return entrar
}

// Sigue un gesto desde pointerdown hasta que se suelta, aunque el puntero
// salga del elemento (el mouse no tiene captura implícita como el dedo).
// Si hubo arrastre, se traga el click que el navegador dispara al soltar.
export function trackPointer(downEvent, { onMove, onEnd }) {
  const id = downEvent.pointerId
  let dragged = false
  const move = (e) => {
    if (e.pointerId !== id) return
    if (onMove(e) === true) dragged = true
  }
  const end = (e) => {
    if (e.pointerId !== id) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    onEnd(e)
    if (dragged) {
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}
