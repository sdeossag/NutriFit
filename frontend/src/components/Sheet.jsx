// Bottom sheet estilo iOS.
// - Sube desde abajo y se va por el mismo camino (consistencia espacial).
// - Se arrastra desde el encabezado 1:1 con el dedo; un lanzamiento hacia
//   abajo la cierra aunque no se haya arrastrado lejos (proyección de momentum).
// - Hacia arriba resiste progresivamente (rubber-band) en vez de frenar en seco.
// - Interrumpible: se puede agarrar a mitad de animación.
// - El fondo se atenúa y se hunde un poco (dim to focus).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { spring, project, rubberband, velocityFrom, prefersReducedMotion, trackPointer } from '../lib/motion'

const DRAG_THRESHOLD = 6

function setShell(progress) {
  const shell = document.getElementById('app-shell')
  if (!shell) return
  if (progress <= 0.001) {
    shell.style.transform = ''
    shell.style.borderRadius = ''
    shell.style.overflow = ''
    return
  }
  const scale = 1 - 0.05 * progress
  shell.style.transform = `translateY(calc(${(progress * 10).toFixed(2)}px + ${progress.toFixed(3)} * env(safe-area-inset-top, 0px))) scale(${scale.toFixed(4)})`
  shell.style.borderRadius = `${(14 * progress).toFixed(1)}px`
  shell.style.overflow = 'hidden'
}

export default function Sheet({ open, onClose, large = false, header, children, label }) {
  const [mounted, setMounted] = useState(open)
  const sheetRef = useRef(null)
  const scrimRef = useRef(null)
  const y        = useRef(0)
  const anim     = useRef(null)
  const gesture  = useRef(null)
  const lastFocus = useRef(null)
  const releaseVelocity = useRef(0)

  if (open && !mounted) setMounted(true)

  const height = () => sheetRef.current?.offsetHeight || window.innerHeight

  const apply = (val) => {
    y.current = val
    const progress = Math.min(Math.max(1 - val / height(), 0), 1)
    if (sheetRef.current) sheetRef.current.style.transform = `translate3d(0, ${val}px, 0)`
    if (scrimRef.current) scrimRef.current.style.opacity = String(progress)
    setShell(progress)
  }

  const animateTo = (target, { velocity = 0, damping = 1, response = 0.42, onDone } = {}) => {
    anim.current?.stop()
    if (prefersReducedMotion()) {
      // Sin desplazamiento: un fundido corto comunica el cambio
      const el = sheetRef.current
      apply(target === 0 ? 0 : y.current)
      const opening = target === 0
      const fade = [{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }]
      el?.animate(fade, { duration: 200, fill: 'forwards' })
      scrimRef.current?.animate(fade, { duration: 200, fill: 'forwards' })
      setTimeout(() => { if (!opening) apply(target); onDone?.() }, 200)
      return
    }
    anim.current = spring({
      from: y.current, to: target, velocity, response, damping,
      onUpdate: apply, onComplete: onDone,
    })
  }

  // Abrir
  useLayoutEffect(() => {
    if (!open || !mounted || !sheetRef.current) return
    lastFocus.current = document.activeElement
    const shell = document.getElementById('app-shell')
    if (shell) shell.inert = true
    if (scrimRef.current) scrimRef.current.style.pointerEvents = ''
    if (y.current === 0) apply(height())
    animateTo(0)
    sheetRef.current.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted])

  // Cerrar — hereda la velocidad del lanzamiento si lo hubo
  useEffect(() => {
    if (open || !mounted) return
    const v = releaseVelocity.current
    releaseVelocity.current = 0
    if (scrimRef.current) scrimRef.current.style.pointerEvents = 'none'
    animateTo(height(), {
      velocity: v,
      response: 0.36,
      onDone: () => {
        setShell(0)
        const shell = document.getElementById('app-shell')
        if (shell) shell.inert = false
        y.current = 0
        setMounted(false)
        lastFocus.current?.focus?.({ preventScroll: true })
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Limpieza si el componente desaparece abierto
  useEffect(() => () => {
    anim.current?.stop()
    setShell(0)
    const shell = document.getElementById('app-shell')
    if (shell) shell.inert = false
  }, [])

  // Escape cierra
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── Gesto ──
  const onPointerDown = (e) => {
    if (e.button !== 0 || gesture.current || !open) return
    if (e.target.closest('input, textarea, select')) return
    // Tocar la hoja en movimiento la atrapa donde está
    const caught = !!anim.current
    anim.current?.stop()
    anim.current = null
    gesture.current = {
      startY: e.clientY, startVal: y.current, caught,
      dragging: false, samples: [{ x: e.clientY, t: e.timeStamp }],
    }
    trackPointer(e, { onMove, onEnd })
  }

  const onMove = (e) => {
    const g = gesture.current
    if (!g) return false
    const dy = e.clientY - g.startY
    if (!g.dragging) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return false
      g.dragging = true
    }
    const raw = g.startVal + dy
    apply(raw < 0 ? -rubberband(-raw, height()) : raw)
    g.samples.push({ x: e.clientY, t: e.timeStamp })
    if (g.samples.length > 8) g.samples.shift()
    return true
  }

  const onEnd = (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (!g.dragging) {
      if (g.caught) animateTo(0)   // se atrapó a mitad de camino: termina de abrir
      return
    }
    g.samples.push({ x: e.clientY, t: e.timeStamp })
    const v = e.type === 'pointercancel' ? 0 : velocityFrom(g.samples)
    const projected = y.current + project(v, 0.99)
    if (projected > height() * 0.5 && v > -200) {
      releaseVelocity.current = v
      onClose?.()
    } else {
      animateTo(0, { velocity: v, damping: Math.abs(v) > 600 ? 0.85 : 1 })
    }
  }

  if (!mounted) return null

  return createPortal(
    <>
      <div ref={scrimRef} className='nf-scrim' onClick={onClose} />
      <div
        ref={sheetRef}
        className={`nf-sheet${large ? ' nf-sheet--large' : ''}`}
        role='dialog'
        aria-modal='true'
        aria-label={label}
        tabIndex={-1}
      >
        <div className='nf-sheet-handle' onPointerDown={onPointerDown}>
          <div className='nf-sheet-grabber' />
          {header}
        </div>
        <div className='nf-sheet-body'>{children}</div>
      </div>
    </>,
    document.body,
  )
}

// Encabezado estándar: título centrado, acciones a los lados
export function SheetHeader({ title, left, right }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      gap: '8px', padding: '6px 8px 8px', minHeight: '52px',
    }}>
      <div style={{ justifySelf: 'start' }}>{left}</div>
      <p className='nf-headline' style={{ textAlign: 'center' }}>{title}</p>
      <div style={{ justifySelf: 'end' }}>{right}</div>
    </div>
  )
}
