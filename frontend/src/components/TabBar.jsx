// Barra de pestañas flotante de vidrio (liquid glass), según apple-design.
//
// La selección es un lente físico. Todo lo que se mueve lo hace con resortes que
// parten del valor en pantalla, así cualquier movimiento se puede agarrar y
// redirigir a mitad de camino (§3):
//   - Al tocar, el lente crece y viaja a la pestaña bajo el dedo antes de soltar (§1).
//   - Se arrastra 1:1 respetando dónde se agarró (§2) con resistencia en los bordes (§9).
//   - Al soltar hereda la velocidad del dedo (§5) y cae donde apuntaba el gesto (§6).
//   - Se estira en la dirección del movimiento según la velocidad (§8, §11).
//   - Pinta de verde exactamente lo que cubre, y agranda los íconos cerca del dedo.
//   - Arrastrar lejos de la barra y soltar cancela el cambio (§10).
// En computador el lente sigue al mouse sin hacer clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconHome, IconToolsKitchen2, IconBarbell, IconTrendingUp } from '@tabler/icons-react'
import { spring, project, rubberband, velocityFrom, haptic, trackPointer, prefersReducedMotion } from '../lib/motion'
import bruceFace       from '../assets/bruce-face.webp'
import bruceBatmanFace from '../assets/bruce-batman-face.webp'

const TABS = [
  { id: 'home',     Icon: IconHome },
  { id: 'food',     Icon: IconToolsKitchen2 },
  { id: 'gym',      Icon: IconBarbell },
  { id: 'progress', Icon: IconTrendingUp },
  { id: 'chat',     avatar: true },
]

const DRAG_THRESHOLD = 10    // histéresis antes de tratarlo como arrastre (§10)
const CANCEL_DISTANCE = 80   // px por encima de la barra para cancelar al soltar
const INSET          = 4
const LIFT_SCALE     = 0.1   // el lente crece 10% mientras se toca
const MAX_MAGNIFY    = 0.18  // un ícono bajo el dedo crece hasta 18%
const MAX_STRETCH    = 0.14  // estiramiento máximo por velocidad
const STRETCH_SPEED  = 3200  // px/s para llegar al estiramiento máximo

// Resortes (response en segundos, damping 1 = sin rebote)
const SP_MOVE    = { response: 0.36, damping: 1 }
const SP_CATCH   = { response: 0.18, damping: 1 }
const SP_LIFT    = { response: 0.24, damping: 1 }
const SP_SETTLE  = { response: 0.34, damping: 1 }
const SP_MAG_IN  = { response: 0.16, damping: 1 }

const smoothstep = (t) => t * t * (3 - 2 * t)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function Contenido({ tab, label, batman }) {
  return (
    <>
      {tab.avatar ? (
        <span style={{
          width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', display: 'block',
          boxShadow: '0 0 0 1.5px currentColor',
        }}>
          <img src={batman ? bruceBatmanFace : bruceFace} alt='' width={26} height={26}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </span>
      ) : (
        <tab.Icon size={24} strokeWidth={1.9} />
      )}
      <span className='nf-tabbar-label'>{label}</span>
    </>
  )
}

