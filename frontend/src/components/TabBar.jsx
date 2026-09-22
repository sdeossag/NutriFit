// Barra de pestañas flotante de vidrio.
// La pastilla de selección es un objeto físico: salta con resorte al tocar
// una pestaña, y se puede arrastrar con el dedo entre pestañas (1:1). Al
// soltar, proyecta el momentum y cae en la pestaña hacia donde iba el gesto.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconHome, IconToolsKitchen2, IconBarbell, IconTrendingUp } from '@tabler/icons-react'
import { spring, project, rubberband, velocityFrom, haptic, trackPointer } from '../lib/motion'
import bruceFace       from '../assets/bruce-face.webp'
import bruceBatmanFace from '../assets/bruce-batman-face.webp'

const TABS = [
  { id: 'home',     Icon: IconHome },
  { id: 'food',     Icon: IconToolsKitchen2 },
  { id: 'gym',      Icon: IconBarbell },
  { id: 'progress', Icon: IconTrendingUp },
  { id: 'chat',     avatar: true },
]
const DRAG_THRESHOLD = 8
const INSET = 4

export default function TabBar({ screen, onSelect, labels, hidden }) {
  const navRef   = useRef(null)
  const pillRef  = useRef(null)
  const btnRefs  = useRef([])
  const x        = useRef(null)     // centro de la pastilla, en px dentro del nav
  const lifted   = useRef(false)
  const anim     = useRef(null)
  const gesture  = useRef(null)
  const fromDrag = useRef(false)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [mouseOnBruce, setMouseOnBruce] = useState(false)

  const activeIdx = Math.max(0, TABS.findIndex(t => t.id === screen))

  const centers = () => btnRefs.current.map(b => (b ? b.offsetLeft + b.offsetWidth / 2 : 0))
  const pillWidth = () => (btnRefs.current[0]?.offsetWidth ?? 64) - INSET * 2
  const nearest = (cx) => {
    const cs = centers()
    let best = 0
    cs.forEach((c, i) => { if (Math.abs(c - cx) < Math.abs(cs[best] - cx)) best = i })
    return best
  }

  const apply = (cx) => {
    x.current = cx
    const pill = pillRef.current
    if (!pill) return
    const w = pillWidth()
    pill.style.width = `${w}px`
    pill.style.transform = `translate3d(${(cx - w / 2).toFixed(2)}px, 0, 0) scale(${lifted.current ? 1.08 : 1})`
    if (gesture.current?.dragging) {
      const i = nearest(cx)
      setHoverIdx(prev => (prev === i ? prev : i))
    }
  }

  const springTo = (target, { velocity = 0, damping = 1, response = 0.36 } = {}) => {
    const from = anim.current ? anim.current.value : x.current
    const v    = anim.current && velocity === 0 ? anim.current.velocity : velocity
    anim.current?.stop()
    anim.current = spring({
      from: from ?? target, to: target, velocity: v, damping, response,
      onUpdate: apply,
      onComplete: () => { anim.current = null },
    })
  }

  // El ResizeObserver vive toda la vida del componente: lee la pestaña activa de un ref
  const activeRef = useRef(activeIdx)
  useLayoutEffect(() => { activeRef.current = activeIdx }, [activeIdx])

  // Posición inicial y al cambiar el tamaño: sin animación
  useLayoutEffect(() => {
    apply(centers()[activeRef.current])
    const ro = new ResizeObserver(() => {
      if (!gesture.current && !anim.current) apply(centers()[activeRef.current])
    })
    ro.observe(navRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cambio de pantalla (tap, o programático): la pastilla salta con resorte
  useEffect(() => {
    if (fromDrag.current) { fromDrag.current = false; return }
    if (x.current == null) return
    springTo(centers()[activeIdx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  // ── Gesto de arrastre sobre la barra ──
  const onPointerDown = (e) => {
    if (e.button !== 0 || gesture.current) return
    const rect = navRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const onPill = Math.abs(px - x.current) < pillWidth() / 2
    gesture.current = {
      left: rect.left, startX: e.clientX,
      grab: onPill ? px - x.current : 0,
      catching: !onPill,
      dragging: false,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    }
    trackPointer(e, { onMove, onEnd })
  }

  const onMove = (e) => {
    const g = gesture.current
    if (!g) return false
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return false
      g.dragging = true
      lifted.current = true
    }
    g.samples.push({ x: e.clientX, t: e.timeStamp })
    if (g.samples.length > 8) g.samples.shift()

    const cs = centers()
    const min = cs[0], max = cs[cs.length - 1]
    const width = navRef.current.offsetWidth
    let target = e.clientX - g.left - g.grab
    if (target < min) target = min - rubberband(min - target, width)
    if (target > max) target = max + rubberband(target - max, width)

    if (g.catching) {
      // Agarrada fuera de la pastilla: la pastilla alcanza al dedo y luego lo sigue 1:1
      springTo(target, { response: 0.18 })
      if (Math.abs((anim.current?.value ?? target) - target) < 2) {
        g.catching = false
        anim.current?.stop(); anim.current = null
      }
    } else {
      anim.current?.stop(); anim.current = null
      apply(target)
    }
    return true
  }

  const onEnd = (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g || !g.dragging) return
    lifted.current = false
    setHoverIdx(null)
    g.samples.push({ x: e.clientX, t: e.timeStamp })
    const cancel = e.type === 'pointercancel'
    const v = cancel ? 0 : velocityFrom(g.samples)
    // El momentum puede llevarla como mucho una pestaña más allá de donde se soltó
    const base = nearest(x.current)
    const proj = nearest(x.current + project(v, 0.99))
    const idx  = cancel ? activeIdx : Math.max(base - 1, Math.min(base + 1, proj))
    anim.current?.stop(); anim.current = null
    springTo(centers()[idx], { velocity: v, damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.4 })
    if (TABS[idx].id !== screen) {
      fromDrag.current = true
      haptic(8)
      onSelect(TABS[idx].id)
    }
  }

  const highlighted = hoverIdx ?? activeIdx
  const chatIdx = TABS.length - 1
  const showBatman = highlighted === chatIdx && hoverIdx !== null || mouseOnBruce

  return (
    <nav
      ref={navRef}
      aria-label='Navegación principal'
      className='nf-glass'
      onPointerDown={onPointerDown}
      style={{
        position: 'fixed', left: '50%', bottom: 'var(--tabbar-gap)', zIndex: 200,
        width: 'calc(100% - 32px)', maxWidth: '398px', height: 'var(--tabbar-h)',
        borderRadius: '32px', padding: `0 ${INSET}px`,
        display: 'flex', alignItems: 'center',
        touchAction: 'none',
        transform: hidden ? 'translate(-50%, calc(100% + var(--tabbar-gap) + 8px))' : 'translate(-50%, 0)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'transform 280ms var(--ease-out), opacity 200ms ease',
      }}
    >
      {/* Pastilla de selección */}
      <div
        ref={pillRef}
        aria-hidden='true'
        style={{
          position: 'absolute', top: `${INSET + 2}px`, bottom: `${INSET + 2}px`, left: 0,
          borderRadius: '26px',
          background: 'rgba(74,222,128,0.14)',
          boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 0 0 0.5px rgba(74,222,128,0.28)',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />

      {TABS.map((tab, i) => {
        const on = i === highlighted
        const label = tab.id === 'chat' ? 'Bruce' : labels[i]
        return (
          <button
            key={tab.id}
            ref={el => (btnRefs.current[i] = el)}
            onClick={() => onSelect(tab.id)}
            aria-current={tab.id === screen ? 'page' : undefined}
            aria-label={label}
            onPointerEnter={e => tab.avatar && e.pointerType === 'mouse' && setMouseOnBruce(true)}
            onPointerLeave={e => tab.avatar && e.pointerType === 'mouse' && setMouseOnBruce(false)}
            className='no-press'
            style={{
              position: 'relative', zIndex: 1, flex: 1, height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
              color: on ? 'var(--green)' : 'rgba(235,235,245,0.6)',
              transition: 'color 180ms ease',
            }}
          >
            {tab.avatar ? (
              <span style={{
                width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', display: 'block',
                boxShadow: on ? '0 0 0 2px var(--green)' : '0 0 0 1.5px rgba(255,255,255,0.22)',
                transition: 'box-shadow 180ms ease',
              }}>
                <img src={showBatman ? bruceBatmanFace : bruceFace} alt='' width={26} height={26}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
            ) : (
              <tab.Icon size={24} strokeWidth={on ? 2.1 : 1.8} />
            )}
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1 }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
