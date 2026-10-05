import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import {
  IconCheck, IconChevronRight, IconChevronUp, IconChevronDown, IconPlus, IconX,
  IconClock, IconPencil, IconTrash, IconSearch, IconPalette, IconBarbell,
  IconReplace, IconArrowsExchange, IconSparkles, IconBooks, IconChevronLeft, IconLock,
} from '@tabler/icons-react'
import {
  registrarSesion, getSesionesSemana,
  getRutinas, crearRutina, editarRutina, eliminarRutina, asignarSemana,
  getEjercicios, crearEjercicio,
} from '../api'
import Sheet, { SheetHeader } from '../components/Sheet'
import { toast } from '../lib/toast'
import { haptic, useEntrada, project, rubberband, velocityFrom, prefersReducedMotion } from '../lib/motion'
import { BibliotecaSheet, GenerarSheet } from '../components/GymExtras'
import bruceGym from '../assets/bruce-tuxedo-determinado.webp'

// Fecha local (no UTC): en Colombia, después de las 7 pm toISOString ya da mañana
const fechaLocal = (d = new Date()) => d.toLocaleDateString('en-CA')

const sinClave = (obj, clave) => {
  const copia = { ...obj }
  delete copia[clave]
  return copia
}

// ─── DATOS BASE ────────────────────────────────────────────────────────────────


// Colores para las rutinas: los mismos tonos del sistema de diseño, pensados para fondo oscuro
const PALETA = ['#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#fbbf24', '#2dd4bf', '#22d3ee', '#a3a3a3']
const NOMBRE_COLOR = ['Verde', 'Azul', 'Morado', 'Rosa', 'Rojo', 'Naranja', 'Amarillo', 'Turquesa', 'Cian', 'Gris']

const COLORES_DESCANSO = { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', text: '#9ca3af', glow: 'transparent' }

// Toda la paleta de una rutina sale de su color (hex + alfa)
function coloresDe(rutina) {
  const hex = rutina?.color
  if (!hex) return COLORES_DESCANSO
  return { text: hex, bg: `${hex}1f`, border: `${hex}33`, glow: `${hex}4d` }
}

const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

// Semanas de calendario, de lunes a domingo. 0 = esta semana, -1 = la pasada.
// El orden de los días nunca cambia: hoy se resalta donde caiga.
const SEMANA_MAS_ANTIGUA = -1
const semanaDe = (offset) => {
  const lunes = new Date()
  lunes.setHours(12, 0, 0, 0)
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7) + offset * 7)
  return [...Array(7)].map((_, i) => {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    return { fecha: fechaLocal(d), dayOfWeek: i, d }
  })
}
const rangoSemana = (semana) => {
  const [a, b] = [semana[0].d, semana[6].d]
  const mes = (d) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${mes(b)}`
    : `${a.getDate()} ${mes(a)} – ${b.getDate()} ${mes(b)}`
}
const DIAS_ABR    = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MAX_POR_DIA = 3

// "lunes y jueves", "lunes, miércoles y viernes"
const listaDias = (dias) => {
  const n = dias.map(d => NOMBRES_DIA[d])
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

const COLORES_MUSCULO = {
  'Piernas':  { text: '#4ade80', bg: 'rgba(74,222,128,0.14)' },
  'Pecho':    { text: '#60a5fa', bg: 'rgba(96,165,250,0.14)' },
  'Hombros':  { text: '#60a5fa', bg: 'rgba(96,165,250,0.14)' },
  'Espalda':  { text: '#a78bfa', bg: 'rgba(167,139,250,0.14)' },
  'Brazos':   { text: '#a78bfa', bg: 'rgba(167,139,250,0.14)' },
  'Core':     { text: '#4ade80', bg: 'rgba(74,222,128,0.14)' },
  'Cardio':   { text: '#fb923c', bg: 'rgba(251,146,60,0.14)' },
}

function colorParaEjercicio(ex, colorFallback) {
  if (ex.custom && ex.color) return { text: ex.color, bg: ex.color + '26' }
  return COLORES_MUSCULO[ex.musculo] ?? { text: colorFallback, bg: colorFallback + '20' }
}

function getEjercicioColor(ex, pool) {
  if (ex.custom && ex.color) return { text: ex.color, bg: ex.color + '26' }
  if (ex.musculo) return COLORES_MUSCULO[ex.musculo] ?? null
  const fromPool = pool.find(p => p.nombre === ex.nombre)
  if (fromPool?.musculo) return COLORES_MUSCULO[fromPool.musculo] ?? null
  return null
}

// ─── UID DE EJERCICIO ──────────────────────────────────────────────────────────
// Cada ejercicio de una rutina tiene un uid estable: lo marcado, las series y
// las notas se guardan por uid, nunca por posición. Así borrar, mover o renombrar
// un ejercicio no le pasa sus datos a otro. El servidor conserva los que mandamos.
const nuevoUid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
const uidDe    = (ex, i) => ex.uid ?? `pos${i}`
// Solo cuenta lo marcado que sigue existiendo en la rutina
const hechosDe = (lista, rutina) => (lista ?? []).filter(u => rutina.ejercicios.some((ex, i) => uidDe(ex, i) === u))

// ─── RESUMEN SEMANAL ───────────────────────────────────────────────────────────
function ResumenSemanal({ semana, completados, rutinasDe, clave, pool, pasada }) {
  let diasActivos = 0
  const musculosSemana = new Set()
  semana.forEach(({ fecha, dayOfWeek }) => {
    let activo = false
    for (const rutina of rutinasDe(fecha, dayOfWeek)) {
      for (const uid of completados[clave(fecha, rutina.id)] ?? []) {
        const ex = rutina.ejercicios.find((e, i) => uidDe(e, i) === uid)
        if (!ex) continue
        activo = true
        const musculo = ex.musculo || pool.find(p => p.nombre === ex.nombre)?.musculo
        if (musculo) musculosSemana.add(musculo)
      }
    }
    if (activo) diasActivos++
  })

  return (
    <div className='nf-card' style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', marginBottom: '16px' }}>
      <div style={{ textAlign: 'center', minWidth: '52px' }}>
        <p className='nf-num' style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: diasActivos > 0 ? 'var(--green)' : 'var(--label-3)' }}>
          {diasActivos}
        </p>
        <p className='nf-caption' style={{ marginTop: '2px', fontWeight: 600 }}>{pasada ? (diasActivos === 1 ? 'día entrenado' : 'días entrenados') : 'esta semana'}</p>
      </div>
      <div style={{ width: '0.5px', alignSelf: 'stretch', background: 'var(--separator)' }} />
      <div style={{ flex: 1 }}>
        {musculosSemana.size > 0 ? (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[...musculosSemana].map(m => {
              const col = COLORES_MUSCULO[m] ?? { text: '#4ade80' }
              return <span key={m} className='nf-badge' style={{ '--tint': col.text }}>{m}</span>
            })}
          </div>
        ) : (
          <p className='nf-footnote'>{pasada ? 'Sin sesiones registradas esa semana.' : 'Aún sin actividad esta semana. El primer set es el más difícil.'}</p>
        )}
      </div>
    </div>
  )
}

// ─── TIRA DE LA SEMANA ─────────────────────────────────────────────────────────
// Encabezado con ‹ › y la fila de 7 días, que se puede arrastrar entre semanas:
// sigue al dedo 1:1, resiste en los bordes (rubber-band) y al soltar proyecta
// el momentum para decidir si cambia de semana.
// El cambio es inmediato y la semana nueva entra con un desplazamiento corto
// desde el lado del que viene (32 px, 260 ms, ease-out fuerte, con un blur que
// une las dos semanas). Todo con WAAPI: corre fuera del hilo principal.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const ENTRADA_PX = 32

function TiraSemana({ offset, semana, onCambiar, children }) {
  const tiraRef  = useRef(null)
  const tituloRef = useRef(null)
  const x        = useRef(0)
  const gesto    = useRef(null)
  const huboArrastre = useRef(false)
  const pasada   = offset < 0

  const puede = (dir) => (dir > 0 ? offset > SEMANA_MAS_ANTIGUA : offset < 0)   // dir > 0: hacia la anterior
  const ancho = () => tiraRef.current?.offsetWidth || 320
  // Durante el arrastre: 1:1 con el dedo, sin transición
  const aplicar = (val) => {
    x.current = val
    const el = tiraRef.current
    if (!el) return
    el.style.transform = val ? `translate3d(${val}px, 0, 0)` : ''
    el.style.opacity = val ? String(1 - Math.min(Math.abs(val) / ancho(), 1) * 0.4) : ''
  }
  const cancelarAnimaciones = () => {
    tiraRef.current?.getAnimations().forEach(a => a.cancel())
    tituloRef.current?.getAnimations().forEach(a => a.cancel())
  }

  // La semana nueva ya está en pantalla: entra desde el lado del que viene
  const entrar = (dir) => {
    const el = tiraRef.current, titulo = tituloRef.current
    aplicar(0)
    if (!el) return
    if (prefersReducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease' })
      return
    }
    el.animate([
      { transform: `translate3d(${-dir * ENTRADA_PX}px, 0, 0)`, opacity: 0, filter: 'blur(3px)' },
      { transform: 'translate3d(0, 0, 0)', opacity: 1, filter: 'blur(0)' },
    ], { duration: 260, easing: EASE_OUT })
    titulo?.animate([
      { transform: `translate3d(${-dir * 8}px, 0, 0)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ], { duration: 220, easing: EASE_OUT })
  }

  // dir > 0 = ir a la semana anterior (la nueva entra desde la izquierda)
  const ir = (dir) => {
    if (!puede(dir)) return
    haptic(6)
    cancelarAnimaciones()
    flushSync(() => onCambiar(offset - dir))
    entrar(dir)
  }

  // Soltó sin cambiar de semana: vuelve rápido desde donde quedó el dedo
  const volver = () => {
    const el = tiraRef.current
    const desde = x.current
    aplicar(0)
    if (!el || !desde) return
    el.animate([
      { transform: `translate3d(${desde}px, 0, 0)`, opacity: 1 - Math.min(Math.abs(desde) / ancho(), 1) * 0.4 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ], { duration: 200, easing: EASE_OUT })
  }

  useEffect(() => () => cancelarAnimaciones(), [])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    gesto.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: x.current, activo: false, muestras: [] }
    huboArrastre.current = false
  }
  const onPointerMove = (e) => {
    const g = gesto.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0
    if (!g.activo) {
      // Histéresis: primero se decide si es horizontal; si es vertical, es scroll
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesto.current = null; return }
      if (Math.abs(dx) < 10) return
      g.activo = true
      huboArrastre.current = true
      cancelarAnimaciones()
      tiraRef.current?.setPointerCapture?.(e.pointerId)
    }
    const w = ancho()
    let val = g.base + dx
    if ((val > 0 && !puede(1)) || (val < 0 && !puede(-1))) val = rubberband(val, w)
    aplicar(val)
    g.muestras.push({ x: e.clientX, t: performance.now() })
    if (g.muestras.length > 8) g.muestras.shift()
  }
  const onPointerUp = (e) => {
    const g = gesto.current
    gesto.current = null
    if (!g?.activo || e.pointerId !== g.id) return
    const v = velocityFrom(g.muestras)
    const destino = x.current + project(v)
    const dir = Math.sign(destino)
    // Un gesto rápido basta aunque haya sido corto (proyección del momentum)
    if (Math.abs(destino) > ancho() * 0.3 && puede(dir)) ir(dir)
    else volver()
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 4px', marginBottom: '8px' }}>
        <p ref={tituloRef} aria-live='polite' style={{ minWidth: 0 }}>
          <span className='nf-headline'>{pasada ? 'Semana pasada' : 'Esta semana'}</span>
          <span className='nf-footnote nf-num' style={{ marginLeft: '6px' }}>{rangoSemana(semana)}</span>
        </p>
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          <button onClick={() => ir(1)} disabled={!puede(1)} className='nf-icon-btn' aria-label='Semana anterior'
            style={{ color: puede(1) ? 'var(--green)' : 'var(--label-4)' }}>
            <IconChevronLeft size={22} />
          </button>
          <button onClick={() => ir(-1)} disabled={!puede(-1)} className='nf-icon-btn' aria-label='Semana siguiente'
            style={{ color: puede(-1) ? 'var(--green)' : 'var(--label-4)' }}>
            <IconChevronRight size={22} />
          </button>
        </div>
      </div>
      <div style={{ overflow: 'hidden', margin: '0 -16px', padding: '0 16px' }}>
        <div
          ref={tiraRef}
          role='tablist'
          aria-label={`Días de ${pasada ? 'la semana pasada' : 'esta semana'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // Un arrastre no debe terminar seleccionando el día donde se soltó
          onClickCapture={(e) => { if (huboArrastre.current) { e.stopPropagation(); e.preventDefault(); huboArrastre.current = false } }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', touchAction: 'pan-y' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── CONFETTI ──────────────────────────────────────────────────────────────────
function Confetti({ color }) {
  const [particles] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      delay: Math.random() * 0.3,
      size: 4 + Math.random() * 5,
      round: Math.random() > 0.5,
      hue: Math.random() > 0.5 ? color : '#fff',
    }))
  )
  return (
    <div aria-hidden='true' style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit', zIndex: 10 }}>
      {particles.map(p => (
        <div key={p.id} className='nf-confetti' style={{
          position: 'absolute', left: `${p.x}%`, top: '-8px',
          width: `${p.size}px`, height: `${p.size}px`,
          background: p.hue, borderRadius: p.round ? '50%' : '2px',
          animation: `nf-confetti 1.1s cubic-bezier(0.55, 0, 1, 0.45) ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  )
}