export default function TabBar({ screen, onSelect, labels, hidden }) {
  const navRef  = useRef(null)
  const pillRef = useRef(null)
  const btnRefs = useRef([])
  const litRefs = useRef([])
  const geo     = useRef({ lefts: [], widths: [], width: 0 })

  // Valores en pantalla (presentation values) y sus resortes
  const x       = useRef(null)
  const xVel    = useRef(0)
  const lift    = useRef(0)
  const stretch = useRef(0)
  const mag     = useRef(TABS.map(() => 0))
  const anims   = useRef({ x: null, lift: null, stretch: null, mag: [] })

  const gesture   = useRef(null)
  const hovering  = useRef(false)
  const fromDrag  = useRef(false)
  const lastHover = useRef(-1)
  const pendiente = useRef(false)
  const stretchTimer = useRef(0)
  const [batman, setBatman] = useState(false)

  const activeIdx = Math.max(0, TABS.findIndex(t => t.id === screen))
  const activeRef = useRef(activeIdx)
  useLayoutEffect(() => { activeRef.current = activeIdx }, [activeIdx])

  // ── Geometría (cacheada: no se lee layout en cada frame) ──
  const medir = () => {
    const btns = btnRefs.current
    geo.current = {
      lefts:  btns.map(b => b?.offsetLeft ?? 0),
      widths: btns.map(b => b?.offsetWidth ?? 0),
      width:  navRef.current?.offsetWidth ?? 0,
    }
  }
  const centers   = () => geo.current.lefts.map((l, i) => l + geo.current.widths[i] / 2)
  const pillWidth = () => (geo.current.widths[0] ?? 64) - INSET * 2
  const nearest   = (cx) => {
    const cs = centers()
    let best = 0
    cs.forEach((c, i) => { if (Math.abs(c - cx) < Math.abs(cs[best] - cx)) best = i })
    return best
  }

  // ── Render: compone todos los valores en un solo frame ──
  const render = () => {
    pendiente.current = false
    const pill = pillRef.current
    if (!pill || x.current == null) return
    const w  = pillWidth()
    const cx = x.current
    const s  = 1 + LIFT_SCALE * lift.current
    const st = stretch.current
    pill.style.width = `${w}px`
    pill.style.transform =
      `translate3d(${(cx - w / 2).toFixed(2)}px, 0, 0) scale(${(s * (1 + st)).toFixed(4)}, ${(s * (1 - st * 0.5)).toFixed(4)})`

    // Transferencia de color: el verde aparece solo donde el lente cubre cada pestaña
    const half = (w * s * (1 + st)) / 2
    const pL = cx - half, pR = cx + half
    const { lefts, widths } = geo.current
    let chatCover = 0
    litRefs.current.forEach((lit, i) => {
      if (!lit) return
      const bL = lefts[i], bW = widths[i] || 1, bR = bL + bW
      const oL = Math.max(pL, bL), oR = Math.min(pR, bR)
      if (oR <= oL) { lit.style.clipPath = 'inset(0 100% 0 0)'; return }
      lit.style.clipPath = `inset(0 ${(((bR - oR) / bW) * 100).toFixed(2)}% 0 ${(((oL - bL) / bW) * 100).toFixed(2)}%)`
      if (i === TABS.length - 1) chatCover = (oR - oL) / bW
    })

    // Lupa
    btnRefs.current.forEach((btn, i) => {
      if (!btn) return
      const t = mag.current[i]
      btn.style.transform = t > 0.001
        ? `translateY(${(-3 * t).toFixed(2)}px) scale(${(1 + MAX_MAGNIFY * t).toFixed(4)})`
        : ''
    })

    // Bruce se pone la máscara cuando el lente pasa sobre él mientras lo tocas
    const quiere = lift.current > 0.5 && chatCover > 0.4
    setBatman(prev => (prev === quiere ? prev : quiere))
  }
  // Se dibuja en el mismo frame (microtarea), no en el siguiente: cero latencia (§1)
  const schedule = () => {
    if (pendiente.current) return
    pendiente.current = true
    queueMicrotask(render)
  }

  // ── Resortes que parten del valor actual (y heredan su velocidad) ──
  const animar = (key, ref, target, cfg, { velocity, idx } = {}) => {
    const actual = idx == null ? anims.current[key] : anims.current.mag[idx]
    const from = idx == null ? ref.current : ref.current[idx]
    const v = velocity ?? actual?.velocity ?? 0
    actual?.stop()
    const a = spring({
      from: from ?? target, to: target, velocity: v,
      response: cfg.response, damping: cfg.damping,
      restDelta: key === 'x' ? 0.3 : 0.001,
      onUpdate: (val, vel) => {
        if (idx == null) ref.current = val; else ref.current[idx] = val
        if (key === 'x') xVel.current = vel
        schedule()
      },
      onComplete: () => {
        if (key === 'x') xVel.current = 0
        if (idx == null) anims.current[key] = null; else anims.current.mag[idx] = null
      },
    })
    // Con "reducir movimiento" el resorte termina al instante: no queda nada vivo que guardar
    const vivo = prefersReducedMotion() ? null : a
    if (idx == null) anims.current[key] = vivo; else anims.current.mag[idx] = vivo
  }

  const moverA   = (target, cfg = SP_MOVE, velocity) => animar('x', x, target, cfg, { velocity })
  const levantar = (on) => {
    animar('lift', lift, on ? 1 : 0, on ? SP_LIFT : SP_SETTLE)
    if (pillRef.current) pillRef.current.dataset.lifted = on ? 'true' : 'false'
  }
  const estirar = (v) => {
    if (prefersReducedMotion()) return
    const objetivo = Math.min(Math.abs(v) / STRETCH_SPEED, 1) * MAX_STRETCH
    animar('stretch', stretch, objetivo, SP_MAG_IN)
    // Si el dedo se detiene no llegan más eventos: el lente recupera su forma
    clearTimeout(stretchTimer.current)
    stretchTimer.current = setTimeout(() => animar('stretch', stretch, 0, SP_SETTLE), 70)
  }
  const magnify = (px) => {
    const reducir = prefersReducedMotion()
    const { lefts, widths } = geo.current
    const radio = (widths[0] || 64) * 1.6
    TABS.forEach((_, i) => {
      const t = px == null || reducir ? 0 : smoothstep(clamp01(1 - Math.abs(px - (lefts[i] + widths[i] / 2)) / radio))
      animar('mag', mag, t, px == null ? SP_SETTLE : SP_MAG_IN, { idx: i })
    })
  }
  const detenerX = () => { anims.current.x?.stop(); anims.current.x = null }

  // ── Posición inicial y cambios de tamaño: sin animación ──
  useLayoutEffect(() => {
    medir()
    x.current = centers()[activeRef.current]
    render()
    const ro = new ResizeObserver(() => {
      medir()
      if (!gesture.current && !anims.current.x && !hovering.current) {
        x.current = centers()[activeRef.current]
        schedule()
      }
    })
    ro.observe(navRef.current)
    return () => {
      ro.disconnect()
      clearTimeout(stretchTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cambio de pantalla por toque, teclado o código: el lente viaja con resorte
  useEffect(() => {
    if (fromDrag.current) { fromDrag.current = false; return }
    if (x.current == null || hovering.current || gesture.current) return
    moverA(centers()[activeIdx])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  const objetivoDesde = (clientX, left, grab = 0) => {
    const cs = centers()
    const min = cs[0], max = cs[cs.length - 1]
    let t = clientX - left - grab
    if (t < min) t = min - rubberband(min - t, geo.current.width)
    if (t > max) t = max + rubberband(t - max, geo.current.width)
    return t
  }

  // Tick háptico al cruzar a otra pestaña mientras se arrastra (§13)
  const tickSiCambia = (cx) => {
    const i = nearest(cx)
    if (i !== lastHover.current) {
      if (lastHover.current !== -1) haptic(4)
      lastHover.current = i
    }
  }

  // ── Toque / clic presionado ──
  const onPointerDown = (e) => {
    if (e.button !== 0 || gesture.current) return
    medir()
    const rect = navRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const onPill = Math.abs(px - x.current) < pillWidth() / 2
    gesture.current = {
      left: rect.left, top: rect.top, startX: e.clientX, startY: e.clientY,
      grab: onPill ? px - x.current : 0,
      catching: !onPill,
      dragging: false,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    }
    lastHover.current = nearest(px)
    // §1: responde al presionar — el lente crece y va hacia la pestaña tocada
    levantar(true)
    if (!onPill) moverA(centers()[nearest(px)], SP_CATCH)
    trackPointer(e, { onMove, onEnd })
  }

  const onMove = (e) => {
    const g = gesture.current
    if (!g) return false
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return false
      g.dragging = true
    }
    g.samples.push({ x: e.clientX, t: e.timeStamp })
    if (g.samples.length > 8) g.samples.shift()

    // Lejos de la barra: el lente se relaja para anunciar que soltar cancela
    const lejos = g.top - e.clientY > CANCEL_DISTANCE
    if (lejos !== !!g.lejos) { g.lejos = lejos; levantar(!lejos) }

    const target = objetivoDesde(e.clientX, g.left, g.grab)
    magnify(lejos ? null : e.clientX - g.left)
    estirar(velocityFrom(g.samples))
    tickSiCambia(target)

    if (g.catching) {
      // Se agarró fuera del lente: lo alcanza con resorte y luego lo sigue 1:1
      moverA(target, SP_CATCH)
      if (Math.abs(x.current - target) < 2) { g.catching = false; detenerX() }
    } else {
      detenerX()
      x.current = target
      schedule()
    }
    return true
  }

  const onEnd = (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (!hovering.current) { levantar(false); magnify(null) }

    if (!g.dragging) {
      // Toque simple: el click confirma el cambio. Si se tocó la pestaña activa
      // (o el toque se canceló), el lente vuelve a su sitio.
      const tocada = nearest(g.startX - g.left)
      if (tocada === activeRef.current || e.type === 'pointercancel') moverA(centers()[activeRef.current])
      return
    }

    g.samples.push({ x: e.clientX, t: e.timeStamp })
    const cancelar = e.type === 'pointercancel' || g.top - e.clientY > CANCEL_DISTANCE
    const v = cancelar ? 0 : velocityFrom(g.samples)
    // El momentum la lleva como mucho una pestaña más allá de donde se soltó
    const base = nearest(x.current)
    const proj = nearest(x.current + project(v, 0.99))
    const idx  = cancelar ? activeRef.current : Math.max(base - 1, Math.min(base + 1, proj))
    detenerX()
    moverA(centers()[idx], Math.abs(v) > 300 ? { response: 0.4, damping: 0.8 } : SP_MOVE, v)
    if (TABS[idx].id !== screen) {
      fromDrag.current = true
      haptic(10)
      onSelect(TABS[idx].id)
    }
  }

  // ── Mouse sin presionar: el lente sigue al puntero (solo computador) ──
  const onHoverMove = (e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0 || gesture.current) return
    const rect = navRef.current.getBoundingClientRect()
    if (!hovering.current) { hovering.current = true; medir(); levantar(true) }
    magnify(e.clientX - rect.left)
    moverA(objetivoDesde(e.clientX, rect.left), { response: 0.22, damping: 1 })
  }

  const onHoverLeave = (e) => {
    if (e.pointerType !== 'mouse' || !hovering.current) return
    hovering.current = false
    if (gesture.current) return
    levantar(false)
    magnify(null)
    moverA(centers()[activeRef.current], { response: 0.4, damping: 1 })
  }

  return (
    <nav
      ref={navRef}
      aria-label='Navegación principal'
      className='nf-glass nf-tabbar'
      data-hidden={hidden}
      onPointerDown={onPointerDown}
      onPointerMove={onHoverMove}
      onPointerLeave={onHoverLeave}
    >
      {/* Lente: tinte, borde de luz, brillo especular y resplandor */}
      <div ref={pillRef} className='nf-tabbar-pill' data-lifted='false' aria-hidden='true'>
        <span className='nf-tabbar-pill-shine' />
      </div>

      {TABS.map((tab, i) => {
        const label = tab.id === 'chat' ? 'Bruce' : labels[i]
        return (
          <button
            key={tab.id}
            ref={el => (btnRefs.current[i] = el)}
            onClick={() => onSelect(tab.id)}
            aria-current={tab.id === screen ? 'page' : undefined}
            aria-label={label}
            className='no-press nf-tabbar-btn'
          >
            <span className='nf-tabbar-layer nf-tabbar-base'>
              <Contenido tab={tab} label={label} batman={false} />
            </span>
            <span ref={el => (litRefs.current[i] = el)} className='nf-tabbar-layer nf-tabbar-lit' aria-hidden='true'>
              <Contenido tab={tab} label={label} batman={tab.avatar && batman} />
            </span>
          </button>
        )
      })}
    </nav>
  )
}