// ─── TIMER DE DESCANSO ─────────────────────────────────────────────────────────
function RestTimer({ color, onClose }) {
  const OPTIONS = [60, 90, 120]
  const [sel, setSel] = useState(90)
  const [remaining, setRemaining] = useState(null)
  const intervalRef = useRef(null)

  const start = (secs) => {
    clearInterval(intervalRef.current)
    setRemaining(secs)
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); haptic(40); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const done = remaining === 0
  const pct  = remaining !== null ? remaining / sel : 1
  const r    = 22
  const circ = 2 * Math.PI * r
  const mmss = remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : null

  return (
    <div className='nf-reveal' style={{
      background: 'var(--surface-2)', borderRadius: '16px', padding: '12px 8px 12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ position: 'relative', width: '54px', height: '54px', flexShrink: 0 }} role='timer' aria-label={done ? 'Descanso terminado' : mmss ? `Quedan ${remaining} segundos` : 'Temporizador listo'}>
        <svg width='54' height='54' style={{ transform: 'rotate(-90deg)' }} aria-hidden='true'>
          <circle cx='27' cy='27' r={r} fill='none' stroke='rgba(255,255,255,0.08)' strokeWidth='4' />
          <circle cx='27' cy='27' r={r} fill='none' stroke={done ? 'var(--green)' : color}
            strokeWidth='4' strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap='round'
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className='nf-num' style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700, color: done ? 'var(--green)' : 'var(--label)',
        }}>
          {done ? <IconCheck size={20} strokeWidth={3} /> : mmss ?? <IconClock size={18} color={color} />}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
          {OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { setSel(s); start(s) }}
              className='nf-chip nf-chip--soft nf-num'
              aria-pressed={sel === s && remaining !== null}
              style={{ '--tint': color, justifyContent: 'center', padding: 0, minHeight: '34px', fontSize: '13px' }}
            >
              {s}s
            </button>
          ))}
        </div>
        <p className='nf-caption' style={{ color: done ? 'var(--green)' : undefined }}>
          {done ? '¡Listo, a la siguiente serie!' : remaining !== null ? 'Descansando…' : 'Elige el descanso'}
        </p>
      </div>

      <button onClick={onClose} className='nf-icon-btn nf-icon-btn--sm' aria-label='Cerrar temporizador'>
        <IconX size={18} />
      </button>
    </div>
  )
}

// ─── CREAR EJERCICIO PERSONALIZADO ──────────────────────────────────────────────
function Label({ children }) {
  return <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>{children}</span>
}

function CrearEjercicioForm({ onCrear, onCancel }) {
  const [nombre, setNombre]   = useState('')
  const [musculo, setMusculo] = useState('')
  const [series, setSeries]   = useState('3')
  const [reps, setReps]       = useState('10')
  const [peso, setPeso]       = useState('')
  const [color, setColor]     = useState('#4ade80')

  const puedeCrear = nombre.trim().length > 0

  const handleSubmit = () => {
    if (!puedeCrear) return
    onCrear({
      nombre: nombre.trim(),
      musculo: musculo.trim() || 'Personalizado',
      series: Number(series) || 1,
      reps: reps.trim() || '—',
      peso: peso.trim() || '—',
      color,
      custom: true,
    })
    setNombre(''); setMusculo(''); setSeries('3'); setReps('10'); setPeso('')
  }

  return (
    <div className='nf-card nf-reveal' style={{ padding: '14px', marginBottom: '14px', background: 'var(--surface-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <p className='nf-headline' style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconPalette size={18} color={color} /> Nuevo ejercicio
        </p>
        <button onClick={onCancel} className='nf-icon-btn nf-icon-btn--sm' aria-label='Cancelar'>
          <IconX size={18} />
        </button>
      </div>

      <label style={{ display: 'block', marginBottom: '10px' }}>
        <Label>Nombre del ejercicio</Label>
        <input className='nf-input' value={nombre} onChange={e => setNombre(e.target.value)} placeholder='Ej. Hip thrust' />
      </label>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <label style={{ flex: 1 }}>
          <Label>Categoría / músculo</Label>
          <input className='nf-input' value={musculo} onChange={e => setMusculo(e.target.value)} placeholder='Ej. Glúteos' />
        </label>
        <label style={{ width: '64px', flexShrink: 0 }}>
          <Label>Color</Label>
          <input
            type='color' value={color} onChange={e => setColor(e.target.value)}
            style={{ width: '100%', height: '46px', borderRadius: '12px', border: 'none', background: 'var(--surface-2)', padding: '6px', cursor: 'pointer' }}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <label><Label>Series</Label><input className='nf-input nf-num' type='number' inputMode='numeric' min='1' value={series} onChange={e => setSeries(e.target.value)} /></label>
        <label><Label>Reps</Label><input className='nf-input' value={reps} onChange={e => setReps(e.target.value)} placeholder='10 o 45s' /></label>
        <label><Label>Peso</Label><input className='nf-input' value={peso} onChange={e => setPeso(e.target.value)} placeholder='20 kg' /></label>
      </div>

      <button onClick={handleSubmit} disabled={!puedeCrear} className='nf-btn nf-btn--primary nf-btn--block' style={{ '--tint': color }}>
        <IconPlus size={18} /> Crear y agregar
      </button>
    </div>
  )
}

// ─── EDITOR DE RUTINA (hoja) ──────────────────────────────────────────────────
// El último emoji de un texto (un emoji puede ser varios caracteres: 🏋️‍♀️, 🇨🇴)
function ultimoEmoji(texto) {
  const partes = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(texto)].map(p => p.segment)
    : Array.from(texto)
  return partes.reverse().find(p => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(p)) ?? null
}

const EMOJIS = ['💪', '🏃', '🚴', '🏊', '🦾', '🏋️‍♀️', '🧘', '🔁', '🛌', '🔥', '⚡️', '😊', '🥇', '🧠', '💥']

function RutinaEditor({ open, rutina, diasUso = [], pool, onSave, onClose, onEliminar, onCrearEjercicio }) {
  const esNueva = rutina.id == null
  const [ejercicios, setEjercicios] = useState([...rutina.ejercicios])
  const [nombre, setNombre]         = useState(rutina.nombre)
  const [emoji, setEmoji]           = useState(rutina.emoji || '💪')
  const [color, setColor]           = useState(rutina.color || PALETA[0])
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const colores = coloresDe({ color })
  const puedeGuardar = nombre.trim().length > 0
  const [vistaPool, setVistaPool]   = useState(false)
  const [busqueda, setBusqueda]     = useState('')
  const [filtroMus, setFiltroMus]   = useState('Todos')
  const [mostrarCrear, setMostrarCrear]     = useState(false)
  const [mostrarPalette, setMostrarPalette] = useState(false)

  const musculos = ['Todos', ...new Set(pool.map(e => e.musculo))]

  const poolFiltrado = pool.filter(e => {
    const matchMus = filtroMus === 'Todos' || e.musculo === filtroMus
    const matchBus = e.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const yaEsta   = ejercicios.some(ex => ex.nombre === e.nombre)
    return matchMus && matchBus && !yaEsta
  })

  const agregarDelPool  = (ex) => { setEjercicios(prev => [...prev, { ...ex, uid: nuevoUid() }]); haptic(6) }
  const quitarEjercicio = (idx) => setEjercicios(prev => prev.filter((_, i) => i !== idx))

  const moverEjercicio = (idx, dir) => {
    setEjercicios(prev => {
      const arr = [...prev]
      const target = idx + dir
      if (target < 0 || target >= arr.length) return arr
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }

  const handleCrearEjercicio = (nuevo) => {
    onCrearEjercicio(nuevo)
    agregarDelPool(nuevo)
    setMostrarCrear(false)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      large
      label={esNueva ? 'Nueva rutina' : 'Editar rutina'}
      header={
        <>
          <SheetHeader
            title={esNueva ? 'Nueva rutina' : 'Editar rutina'}
            left={<button className='nf-btn nf-btn--plain' onClick={onClose} style={{ color: 'var(--label-2)' }}>Cancelar</button>}
            right={
              <button
                className='nf-btn nf-btn--plain'
                disabled={!puedeGuardar}
                onClick={() => onSave({ nombre: nombre.trim(), ejercicios, emoji, color })}
                style={{ '--tint': colores.text, fontWeight: 700, opacity: puedeGuardar ? 1 : 0.4 }}
              >
                {esNueva ? 'Crear' : 'Guardar'}
              </button>
            }
          />
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setMostrarPalette(p => !p)}
                aria-label='Cambiar emoji de la rutina'
                aria-expanded={mostrarPalette}
                style={{ width: '48px', height: '48px', borderRadius: '14px', background: colores.bg, fontSize: '24px', flexShrink: 0, transition: 'background-color 200ms ease' }}
              >
                {emoji}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  aria-label='Nombre de la rutina'
                  placeholder='Nombre, ej. Brazo'
                  maxLength={100}
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.016em' }}
                />
                <p className='nf-caption'>
                  {ejercicios.length} ejercicios
                  {diasUso.length > 1 && ` · se usa el ${listaDias(diasUso)}`}
                </p>
              </div>
            </div>
            {mostrarPalette && (
              <div className='nf-reveal' style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => { setEmoji(em); setMostrarPalette(false) }}
                    aria-label={`Usar ${em}`}
                    style={{ width: '40px', height: '40px', borderRadius: '10px', background: emoji === em ? colores.bg : 'rgba(255,255,255,0.05)', fontSize: '20px' }}>
                    {em}
                  </button>
                ))}
                {/* Cualquier emoji: se escribe o pega con el teclado de emojis */}
                <input
                  aria-label='Otro emoji'
                  placeholder='Otro emoji…'
                  value=''
                  enterKeyHint='done'
                  onChange={e => {
                    const nuevo = ultimoEmoji(e.target.value)
                    if (nuevo) { setEmoji(nuevo); setMostrarPalette(false); haptic(6) }
                    else toast('Usa el teclado de emojis 🙂 para elegir uno.')
                  }}
                  className='nf-input'
                  style={{ flex: '1 0 100%', height: '40px', minHeight: 0, fontSize: '16px', marginTop: '2px' }}
                />
              </div>
            )}
            <div role='radiogroup' aria-label='Color de la rutina' style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px' }}>
              {PALETA.map((c, i) => {
                const activo = c === color
                return (
                  <button
                    key={c}
                    role='radio'
                    aria-checked={activo}
                    aria-label={NOMBRE_COLOR[i]}
                    onClick={() => { setColor(c); haptic(6) }}
                    className='nf-swatch'
                    style={{ '--swatch': c }}
                    data-activo={activo}
                  />
                )
              })}
            </div>
            <div className='nf-seg' role='tablist' style={{ marginTop: '14px' }}>
              <div className='nf-seg-thumb' aria-hidden='true' style={{ width: 'calc((100% - 6px) / 2)', transform: `translateX(${vistaPool ? 100 : 0}%)` }} />
              <button role='tab' aria-selected={!vistaPool} onClick={() => setVistaPool(false)}>Mi rutina ({ejercicios.length})</button>
              <button role='tab' aria-selected={vistaPool} onClick={() => setVistaPool(true)}>Agregar ejercicios</button>
            </div>
          </div>
        </>
      }
    >
      <div style={{ padding: '0 16px calc(var(--safe-bottom) + 32px)' }}>
        {!vistaPool ? (
          ejercicios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <IconBarbell size={32} color='var(--label-3)' style={{ margin: '0 auto 8px', display: 'block' }} />
              <p className='nf-headline'>Sin ejercicios aún</p>
              <p className='nf-footnote' style={{ marginBottom: '16px' }}>Agrégalos desde la lista de ejercicios.</p>
              <button className='nf-btn nf-btn--tinted' style={{ '--tint': colores.text }} onClick={() => setVistaPool(true)}>
                <IconPlus size={18} /> Agregar ejercicios
              </button>
            </div>
          ) : (
            <div className='nf-card' style={{ overflow: 'hidden', background: 'var(--surface-3)' }}>
              {ejercicios.map((ex, i) => (
                <div key={uidDe(ex, i)} className='nf-row' style={{ padding: '6px 4px 6px 4px', gap: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moverEjercicio(i, -1)} disabled={i === 0} className='nf-icon-btn nf-icon-btn--sm' style={{ height: '28px', opacity: i === 0 ? 0.25 : 1 }} aria-label={`Subir ${ex.nombre}`}>
                      <IconChevronUp size={18} />
                    </button>
                    <button onClick={() => moverEjercicio(i, 1)} disabled={i === ejercicios.length - 1} className='nf-icon-btn nf-icon-btn--sm' style={{ height: '28px', opacity: i === ejercicios.length - 1 ? 0.25 : 1 }} aria-label={`Bajar ${ex.nombre}`}>
                      <IconChevronDown size={18} />
                    </button>
                  </div>
                  {ex.custom && ex.color && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ex.color, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: '4px' }}>
                    <p style={{ fontSize: '15px', fontWeight: 500 }}>{ex.nombre}</p>
                    <p className='nf-caption nf-num'>{ex.series}×{ex.reps} · {ex.peso}</p>
                  </div>
                  <button onClick={() => quitarEjercicio(i)} className='nf-icon-btn' aria-label={`Quitar ${ex.nombre}`} style={{ color: 'var(--red)' }}>
                    <IconTrash size={18} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {!mostrarCrear ? (
              <button onClick={() => setMostrarCrear(true)} className='nf-btn nf-btn--tinted nf-btn--block' style={{ '--tint': colores.text, marginBottom: '12px' }}>
                <IconPalette size={18} /> Crear ejercicio personalizado
              </button>
            ) : (
              <CrearEjercicioForm onCrear={handleCrearEjercicio} onCancel={() => setMostrarCrear(false)} />
            )}

            <label style={{ position: 'relative', display: 'block', marginBottom: '10px' }}>
              <IconSearch size={18} color='var(--label-3)' style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type='search'
                enterKeyHint='search'
                className='nf-input'
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder='Buscar ejercicio'
                aria-label='Buscar ejercicio'
                style={{ paddingLeft: '38px', background: 'rgba(118,118,128,0.24)', border: 'none' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0 12px', margin: '0 -16px', paddingLeft: '16px', paddingRight: '16px', touchAction: 'pan-x pan-y' }}>
              {musculos.map(m => {
                const mc = COLORES_MUSCULO[m] ?? { text: colores.text }
                return (
                  <button key={m} onClick={() => setFiltroMus(m)} className='nf-chip' aria-pressed={filtroMus === m} style={{ '--tint': mc.text, flexShrink: 0 }}>
                    {m}
                  </button>
                )
              })}
            </div>

            {poolFiltrado.length === 0 ? (
              <p className='nf-footnote' style={{ textAlign: 'center', padding: '24px 0' }}>No hay ejercicios que coincidan.</p>
            ) : (
              <div className='nf-card' style={{ overflow: 'hidden', background: 'var(--surface-3)' }}>
                {poolFiltrado.map((ex, i) => {
                  const mc = colorParaEjercicio(ex, colores.text)
                  return (
                    <div key={`${ex.nombre}-${i}`} className='nf-row' style={{ paddingRight: '4px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '3px' }}>{ex.nombre}</p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className='nf-badge' style={{ '--tint': mc.text, height: '20px', fontSize: '11px' }}>{ex.musculo}</span>
                          <span className='nf-caption nf-num'>{ex.series}×{ex.reps} · {ex.peso}</span>
                        </div>
                      </div>
                      <button onClick={() => agregarDelPool(ex)} className='nf-icon-btn' aria-label={`Agregar ${ex.nombre}`} style={{ color: mc.text }}>
                        <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: mc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconPlus size={18} strokeWidth={2.2} />
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Borrar: dos toques en vez de un diálogo; el segundo confirma */}
        {!vistaPool && !esNueva && (
          <button
            onClick={() => {
              if (!confirmarBorrar) {
                setConfirmarBorrar(true)
                setTimeout(() => setConfirmarBorrar(false), 3000)
                return
              }
              onEliminar()
            }}
            className='nf-btn nf-btn--destructive nf-btn--block'
            style={{ marginTop: '20px' }}
            aria-live='polite'
          >
            <IconTrash size={17} />
            {confirmarBorrar ? 'Toca otra vez para eliminar' : 'Eliminar rutina'}
          </button>
        )}
        {!vistaPool && !esNueva && diasUso.length > 0 && (
          <p className='nf-caption' style={{ textAlign: 'center', marginTop: '8px' }}>
            Si la eliminas, el {listaDias(diasUso)} quedará de descanso.
          </p>
        )}
      </div>
    </Sheet>
  )
}

// ─── CAMBIAR LAS RUTINAS DE UN DÍA ──────────────────────────────────────────────
// Se despliega bajo el encabezado del día (anclado a lo que se está cambiando).
// Tocar una rutina la agrega o la quita de ese día (doble entreno: hasta 3);
// intercambiar mueve los paquetes completos entre dos días.
function PanelCambiar({ abierto, dow, plan, lib, sesionFija, onAlternar, onDescanso, onIntercambiar, onNueva, onEditar }) {
  const actuales = plan[dow] ?? []
  const rutinas  = Object.values(lib)
  // Las que no están en ningún día no tienen tarjeta: sin esto no habría cómo editarlas ni borrarlas
  const usadas   = new Set(Object.values(plan).flat())
  const sueltas  = rutinas.filter(r => !usadas.has(r.id))
  const dia      = NOMBRES_DIA[dow]
  const plural   = dia.endsWith('s') ? dia : `${dia}s`
  return (
    <div className='nf-collapse' data-open={abierto} aria-hidden={!abierto}>
      <div>
        <div style={{ padding: '4px 16px 16px' }}>
          <p className='nf-caption' style={{ fontWeight: 600, marginBottom: '8px' }}>
            Rutinas del {dia} <span style={{ fontWeight: 400 }}>· toca para agregar o quitar</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {rutinas.map(r => (
              <button
                key={r.id}
                tabIndex={abierto ? 0 : -1}
                onClick={() => onAlternar(dow, r.id)}
                className='nf-chip'
                aria-pressed={actuales.includes(r.id)}
                style={{ '--tint': r.color }}
              >
                {actuales.includes(r.id) ? <IconCheck size={14} strokeWidth={3} /> : <span aria-hidden='true'>{r.emoji}</span>} {r.nombre}
              </button>
            ))}
            <button tabIndex={abierto ? 0 : -1} onClick={() => onDescanso(dow)} className='nf-chip' aria-pressed={actuales.length === 0} style={{ '--tint': COLORES_DESCANSO.text }}>
              <span aria-hidden='true'>🛌</span> Descanso
            </button>
            <button tabIndex={abierto ? 0 : -1} onClick={() => onNueva(dow)} className='nf-chip' style={{ '--tint': 'var(--label-2)' }}>
              <IconPlus size={15} /> Nueva rutina
            </button>
          </div>

          {sueltas.length > 0 && (<>
            <p className='nf-caption' style={{ fontWeight: 600, margin: '16px 0 8px' }}>
              Sin día asignado <span style={{ fontWeight: 400 }}>· toca para editar o eliminar</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {sueltas.map(r => (
                <button
                  key={r.id}
                  tabIndex={abierto ? 0 : -1}
                  onClick={() => onEditar(r)}
                  className='nf-chip'
                  aria-label={`Editar ${r.nombre}`}
                  style={{ '--tint': 'var(--label-2)' }}
                >
                  <span aria-hidden='true'>{r.emoji}</span> {r.nombre} <IconPencil size={13} aria-hidden='true' />
                </button>
              ))}
            </div>
          </>)}

          <p className='nf-caption' style={{ fontWeight: 600, margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <IconArrowsExchange size={14} /> Intercambiar con otro día
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {[0, 1, 2, 3, 4, 5, 6].filter(d => d !== dow).map(d => {
              const del = (plan[d] ?? []).map(id => lib[id]).filter(Boolean)
              const c = coloresDe(del[0])
              return (
                <button
                  key={d}
                  tabIndex={abierto ? 0 : -1}
                  onClick={() => onIntercambiar(dow, d)}
                  aria-label={`Intercambiar ${dia} con ${NOMBRES_DIA[d]} (${del.map(r => r.nombre).join(' y ') || 'Descanso'})`}
                  className='nf-press-soft'
                  style={{
                    height: '52px', borderRadius: '12px', background: c.bg,
                    boxShadow: `inset 0 0 0 0.5px ${c.border}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: c.text }}>{DIAS_ABR[d]}</span>
                  <span aria-hidden='true' style={{ fontSize: '14px', lineHeight: 1, letterSpacing: '-2px' }}>
                    {del.length ? del.map(r => r.emoji).join('') : '🛌'}
                  </span>
                </button>
              )
            })}
          </div>

          <p className='nf-caption' style={{ marginTop: '10px' }}>
            {sesionFija
              ? `Esta fecha ya tiene sesiones guardadas; el cambio aplica desde el próximo ${dia}.`
              : `El cambio aplica a todos los ${plural}.`}
          </p>
        </div>
      </div>
    </div>
  )
}

// Días pasados: registrar una rutina distinta a la planeada, solo para esa fecha.
// El plan semanal no cambia (por eso cambiar un día pasado ya no desconfigura nada).
function PanelOtraRutina({ abierto, lib, delDia, fijas, onAlternar }) {
  return (
    <div className='nf-collapse' data-open={abierto} aria-hidden={!abierto}>
      <div>
        <div style={{ padding: '4px 16px 16px' }}>
          <p className='nf-caption' style={{ fontWeight: 600, marginBottom: '8px' }}>
            ¿Qué hiciste ese día? <span style={{ fontWeight: 400 }}>· solo cambia esta fecha, no tu plan</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.values(lib).map(r => {
              const puesta = delDia.includes(r.id)
              const fija = fijas.includes(r.id)
              return (
                <button
                  key={r.id}
                  tabIndex={abierto ? 0 : -1}
                  onClick={() => !fija && onAlternar(r.id)}
                  aria-disabled={fija}
                  className='nf-chip'
                  aria-pressed={puesta}
                  style={{ '--tint': r.color, opacity: fija ? 0.6 : 1 }}
                >
                  {puesta ? <IconCheck size={14} strokeWidth={3} /> : <span aria-hidden='true'>{r.emoji}</span>} {r.nombre}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SERIES ────────────────────────────────────────────────────────────────────
// Cada ejercicio hecho guarda sus series una a una: [{ reps, peso }] como texto
// mientras se editan; al guardar viajan como series_detalle.
const MAX_SERIES = 20
const numero = (v) => String(v ?? '').replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? ''

// La última vez antes de `fecha` que se hizo ese ejercicio. `historial` viene
// con GET /rutinas/ (ultimos): por nombre en minúsculas, de viejo a nuevo.
const ultimaVez = (historial, nombre, fecha) => {
  const regs = historial[nombre.toLowerCase()] ?? []
  for (let i = regs.length - 1; i >= 0; i--) if (regs[i].fecha < fecha) return regs[i]
  return null
}

// Las series empiezan como la última vez; si nunca se hizo, como dice la rutina.
// También convierte un registro guardado (con o sin detalle) en series editables.
function seriesIniciales(ex, previo) {
  if (previo?.series_detalle?.length) {
    return previo.series_detalle.map(d => ({ reps: d.reps != null ? String(d.reps) : '', peso: d.peso_kg != null ? String(d.peso_kg) : '' }))
  }
  const base = previo ?? { series: ex?.series, reps: ex?.reps, peso_kg: numero(ex?.peso) }
  const n    = Math.min(Math.max(Number(base.series) || 3, 1), MAX_SERIES)
  const reps = String(base.reps ?? '').split('-')
  const peso = base.peso_kg != null ? numero(base.peso_kg) : ''
  return Array.from({ length: n }, (_, i) => ({ reps: numero(reps.length === n ? reps[i] : reps[0]), peso }))
}

const textoSerie = ({ reps, peso }) =>
  peso && reps ? `${peso} kg × ${reps}` : peso ? `${peso} kg` : reps ? `${reps} reps` : 'Sin datos'

const textoPrevio = (previo) => previo.series_detalle?.length
  ? previo.series_detalle.map(d => d.peso_kg != null && d.reps != null ? `${d.peso_kg}×${d.reps}` : d.peso_kg != null ? `${d.peso_kg} kg` : `${d.reps} reps`).join(' · ')
  : `${previo.series}×${previo.reps}${previo.peso_kg != null ? ` · ${previo.peso_kg} kg` : ''}`

// Las series de un ejercicio: cada una se despliega para editar reps y peso.
// Solo una abierta a la vez, como un acordeón de iOS.
function ListaSeries({ series, onCambiar, color, activa, previo }) {
  const [abierta, setAbierta] = useState(null)
  const tab = activa ? 0 : -1

  const cambiar = (i, campo, valor) => onCambiar(series.map((x, n) => (n === i ? { ...x, [campo]: valor } : x)))

  const agregar = () => {
    if (series.length >= MAX_SERIES) return
    haptic(6)
    // La nueva copia la anterior: casi siempre se repite carga y reps
    onCambiar([...series, { ...(series.at(-1) ?? { reps: '', peso: '' }) }])
    setAbierta(series.length)
  }

  const quitar = (i, fila) => {
    haptic(10)
    const borrar = () => {
      onCambiar(series.filter((_, n) => n !== i))
      setAbierta(null)
    }
    if (prefersReducedMotion() || !fila?.animate) return borrar()
    // Se encoge y se desvanece antes de salir: nada desaparece de golpe
    fila.style.overflow = 'hidden'
    fila.animate(
      [{ height: `${fila.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0, marginTop: '-6px' }],
      { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    ).onfinish = () => { fila.style.overflow = ''; borrar() }
  }

  return (
    <div>
      {previo && (
        <p className='nf-caption nf-num' style={{ margin: '0 0 8px 4px' }}>
          La última vez: <span style={{ color: 'var(--label-2)' }}>{textoPrevio(previo)}</span>
        </p>
      )}
      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {series.map((serie, i) => {
          const open = abierta === i
          return (
            <li key={i} className='nf-reveal' style={{
              background: 'var(--surface-2)', borderRadius: '12px',
              boxShadow: open ? `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` : 'inset 0 0 0 0.5px var(--separator)',
              transition: 'box-shadow 200ms ease',
            }}>
              <button
                onClick={() => { haptic(4); setAbierta(open ? null : i) }}
                aria-expanded={open}
                tabIndex={tab}
                className='nf-press-soft'
                style={{ width: '100%', minHeight: '44px', padding: '0 10px 0 8px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}
              >
                <span className='nf-num' style={{
                  width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700,
                  background: `color-mix(in srgb, ${color} 18%, transparent)`, color,
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '15px', fontWeight: 500 }}>Serie {i + 1}</span>
                <span className='nf-num' style={{ fontSize: '15px', color: serie.peso || serie.reps ? 'var(--label)' : 'var(--label-3)' }}>
                  {textoSerie(serie)}
                </span>
                <IconChevronRight size={16} color='var(--label-4)' aria-hidden='true' style={{
                  flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)',
                }} />
              </button>

              <div className='nf-collapse nf-collapse--fade' data-open={open}>
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 44px', gap: '8px', alignItems: 'end', padding: '2px 8px 10px' }}>
                    <label>
                      <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>Peso (kg)</span>
                      <input
                        type='text' inputMode='decimal' enterKeyHint='next'
                        aria-label={`Peso de la serie ${i + 1} en kg`}
                        className='nf-input nf-num'
                        tabIndex={open ? tab : -1}
                        value={serie.peso}
                        placeholder='0'
                        onChange={e => cambiar(i, 'peso', e.target.value)}
                        style={{ '--tint': color, minHeight: '42px', padding: '9px 12px' }}
                      />
                    </label>
                    <label>
                      <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>Reps</span>
                      <input
                        type='text' inputMode='numeric' enterKeyHint='done'
                        aria-label={`Repeticiones de la serie ${i + 1}`}
                        className='nf-input nf-num'
                        tabIndex={open ? tab : -1}
                        value={serie.reps}
                        placeholder='0'
                        onChange={e => cambiar(i, 'reps', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); setAbierta(null) } }}
                        style={{ '--tint': color, minHeight: '42px', padding: '9px 12px' }}
                      />
                    </label>
                    <button
                      onClick={e => quitar(i, e.currentTarget.closest('li'))}
                      className='nf-icon-btn'
                      tabIndex={open ? tab : -1}
                      aria-label={`Quitar serie ${i + 1}`}
                      style={{ color: 'var(--red)', height: '42px' }}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {series.length < MAX_SERIES && (
        <button
          onClick={agregar}
          tabIndex={tab}
          className='nf-btn nf-btn--sm nf-btn--tinted'
          style={{ '--tint': color, marginTop: '8px' }}
        >
          <IconPlus size={15} /> Añadir serie
        </button>
      )}
    </div>
  )
}

// ─── TARJETA DE UNA RUTINA DEL DÍA ─────────────────────────────────────────────
// Con doble entreno hay una por rutina. El chevron la recoge o la despliega.
function TarjetaRutina({
  rutina, fecha, pool, recogida, onRecoger, onEditar,
  hechos, log, onToggle, onLog, guardando, guardado, onGuardar, bloqueada, historial,
}) {
  const [expandido, setExpandido]       = useState({})
  const [timerAbierto, setTimerAbierto] = useState(null)
  const [confetti, setConfetti]         = useState(false)
  const colores   = coloresDe(rutina)
  const total     = rutina.ejercicios.length
  const completa  = total > 0 && hechos.length === total
  const idLista   = `lista-${fecha}-${rutina.id}`

  const alternar = (id) => {
    const terminaAhora = !hechos.includes(id) && hechos.length + 1 === total
    onToggle(id)
    if (terminaAhora) {
      setConfetti(true)
      haptic(30)
      setTimeout(() => setConfetti(false), 1500)
    }
  }

  return (
    <section className='nf-card' style={{
      overflow: 'hidden', position: 'relative', marginBottom: '12px',
      boxShadow: completa ? `inset 0 0 0 1px ${colores.text}80, 0 0 28px ${colores.glow}` : undefined,
      transition: 'box-shadow 400ms ease',
    }}>
      {confetti && <Confetti color={colores.text} />}

      <div style={{
        background: colores.bg,
        padding: '6px 4px 6px 16px',
        display: 'flex', alignItems: 'center', gap: '8px',
        transition: 'background-color 200ms ease',
      }}>
        {/* Todo el encabezado despliega/recoge: objetivo grande y fácil de tocar */}
        <button
          onClick={onRecoger}
          aria-expanded={!recogida}
          aria-controls={idLista}
          className='nf-press-soft'
          style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className='nf-headline' style={{ color: colores.text }}>{rutina.emoji} {rutina.nombre}</span>
              {completa && <span className='nf-badge' style={{ '--tint': colores.text }}><IconCheck size={12} strokeWidth={3} /> Completado</span>}
            </span>
            <span className='nf-footnote nf-num' style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colores.text, opacity: 0.8 }}>
              {bloqueada ? <><IconLock size={13} aria-hidden='true' /> {bloqueada}</> : `${hechos.length} de ${total} ejercicios`}
            </span>
          </span>
          <IconChevronDown size={20} color={colores.text} aria-hidden='true' style={{
            flexShrink: 0, transform: recogida ? 'rotate(-90deg)' : 'none', transition: 'transform 200ms var(--ease-out)',
          }} />
        </button>
        {onEditar && (
          <button onClick={onEditar} className='nf-icon-btn' aria-label={`Editar ${rutina.nombre}`} style={{ color: colores.text }}>
            <IconPencil size={18} />
          </button>
        )}
      </div>

      <div id={idLista} className='nf-collapse' data-open={!recogida}>
        <div>
          <ul style={{ listStyle: 'none' }}>
            {rutina.ejercicios.map((ex, j) => {
              const id         = uidDe(ex, j)
              const hecho      = hechos.includes(id)
              const isExpanded = expandido[id] ?? false
              const logEx      = log[id] ?? {}
              const timerOpen  = timerAbierto === id
              const exColor    = getEjercicioColor(ex, pool)
              const musculo    = ex.musculo || pool.find(p => p.nombre === ex.nombre)?.musculo || ''
              const tab        = recogida ? -1 : 0
              const previo     = ultimaVez(historial, ex.nombre, fecha)
              const series     = logEx.series
              const maxPeso    = series ? Math.max(0, ...series.map(x => Number(numero(x.peso)) || 0)) : 0

              return (
                <li key={id} className='nf-row' style={{ display: 'block', padding: 0, '--row-inset': '60px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px' }}>
                    {/* Check: 44px de área táctil */}
                    <button
                      onClick={() => alternar(id)}
                      role='checkbox'
                      aria-checked={hecho}
                      aria-label={`Marcar ${ex.nombre}`}
                      className='nf-icon-btn'
                      tabIndex={tab}
                      disabled={Boolean(bloqueada)}
                      style={{ opacity: bloqueada ? 0.35 : 1 }}
                    >
                      <span style={{
                        width: '26px', height: '26px', borderRadius: '50%',
                        boxShadow: hecho ? 'none' : 'inset 0 0 0 1.5px var(--label-3)',
                        background: hecho ? colores.text : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background-color 160ms ease, box-shadow 160ms ease, transform 200ms var(--ease-out)',
                        transform: hecho ? 'scale(1)' : 'scale(0.94)',
                      }}>
                        {hecho && <IconCheck size={15} color='#0a0a0a' strokeWidth={3.2} />}
                      </span>
                    </button>

                    {/* Info: toca para registrar peso/reps */}
                    <button
                      onClick={() => {
                        // Al abrirlo por primera vez se rellena como la última vez
                        if (!isExpanded && !series) onLog(id, 'series', seriesIniciales(ex, previo))
                        setExpandido(prev => ({ ...prev, [id]: !isExpanded }))
                      }}
                      aria-expanded={isExpanded}
                      className='nf-press-soft'
                      tabIndex={tab}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: '16px', fontWeight: 500,
                          color: hecho ? 'var(--label-3)' : 'var(--label)',
                          textDecoration: hecho ? 'line-through' : 'none',
                          transition: 'color 200ms ease',
                        }}>
                          {ex.nombre}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {exColor && musculo && <span className='nf-badge' style={{ '--tint': exColor.text, height: '20px', fontSize: '11px' }}>{musculo}</span>}
                          <span className='nf-caption nf-num'>
                            {ex.series}×{ex.reps} · {ex.peso}
                            {series && hecho && (
                              <span style={{ color: colores.text, marginLeft: '4px', fontWeight: 700 }}>
                                → {series.length} {series.length === 1 ? 'serie' : 'series'}{maxPeso > 0 && ` · ${maxPeso} kg`}
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                      <IconChevronRight size={18} color='var(--label-4)' style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)', flexShrink: 0 }} />
                    </button>

                    <button
                      onClick={() => setTimerAbierto(prev => prev === id ? null : id)}
                      className='nf-icon-btn'
                      aria-label={`Temporizador de descanso para ${ex.nombre}`}
                      aria-pressed={timerOpen}
                      tabIndex={tab}
                      style={{ color: timerOpen ? colores.text : 'var(--label-3)' }}
                    >
                      <IconClock size={20} />
                    </button>
                  </div>

                  {/* Registro real */}
                  <div className='nf-collapse' data-open={isExpanded}>
                    <div>
                      <div style={{ padding: '4px 16px 16px 52px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {series && (
                          <ListaSeries
                            series={series}
                            previo={previo}
                            color={colores.text}
                            activa={isExpanded && !recogida}
                            onCambiar={nuevas => onLog(id, 'series', nuevas)}
                          />
                        )}
                        <input
                          type='text'
                          className='nf-input'
                          tabIndex={isExpanded && !recogida ? 0 : -1}
                          aria-label='Nota del ejercicio'
                          value={logEx.nota ?? ''}
                          placeholder='Nota: ej. "sentí el hombro raro"'
                          onChange={e => onLog(id, 'nota', e.target.value)}
                          style={{ '--tint': colores.text }}
                        />
                      </div>
                    </div>
                  </div>

                  {timerOpen && (
                    <div style={{ padding: '0 12px 12px' }}>
                      <RestTimer color={colores.text} onClose={() => setTimerAbierto(null)} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {hechos.length > 0 && !bloqueada && (
            <div className='nf-reveal' style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)', padding: '14px 16px 16px' }}>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{
                  height: '100%', width: '100%', background: colores.text, borderRadius: '2px',
                  transform: `scaleX(${hechos.length / total})`, transformOrigin: 'left',
                  transition: 'transform 400ms var(--ease-out)',
                }} />
              </div>

              <button
                onClick={onGuardar}
                disabled={guardando}
                tabIndex={recogida ? -1 : 0}
                className={`nf-btn nf-btn--block nf-btn--lg ${completa && !guardado ? 'nf-btn--primary' : 'nf-btn--tinted'}`}
                style={{ '--tint': colores.text }}
                aria-live='polite'
              >
                <IconCheck size={19} />
                {guardado
                  ? 'Sesión guardada'
                  : guardando
                    ? 'Guardando…'
                    : completa
                      ? 'Guardar sesión completa'
                      : `Guardar (${hechos.length}/${total})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Rutinas recogidas: se recuerdan en este dispositivo
const CLAVE_RECOGIDAS = 'nf.gym.recogidas'
const leerRecogidas = () => {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_RECOGIDAS) || '[]')) } catch { return new Set() }
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function GymScreen({ t, screen }) {
  // Rutinas: paquetes por id. Plan: rutinas de cada día (0=Lunes … 6=Domingo)
  const [lib, setLib]                   = useState({})
  const [plan, setPlan]                 = useState(null)
  const [hechasPorFecha, setHechasPorFecha] = useState({})  // rutinas con sesión guardada en esa fecha
  const [pool, setPool]                 = useState([])
  const [bibliotecaAbierta, setBibliotecaAbierta] = useState(false)
  const [generarAbierto, setGenerarAbierto]       = useState(false)
  const [selectedFecha, setSelectedFecha] = useState(() => fechaLocal())
  const [offsetSemana, setOffsetSemana] = useState(0)
  // Rutinas agregadas a un día pasado (solo esa fecha; al guardar quedan en hechasPorFecha)
  const [extrasPorFecha, setExtrasPorFecha] = useState({})
  const [avisoAyerCerrado, setAvisoAyerCerrado] = useState(false)
  // Claves por sesión: `${fecha}|${rutinaId}`
  const [completados, setCompletados]   = useState({})
  const [logData, setLogData]           = useState({})
  // Versiones anteriores del plan ([{desde, semana}]) y la rutina congelada de cada
  // sesión pasada (por clave): cambiar algo hoy no reescribe los días pasados
  const [planes, setPlanes]             = useState([])
  const [fotos, setFotos]               = useState({})
  // Últimos registros por ejercicio: rellenan las series "como la última vez"
  const [historial, setHistorial]       = useState({})
  const [guardando, setGuardando]       = useState(null)
  const [guardado, setGuardado]         = useState({})
  const [recogidas, setRecogidas]       = useState(leerRecogidas)
  const [cambiarAbierto, setCambiarAbierto] = useState(false)
  // Editor: { rutina, dia } — dia es a qué día agregar una rutina nueva
  const [editor, setEditor]             = useState(null)
  const [editorAbierto, setEditorAbierto] = useState(false)
  const [editorKey, setEditorKey]       = useState(0)
  const entrar = useEntrada(screen === 'gym')

  const [hoy] = useState(() => fechaLocal())

  const semana = semanaDe(offsetSemana)

  // Al volver a esta semana se elige hoy; en la pasada, el domingo (lo más reciente)
  const cambiarSemana = (nuevo, fecha) => {
    setOffsetSemana(nuevo)
    setSelectedFecha(fecha ?? (nuevo === 0 ? hoy : semanaDe(nuevo)[6].fecha))
    setCambiarAbierto(false)
  }

  const clave = (fecha, id) => `${fecha}|${id}`

  // El plan que valía esa fecha: hoy y después, el actual; antes, la versión de entonces
  const planPara = (fecha) => {
    if (fecha >= hoy) return plan
    let vigente = null
    for (const p of planes) if (p.desde <= fecha) vigente = p.semana
    return vigente ?? plan
  }

  // Las del plan de ese día, más las que ya se hicieron esa fecha aunque luego se hayan movido.
  // En días pasados, una rutina con sesión guardada se dibuja como era ese día.
  const rutinasDe = (fecha, dow) => {
    const ids = [...(planPara(fecha)?.[dow] ?? [])]
    for (const id of [...(hechasPorFecha[fecha] ?? []), ...(extrasPorFecha[fecha] ?? [])]) if (!ids.includes(id)) ids.push(id)
    return ids.map(id => (fecha < hoy && fotos[clave(fecha, id)]) || lib[id]).filter(Boolean)
  }

  // La primera vez que cambia el plan, lo de antes queda como la versión del pasado
  const anotarPlanAnterior = (anterior) => {
    if (anterior) setPlanes(prev => (prev.length ? prev : [{ desde: '2000-01-01', semana: anterior }]))
  }
  const diasDeRutina = (id) => (plan ? Object.keys(plan).map(Number).filter(d => plan[d].includes(id)).sort() : [])

  useEffect(() => {
    let cancelado = false
    Promise.all([
      getRutinas(),
      getSesionesSemana().catch(() => []),
      getEjercicios().catch(() => []),
    ])
      .then(([datos, sesiones, biblioteca]) => {
        if (cancelado) return
        setHistorial(datos.ultimos ?? {})
        setPlanes(datos.planes ?? [])
        const nuevaLib  = Object.fromEntries(datos.rutinas.map(r => [r.id, r]))
        const nuevoPlan = Object.fromEntries(Object.entries(datos.semana).map(([d, ids]) => [Number(d), ids ?? []]))
        setLib(nuevaLib)
        setPlan(nuevoPlan)
        setPool(Array.isArray(biblioteca) ? biblioteca : [])

        // Marca lo que ya se registró esta semana, sesión por sesión
        const hechas = {}, marcados = {}, logs = {}, congeladas = {}
        for (const s of Array.isArray(sesiones) ? sesiones : []) {
          const nombres = (s.ejercicios ?? []).map(e => e.nombre)
          if (!nombres.length) continue
          const [y, m, dd] = s.fecha.split('-').map(Number)
          const dow = (new Date(y, m - 1, dd).getDay() + 6) % 7
          // Las sesiones guardadas antes de existir rutina_ref se enlazan con
          // la rutina que contiene esos ejercicios (primero las del plan del día)
          const contiene = (r) => r && nombres.every(n => r.ejercicios.some(ex => ex.nombre === n))
          // Un día pasado se ve con la rutina tal como era; si ya se borró, queda solo para ver
          const foto = s.fecha < hoy && s.rutina_snapshot?.ejercicios
            ? { ...s.rutina_snapshot, id: s.rutina_ref ?? `eliminada-${s.id}`, eliminada: s.rutina_ref == null }
            : null
          const rutina = foto
            ?? nuevaLib[s.rutina_ref]
            ?? (nuevoPlan[dow] ?? []).map(id => nuevaLib[id]).find(contiene)
            ?? Object.values(nuevaLib).find(contiene)
          if (!rutina) continue
          if (foto) congeladas[clave(s.fecha, rutina.id)] = foto
          hechas[s.fecha] = [...(hechas[s.fecha] ?? []), rutina.id]
          const k = clave(s.fecha, rutina.id), ids = [], log = {}
          for (const ej of s.ejercicios) {
            const idx = rutina.ejercicios.findIndex(ex => (ej.ejercicio_uid ? ex.uid === ej.ejercicio_uid : ex.nombre === ej.nombre))
            if (idx === -1) continue   // ese ejercicio ya no está en la rutina
            const id = uidDe(rutina.ejercicios[idx], idx)
            ids.push(id)
            log[id] = { series: seriesIniciales(rutina.ejercicios[idx], ej), nota: ej.notas ?? '' }
          }
          marcados[k] = ids
          logs[k] = log
        }
        setFotos(congeladas)
        setHechasPorFecha(hechas)
        setCompletados(marcados)
        setLogData(logs)
      })
      .catch(() => { if (!cancelado) toast.error('No se pudieron cargar tus rutinas.') })
    return () => { cancelado = true }
  }, [hoy])   // hoy no cambia: se fija al montar

  const recoger = (id) => {
    haptic(6)
    setRecogidas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id)
      try { localStorage.setItem(CLAVE_RECOGIDAS, JSON.stringify([...nuevo])) } catch { /* sin almacenamiento */ }
      return nuevo
    })
  }

  const toggleEjercicio = (k, id) => {
    haptic(8)
    setCompletados(prev => {
      const lista = prev[k] ?? []
      return { ...prev, [k]: lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id] }
    })
    setGuardado(prev => (prev[k] ? sinClave(prev, k) : prev))
  }

  const updateLog = (k, id, field, value) => {
    setLogData(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? {}), [id]: { ...(prev[k]?.[id] ?? {}), [field]: value } },
    }))
    setGuardado(prev => (prev[k] ? sinClave(prev, k) : prev))
  }

  const guardarSesion = async (fecha, rutina) => {
    const k = clave(fecha, rutina.id)
    setGuardando(k)
    // Un solo envío por rutina: el servidor reemplaza sus ejercicios de ese día
    // y la marca como hecha. O se guarda todo o nada.
    const ejercicios = hechosDe(completados[k], rutina)
      .map(id => {
        const ejercicio = rutina.ejercicios.find((ex, i) => uidDe(ex, i) === id)
        const logEx  = logData[k]?.[id] ?? {}
        // Si no se abrió, se guarda como la última vez (o como dice la rutina)
        const series = logEx.series ?? seriesIniciales(ejercicio, ultimaVez(historial, ejercicio.nombre, fecha))
        const peso   = numero(ejercicio.peso)
        return {
          uid:     ejercicio.uid,
          nombre:  ejercicio.nombre,
          musculo: ejercicio.musculo || '',
          series:  series.length || ejercicio.series,
          reps:    ejercicio.reps,
          peso_kg: peso ? Number(peso) : null,
          notas:   logEx.nota || '',
          // El servidor saca el resumen (series, reps, carga máxima) de aquí
          series_detalle: series.map(x => ({ reps: numero(x.reps) || null, peso_kg: numero(x.peso) || null })),
        }
      })
    try {
      await registrarSesion({
        fecha, rutina_ref: rutina.id, ejercicios,
        notas: `${ejercicios.length}/${rutina.ejercicios.length} ejercicios`,
      })
      // Lo recién guardado pasa a ser "la última vez" para los días siguientes
      setHistorial(prev => {
        const nuevo = { ...prev }
        for (const e of ejercicios) {
          const n = e.nombre.toLowerCase()
          const registro = {
            fecha, series: e.series, reps: e.reps,
            peso_kg: Math.max(0, ...e.series_detalle.map(x => Number(x.peso_kg) || 0)) || null,
            series_detalle: e.series_detalle.filter(x => x.reps != null || x.peso_kg != null)
              .map(x => ({ reps: x.reps != null ? Number(x.reps) : null, peso_kg: x.peso_kg != null ? Number(x.peso_kg) : null })),
          }
          nuevo[n] = [...(prev[n] ?? []).filter(r => r.fecha !== fecha), registro].sort((a, b) => a.fecha.localeCompare(b.fecha))
        }
        return nuevo
      })
      if (fecha < hoy) setFotos(prev => (prev[k] ? prev : { ...prev, [k]: rutina }))
      setHechasPorFecha(prev => {
        const sinEsta = (prev[fecha] ?? []).filter(id => id !== rutina.id)
        return { ...prev, [fecha]: ejercicios.length ? [...sinEsta, rutina.id] : sinEsta }
      })
      haptic(20)
      setGuardado(prev => ({ ...prev, [k]: true }))
      setTimeout(() => setGuardado(prev => sinClave(prev, k)), 2000)
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo guardar la sesión. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setGuardando(null)
    }
  }

  // ── Semana: agregar, quitar e intercambiar paquetes completos ─────────────
  // Cambia el plan al instante y lo confirma con el servidor; si falla, vuelve.
  const cambiarPlan = async (cambios, { deshacer } = {}) => {
    const anterior = plan
    anotarPlanAnterior(anterior)
    setPlan(prev => ({ ...prev, ...cambios }))
    haptic(10)
    try {
      await asignarSemana(cambios)
      if (deshacer) toast(deshacer.texto, { action: { label: 'Deshacer', onClick: () => cambiarPlan(deshacer.cambios) } })
    } catch (e) {
      setPlan(anterior)
      toast.error(e.mensaje || 'No se pudo cambiar tu semana.')
    }
  }

  const alternarRutina = (dow, id) => {
    const actuales = plan[dow] ?? []
    const quitar = actuales.includes(id)
    if (!quitar && actuales.length >= MAX_POR_DIA) {
      toast.error(`Máximo ${MAX_POR_DIA} rutinas por día.`)
      return
    }
    const nuevas = quitar ? actuales.filter(x => x !== id) : [...actuales, id]
    cambiarPlan({ [dow]: nuevas }, {
      deshacer: {
        texto: quitar ? `Quitaste ${lib[id].nombre} del ${NOMBRES_DIA[dow]}` : `Agregaste ${lib[id].nombre} al ${NOMBRES_DIA[dow]}`,
        cambios: { [dow]: actuales },
      },
    })
  }

  const dejarDescanso = (dow) => {
    if (!(plan[dow] ?? []).length) return
    cambiarPlan({ [dow]: [] }, {
      deshacer: { texto: `El ${NOMBRES_DIA[dow]} ahora es de descanso`, cambios: { [dow]: plan[dow] } },
    })
    setCambiarAbierto(false)
  }

  const intercambiarDias = (a, b) => {
    cambiarPlan({ [a]: plan[b], [b]: plan[a] }, {
      deshacer: { texto: `Intercambiaste ${NOMBRES_DIA[a]} y ${NOMBRES_DIA[b]}`, cambios: { [a]: plan[a], [b]: plan[b] } },
    })
    setCambiarAbierto(false)
  }

  // ── Editor de rutina ──────────────────────────────────────────────────────
  const abrirEditor = (rutina, dia = null) => {
    setEditor({ rutina, dia })
    setEditorKey(k => k + 1)
    setEditorAbierto(true)
  }

  const nuevaRutina = (dia) => {
    const usados = new Set(Object.values(lib).map(r => r.color))
    abrirEditor({ id: null, nombre: '', emoji: '💪', color: PALETA.find(c => !usados.has(c)) ?? PALETA[0], ejercicios: [] }, dia)
  }

  const handleSaveRutina = async (datos) => {
    const { rutina, dia } = editor
    setEditorAbierto(false)

    if (rutina.id == null) {
      try {
        const creada = await crearRutina(datos)
        setLib(prev => ({ ...prev, [creada.id]: creada }))
        const actuales = dia != null ? plan[dia] ?? [] : []
        if (dia != null && actuales.length < MAX_POR_DIA) {
          await cambiarPlan({ [dia]: [...actuales, creada.id] })
          toast.success(`Agregaste ${creada.nombre} al ${NOMBRES_DIA[dia]}`)
        } else {
          toast.success('Rutina creada')
        }
      } catch (e) {
        toast.error(e.mensaje || 'No se pudo crear la rutina.')
      }
      return
    }

    setLib(prev => ({ ...prev, [rutina.id]: { ...prev[rutina.id], ...datos } }))
    try {
      const guardada = await editarRutina(rutina.id, datos)
      setLib(prev => ({ ...prev, [rutina.id]: guardada }))
      toast.success('Rutina guardada')
    } catch (e) {
      setLib(prev => ({ ...prev, [rutina.id]: rutina }))
      toast.error(e.mensaje || 'No se pudo guardar la rutina.')
    }
  }

  const handleEliminarRutina = async () => {
    const { rutina } = editor
    setEditorAbierto(false)
    try {
      const datos = await eliminarRutina(rutina.id)
      anotarPlanAnterior(plan)
      setLib(Object.fromEntries(datos.rutinas.map(r => [r.id, r])))
      setPlan(Object.fromEntries(Object.entries(datos.semana).map(([d, ids]) => [Number(d), ids ?? []])))
      toast(`Eliminaste ${rutina.nombre}`)
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo eliminar la rutina.')
    }
  }

  const aplicarRutinas = (datos) => {
    anotarPlanAnterior(plan)
    setLib(Object.fromEntries(datos.rutinas.map(r => [r.id, r])))
    setPlan(Object.fromEntries(Object.entries(datos.semana).map(([d, ids]) => [Number(d), ids ?? []])))
  }
  const recargarRutinas = () => getRutinas().then(aplicarRutinas).catch(() => {})

  const semanaLista = (datos) => {
    aplicarRutinas(datos)
    setGenerarAbierto(false)
    getEjercicios().then(setPool).catch(() => {})
    toast.success(datos.explicacion || 'Tu semana está lista')
  }

  const handleCrearEjercicioPersonalizado = async (ejercicio) => {
    const temporal = { ...ejercicio, id: `nuevo-${Date.now()}` }
    setPool(prev => [...prev, temporal])
    try {
      const creado = await crearEjercicio({
        nombre: ejercicio.nombre,
        musculo: ejercicio.musculo,
        series: ejercicio.series,
        reps: ejercicio.reps,
        peso: ejercicio.peso,
        color: ejercicio.color,
      })
      setPool(prev => prev.map(e => e.id === temporal.id ? creado : e))
    } catch (e) {
      setPool(prev => prev.filter(x => x.id !== temporal.id))
      toast.error(e.mensaje || 'El ejercicio no se guardó en tu cuenta.')
    }
  }

  const cargandoPlan     = plan === null
  const diaSeleccionado  = semana.find(d => d.fecha === selectedFecha)
  const rutinasDelDia    = diaSeleccionado && !cargandoPlan ? rutinasDe(selectedFecha, diaSeleccionado.dayOfWeek) : []
  const coloresDia       = coloresDe(rutinasDelDia[0])
  // Si esa fecha ya tiene sesiones guardadas, cambiar el plan no las toca
  const diaConSesionFija = (hechasPorFecha[selectedFecha] ?? []).length > 0
  const esPasado  = selectedFecha < hoy
  const esFuturo  = selectedFecha > hoy
  const alternarExtra = (id) => setExtrasPorFecha(prev => {
    const lista = prev[selectedFecha] ?? []
    return { ...prev, [selectedFecha]: lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id] }
  })

  // Los lunes: si ayer (domingo, semana pasada) tocaba entrenar y no se registró, se ofrece
  const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return fechaLocal(d) })()
  const rutinasAyer = !cargandoPlan && semana[0].fecha === hoy && offsetSemana === 0 ? rutinasDe(ayer, 6) : []
  const mostrarAvisoAyer = !avisoAyerCerrado && rutinasAyer.length > 0 &&
    !rutinasAyer.some(r => hechosDe(completados[clave(ayer, r.id)], r).length > 0)

  return (
    <div style={{ padding: 'calc(var(--safe-top) + 20px) 16px 0' }}>

      {editor !== null && (
        <RutinaEditor
          key={editorKey}
          open={editorAbierto}
          rutina={editor.rutina}
          diasUso={editor.rutina.id != null ? diasDeRutina(editor.rutina.id) : []}
          pool={pool}
          onSave={handleSaveRutina}
          onEliminar={handleEliminarRutina}
          onClose={() => setEditorAbierto(false)}
          onCrearEjercicio={handleCrearEjercicioPersonalizado}
        />
      )}

      {/* Header */}
      <header className={entrar ? 'nf-enter' : undefined} style={{ padding: '0 4px', marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <h1 className='nf-large-title'>{t?.gym ?? 'Gym'}</h1>
          <p className='nf-subhead'>{t?.weeklyPlan ?? 'Tu plan semanal'}</p>
        </div>
        {!cargandoPlan && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
            <button onClick={() => setGenerarAbierto(true)} className='nf-icon-btn' aria-label='Que Bruce arme mi semana' style={{ color: 'var(--green)' }}>
              <IconSparkles size={22} />
            </button>
            <button onClick={() => setBibliotecaAbierta(true)} className='nf-icon-btn' aria-label='Mis ejercicios' style={{ color: 'var(--green)' }}>
              <IconBooks size={22} />
            </button>
          </div>
        )}
      </header>

      <BibliotecaSheet
        open={bibliotecaAbierta}
        onClose={() => setBibliotecaAbierta(false)}
        pool={pool}
        setPool={setPool}
        colorMusculo={(m) => COLORES_MUSCULO[m]?.text ?? 'var(--label-2)'}
        onCambioRutinas={recargarRutinas}
      />
      <GenerarSheet
        open={generarAbierto}
        onClose={() => setGenerarAbierto(false)}
        tieneSemana={Object.values(plan ?? {}).some(ids => ids.length)}
        onListo={semanaLista}
      />

      {cargandoPlan ? (
        <div aria-busy='true'>
          <div className='nf-skeleton' style={{ height: '72px', borderRadius: 'var(--r-lg)', marginBottom: '16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '20px' }}>
            {DIAS_ABR.map(d => <div key={d} className='nf-skeleton' style={{ height: '84px', borderRadius: '16px' }} />)}
          </div>
          <div className='nf-skeleton' style={{ height: '320px', borderRadius: 'var(--r-lg)' }} />
        </div>
      ) : Object.keys(lib).length === 0 ? (
        <div className='nf-card nf-enter' style={{ padding: '28px 20px', textAlign: 'center' }}>
          <img src={bruceGym} alt='' width={96} height={96} style={{ margin: '0 auto 12px', display: 'block', objectFit: 'contain' }} />
          <p className='nf-title-3' style={{ marginBottom: '6px' }}>Arma tu semana</p>
          <p className='nf-footnote' style={{ marginBottom: '20px' }}>
            Dime qué días entrenas y cuánto tiempo tienes, y te armo las rutinas según tu objetivo. O créalas tú desde cero.
          </p>
          <button onClick={() => setGenerarAbierto(true)} className='nf-btn nf-btn--primary nf-btn--block nf-btn--lg' style={{ marginBottom: '10px' }}>
            <IconSparkles size={18} /> Que Bruce arme mi semana
          </button>
          <button onClick={() => nuevaRutina(diaSeleccionado?.dayOfWeek ?? null)} className='nf-btn nf-btn--tinted nf-btn--block'>
            <IconPlus size={18} /> Crear mi propia rutina
          </button>
        </div>
      ) : (<>
        <ResumenSemanal semana={semana} completados={completados} rutinasDe={rutinasDe} clave={clave} pool={pool} pasada={offsetSemana < 0} />

        {mostrarAvisoAyer && (
          <div className='nf-card nf-reveal' style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px 12px 16px', marginBottom: '16px' }}>
            <span aria-hidden='true' style={{ fontSize: '22px' }}>{rutinasAyer[0].emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className='nf-subhead' style={{ color: 'var(--label)', fontWeight: 600 }}>¿Entrenaste ayer?</p>
              <p className='nf-footnote'>Tenías {rutinasAyer.map(r => r.nombre).join(' y ')}.</p>
            </div>
            <button onClick={() => cambiarSemana(-1, ayer)} className='nf-btn nf-btn--sm nf-btn--tinted'>Registrar</button>
            <button onClick={() => setAvisoAyerCerrado(true)} className='nf-icon-btn' aria-label='Ocultar aviso' style={{ color: 'var(--label-3)' }}>
              <IconX size={18} />
            </button>
          </div>
        )}

        {/* Semana de lunes a domingo; se desliza a la semana pasada */}
        <TiraSemana offset={offsetSemana} semana={semana} onCambiar={(n) => cambiarSemana(n)}>
          {semana.map(({ fecha, dayOfWeek, d }) => {
            const rutinas        = rutinasDe(fecha, dayOfWeek)
            const c              = coloresDe(rutinas[0])
            const esSeleccionado = fecha === selectedFecha
            const esHoy          = fecha === hoy
            const futuro         = fecha > hoy
            const total          = rutinas.reduce((n, r) => n + r.ejercicios.length, 0)
            const hechos         = rutinas.reduce((n, r) => n + hechosDe(completados[clave(fecha, r.id)], r).length, 0)
            const pct            = total > 0 ? hechos / total : 0
            const terminado      = total > 0 && hechos === total
            const nombres        = rutinas.map(r => r.nombre).join(' y ') || 'Descanso'

            return (
              <button
                key={fecha}
                role='tab'
                aria-selected={esSeleccionado}
                aria-label={`${d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}: ${nombres}${terminado ? ', completado' : ''}`}
                onClick={() => { setSelectedFecha(fecha); setCambiarAbierto(false) }}
                style={{
                  height: '84px', borderRadius: '16px', position: 'relative', overflow: 'hidden',
                  background: esSeleccionado ? 'var(--surface-2)' : 'transparent',
                  boxShadow: esSeleccionado
                    ? `inset 0 0 0 1.5px ${c.text}`
                    : esHoy ? `inset 0 0 0 1px ${c.text}66` : 'inset 0 0 0 0.5px var(--separator)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                  padding: 0,
                  // Los días que no han llegado se ven más tenues, pero se pueden abrir para ver o cambiar el plan
                  opacity: futuro && !esSeleccionado ? 0.6 : 1,
                  transition: 'box-shadow 200ms ease, background-color 200ms ease, opacity 200ms ease',
                }}
              >
                {/* Progreso del día: se llena desde abajo */}
                <span aria-hidden='true' style={{
                  position: 'absolute', inset: 0, background: c.bg,
                  transform: `scaleY(${pct})`, transformOrigin: 'bottom',
                  transition: 'transform 400ms var(--ease-out), background-color 200ms ease',
                }} />
                <span style={{ position: 'relative', fontSize: '12px', fontWeight: 600, color: esHoy ? c.text : 'var(--label-3)' }}>
                  {DIAS_ABR[dayOfWeek]}
                </span>
                <span className='nf-num' style={{ position: 'relative', fontSize: '17px', fontWeight: 700, color: esSeleccionado ? c.text : 'var(--label)' }}>
                  {d.getDate()}
                </span>
                <span style={{ position: 'relative', fontSize: '16px', lineHeight: 1, height: '18px', display: 'flex', alignItems: 'center' }}>
                  {terminado
                    ? <IconCheck size={16} color={c.text} strokeWidth={3} />
                    : (rutinas[0]?.emoji ?? '🛌')}
                  {/* Doble entreno: un punto por cada rutina extra */}
                  {rutinas.length > 1 && !terminado && (
                    <span aria-hidden='true' style={{ display: 'flex', gap: '2px', marginLeft: '2px' }}>
                      {rutinas.slice(1).map(r => <span key={r.id} style={{ width: '5px', height: '5px', borderRadius: '50%', background: r.color }} />)}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </TiraSemana>

        {/* Encabezado del día: qué toca y el botón para cambiarlo */}
        {diaSeleccionado && (
          <div className='nf-card' style={{ marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px 10px 16px' }}>
              <div style={{ minWidth: 0 }}>
                <p className='nf-headline' style={{ textTransform: 'capitalize' }}>
                  {diaSeleccionado.d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}
                </p>
                <p className='nf-footnote'>
                  {rutinasDelDia.length === 0 ? 'Día de descanso'
                    : rutinasDelDia.length === 1 ? '1 rutina'
                    : `Doble entreno · ${rutinasDelDia.length} rutinas`}
                  {esFuturo && ' · aún no llega'}
                </p>
              </div>
              <button
                onClick={() => setCambiarAbierto(a => !a)}
                aria-expanded={cambiarAbierto}
                className='nf-btn nf-btn--sm nf-btn--tinted'
                style={{ '--tint': coloresDia.text, flexShrink: 0 }}
              >
                {cambiarAbierto ? <IconX size={15} /> : esPasado ? <IconPlus size={15} /> : <IconReplace size={15} />}
                {cambiarAbierto ? 'Cerrar' : esPasado ? 'Otra rutina' : 'Cambiar'}
              </button>
            </div>
            {esPasado ? (
              <PanelOtraRutina
                abierto={cambiarAbierto}
                lib={lib}
                delDia={rutinasDelDia.map(r => r.id)}
                fijas={[...(planPara(selectedFecha)?.[diaSeleccionado.dayOfWeek] ?? []), ...(hechasPorFecha[selectedFecha] ?? [])]}
                onAlternar={alternarExtra}
              />
            ) : <PanelCambiar
              abierto={cambiarAbierto}
              dow={diaSeleccionado.dayOfWeek}
              plan={plan}
              lib={lib}
              sesionFija={diaConSesionFija}
              onAlternar={alternarRutina}
              onDescanso={dejarDescanso}
              onIntercambiar={intercambiarDias}
              onNueva={nuevaRutina}
              onEditar={(r) => abrirEditor(r)}
            />}
          </div>
        )}

        {rutinasDelDia.length === 0 ? (
          <div className='nf-card' style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: '34px', marginBottom: '8px' }}>🛌</p>
            <p className='nf-headline' style={{ marginBottom: '4px' }}>Día de descanso</p>
            <p className='nf-footnote'>
              {esPasado ? 'Si entrenaste ese día, toca "Otra rutina" y regístrala.' : 'Recuperar también es entrenar. Toca "Cambiar" si quieres ponerle una rutina.'}
            </p>
          </div>
        ) : rutinasDelDia.map(rutina => {
          const k = clave(selectedFecha, rutina.id)
          return (
            <TarjetaRutina
              key={k}
              rutina={rutina}
              fecha={selectedFecha}
              pool={pool}
              recogida={recogidas.has(rutina.id)}
              onRecoger={() => recoger(rutina.id)}
              onEditar={lib[rutina.id] ? () => abrirEditor(lib[rutina.id]) : null}
              hechos={hechosDe(completados[k], rutina)}
              log={logData[k] ?? {}}
              onToggle={(id) => toggleEjercicio(k, id)}
              onLog={(id, campo, valor) => updateLog(k, id, campo, valor)}
              guardando={guardando === k}
              guardado={Boolean(guardado[k])}
              onGuardar={() => guardarSesion(selectedFecha, rutina)}
              historial={historial}
              bloqueada={rutina.eliminada ? 'Rutina eliminada' : esFuturo ? `Se registra el ${NOMBRES_DIA[diaSeleccionado.dayOfWeek]}` : null}
            />
          )
        })}
      </>)}
    </div>
  )
}
