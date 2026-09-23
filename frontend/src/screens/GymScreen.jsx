import { useState, useEffect, useRef, useCallback } from 'react'
import {
  IconCheck, IconChevronRight, IconChevronUp, IconChevronDown, IconPlus, IconX,
  IconClock, IconPencil, IconTrash, IconSearch, IconPalette, IconBarbell,
} from '@tabler/icons-react'
import {
  registrarSesion, getSesionFecha,
  getRutinasDia, guardarRutinaDia,
  getEjerciciosPersonalizados, crearEjercicioPersonalizado,
} from '../api'
import Sheet, { SheetHeader } from '../components/Sheet'
import { toast } from '../lib/toast'
import { haptic, useEntrada } from '../lib/motion'

// Fecha local (no UTC): en Colombia, después de las 7 pm toISOString ya da mañana
const fechaLocal = (d = new Date()) => d.toLocaleDateString('en-CA')

const sinClave = (obj, clave) => {
  const copia = { ...obj }
  delete copia[clave]
  return copia
}

// ─── DATOS BASE ────────────────────────────────────────────────────────────────

const RUTINAS_DEFAULT = {
  0: { nombre: 'Pecho/Hombros', id: 'B', emoji: '💪', ejercicios: [
    { nombre: 'Chest press máquina',   series: 3, reps: '10', peso: '36–64 kg'   },
    { nombre: 'Press banca plano',     series: 4, reps: '10', peso: '10–12.5 kg' },
    { nombre: 'Pec fly',               series: 3, reps: '10', peso: '32–52 kg'   },
    { nombre: 'Press militar',         series: 3, reps: '10', peso: '8–10 kg'    },
    { nombre: 'Elevaciones laterales', series: 3, reps: '10', peso: '6–8 kg'     },
    { nombre: 'Tríceps polea',         series: 3, reps: '10', peso: '18–27 kg'   },
    { nombre: 'Elevación de piernas',  series: 3, reps: '12', peso: '—'          },
  ]},
  1: { nombre: 'Natación', id: 'D', emoji: '🏊', ejercicios: [
    { nombre: 'Natación libre', series: 1, reps: '15-20m', peso: '—' },
  ]},
  2: { nombre: 'Espalda/Brazos', id: 'C', emoji: '🦾', ejercicios: [
    { nombre: 'Jalón al pecho',   series: 4, reps: '10', peso: '32–45 kg' },
    { nombre: 'Remo mancuerna',   series: 3, reps: '10', peso: '18–20 kg' },
    { nombre: 'Remo máquina',     series: 3, reps: '10', peso: '32–45 kg' },
    { nombre: 'Curl bíceps',      series: 4, reps: '10', peso: '8–10 kg'  },
    { nombre: 'Curl martillo',    series: 3, reps: '10', peso: '8–10 kg'  },
    { nombre: 'Plancha',          series: 4, reps: '45s', peso: '—'      },
    { nombre: 'Crunch bicicleta', series: 3, reps: '20', peso: '—'       },
  ]},
  3: { nombre: 'Natación', id: 'D', emoji: '🏊', ejercicios: [
    { nombre: 'Natación libre', series: 1, reps: '15-20m', peso: '—' },
  ]},
  4: { nombre: 'Pecho/Hombros o Core+Bici', id: 'B', emoji: '🔁', ejercicios: [
    { nombre: 'Chest press máquina',   series: 3, reps: '10', peso: '36–64 kg'   },
    { nombre: 'Press banca plano',     series: 4, reps: '10', peso: '10–12.5 kg' },
    { nombre: 'Pec fly',               series: 3, reps: '10', peso: '32–52 kg'   },
    { nombre: 'Press militar',         series: 3, reps: '10', peso: '8–10 kg'    },
    { nombre: 'Elevaciones laterales', series: 3, reps: '10', peso: '6–8 kg'     },
    { nombre: 'Tríceps polea',         series: 3, reps: '10', peso: '18–27 kg'   },
    { nombre: 'Elevación de piernas',  series: 3, reps: '12', peso: '—'          },
  ]},
  5: { nombre: 'Natación', id: 'D', emoji: '🏊', ejercicios: [
    { nombre: 'Natación libre', series: 1, reps: '15-20m', peso: '—' },
  ]},
  6: { nombre: 'Descanso', id: 'R', emoji: '🛌', ejercicios: [] },
}

const POOL_DEFAULT = [
  { nombre: 'Sentadilla',             musculo: 'Piernas',   series: 4, reps: '8',   peso: '60 kg'    },
  { nombre: 'Prensa de pierna',       musculo: 'Piernas',   series: 4, reps: '12',  peso: '120 kg'   },
  { nombre: 'Zancadas',               musculo: 'Piernas',   series: 3, reps: '10',  peso: '16 kg'    },
  { nombre: 'Curl femoral',           musculo: 'Piernas',   series: 4, reps: '10',  peso: '38–45 kg' },
  { nombre: 'Extensión cuádricep',    musculo: 'Piernas',   series: 4, reps: '10',  peso: '52–58 kg' },
  { nombre: 'Aductor/abductor',       musculo: 'Piernas',   series: 3, reps: '12',  peso: '66 kg'    },
  { nombre: 'Pantorrilla',            musculo: 'Piernas',   series: 3, reps: '20',  peso: '20 kg'    },
  { nombre: 'Pantorrilla unipodal',   musculo: 'Piernas',   series: 3, reps: '18',  peso: '20 kg'    },
  { nombre: 'Step-up',                musculo: 'Piernas',   series: 3, reps: '10',  peso: '18–20 kg' },
  { nombre: 'Peso muerto unipodal',   musculo: 'Piernas',   series: 3, reps: '10',  peso: '14 kg'    },
  { nombre: 'Chest press máquina',    musculo: 'Pecho',     series: 3, reps: '10',  peso: '29–36 kg' },
  { nombre: 'Press banca inclinado',  musculo: 'Pecho',     series: 4, reps: '10',  peso: '7.5–10 kg'},
  { nombre: 'Press banca plano',      musculo: 'Pecho',     series: 4, reps: '8',   peso: '40 kg'    },
  { nombre: 'Pec fly',                musculo: 'Pecho',     series: 3, reps: '12',  peso: '25–30 kg' },
  { nombre: 'Fondos en paralelas',    musculo: 'Pecho',     series: 3, reps: '10',  peso: '—'        },
  { nombre: 'Press militar',          musculo: 'Hombros',   series: 3, reps: '10',  peso: '8–10 kg'  },
  { nombre: 'Elevaciones laterales',  musculo: 'Hombros',   series: 3, reps: '15',  peso: '5–6 kg'   },
  { nombre: 'Elevaciones frontales',  musculo: 'Hombros',   series: 3, reps: '12',  peso: '5 kg'     },
  { nombre: 'Jalón al pecho',         musculo: 'Espalda',   series: 4, reps: '10',  peso: '32–40 kg' },
  { nombre: 'Remo mancuerna',         musculo: 'Espalda',   series: 4, reps: '10',  peso: '14–16 kg' },
  { nombre: 'Remo máquina',           musculo: 'Espalda',   series: 3, reps: '12',  peso: 'explorar' },
  { nombre: 'Pull-up',                musculo: 'Espalda',   series: 4, reps: '6',   peso: '—'        },
  { nombre: 'Remo con barra',         musculo: 'Espalda',   series: 4, reps: '8',   peso: '40 kg'    },
  { nombre: 'Curl bíceps',            musculo: 'Brazos',    series: 4, reps: '12',  peso: '8–12 kg'  },
  { nombre: 'Curl martillo',          musculo: 'Brazos',    series: 3, reps: '12',  peso: '8–10 kg'  },
  { nombre: 'Tríceps polea',          musculo: 'Brazos',    series: 3, reps: '12',  peso: '14–18 kg' },
  { nombre: 'Tríceps francés',        musculo: 'Brazos',    series: 3, reps: '12',  peso: '10 kg'    },
  { nombre: 'Plancha',                musculo: 'Core',      series: 4, reps: '45s', peso: '—'        },
  { nombre: 'Plancha lateral',        musculo: 'Core',      series: 3, reps: '20s', peso: '—'        },
  { nombre: 'Plancha + rotación',     musculo: 'Core',      series: 3, reps: '30s', peso: '—'        },
  { nombre: 'Crunch en polea',        musculo: 'Core',      series: 3, reps: '15',  peso: 'ligero'   },
  { nombre: 'Crunch bicicleta',       musculo: 'Core',      series: 3, reps: '20',  peso: '—'        },
  { nombre: 'Elevación de piernas',   musculo: 'Core',      series: 3, reps: '12',  peso: '—'        },
  { nombre: 'Caminadora 20 min',      musculo: 'Cardio',    series: 1, reps: '20m', peso: 'incl 15'  },
  { nombre: 'Bicicleta 15 min',       musculo: 'Cardio',    series: 1, reps: '15m', peso: '—'        },
  { nombre: 'Remo ergómetro',         musculo: 'Cardio',    series: 1, reps: '10m', peso: '—'        },
]

const COLORES_RUTINA = {
  'A': { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.2)',  text: '#4ade80', glow: 'rgba(74,222,128,0.3)' },
  'B': { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.2)',  text: '#60a5fa', glow: 'rgba(96,165,250,0.3)' },
  'C': { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.2)', text: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
  'D': { bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.2)',  text: '#fb923c', glow: 'rgba(251,146,60,0.3)' },
  'R': { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', text: '#9ca3af', glow: 'transparent' },
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

// ─── RESUMEN SEMANAL ───────────────────────────────────────────────────────────
function ResumenSemanal({ semana, completados, rutinas, pool }) {
  const diasActivos = semana.filter(({ fecha }) => (completados[fecha] ?? []).length > 0).length

  const musculosSemana = new Set()
  semana.forEach(({ fecha, dayOfWeek }) => {
    const rutina = rutinas[dayOfWeek]
    ;(completados[fecha] ?? []).forEach(idx => {
      const ex = rutina?.ejercicios?.[idx]
      if (!ex) return
      const musculo = ex.musculo || pool.find(p => p.nombre === ex.nombre)?.musculo
      if (musculo) musculosSemana.add(musculo)
    })
  })

  return (
    <div className='nf-card' style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', marginBottom: '16px' }}>
      <div style={{ textAlign: 'center', minWidth: '52px' }}>
        <p className='nf-num' style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: diasActivos > 0 ? 'var(--green)' : 'var(--label-3)' }}>
          {diasActivos}
        </p>
        <p className='nf-caption' style={{ marginTop: '2px', fontWeight: 600 }}>de 7 días</p>
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
          <p className='nf-footnote'>Aún sin actividad esta semana. El primer set es el más difícil.</p>
        )}
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
const EMOJIS = ['💪', '🏃', '🚴', '🏊', '🦾', '🏋️‍♀️', '🧘', '🔁', '🛌', '🔥', '⚡️', '😊', '🥇', '🧠', '💥']

function RutinaEditor({ open, rutina, colores, pool, onSave, onClose, onCrearEjercicio }) {
  const [ejercicios, setEjercicios] = useState([...rutina.ejercicios])
  const [nombre, setNombre]         = useState(rutina.nombre)
  const [emoji, setEmoji]           = useState(rutina.emoji || '💪')
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

  const agregarDelPool  = (ex) => { setEjercicios(prev => [...prev, { ...ex }]); haptic(6) }
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
      label='Editar rutina'
      header={
        <>
          <SheetHeader
            title='Editar rutina'
            left={<button className='nf-btn nf-btn--plain' onClick={onClose} style={{ color: 'var(--label-2)' }}>Cancelar</button>}
            right={
              <button className='nf-btn nf-btn--plain' onClick={() => onSave({ nombre, ejercicios, emoji })} style={{ '--tint': colores.text, fontWeight: 700 }}>
                Guardar
              </button>
            }
          />
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setMostrarPalette(p => !p)}
                aria-label='Cambiar emoji de la rutina'
                aria-expanded={mostrarPalette}
                style={{ width: '48px', height: '48px', borderRadius: '14px', background: colores.bg, fontSize: '24px', flexShrink: 0 }}
              >
                {emoji}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  aria-label='Nombre de la rutina'
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.016em' }}
                />
                <p className='nf-caption'>{ejercicios.length} ejercicios</p>
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
              </div>
            )}
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
                <div key={`${ex.nombre}-${i}`} className='nf-row' style={{ padding: '6px 4px 6px 4px', gap: '4px' }}>
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
      </div>
    </Sheet>
  )
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function GymScreen({ t, screen }) {
  const [rutinas, setRutinas]           = useState(RUTINAS_DEFAULT)
  const [pool, setPool]                 = useState(POOL_DEFAULT)
  const [selectedFecha, setSelectedFecha] = useState(null)
  const [completados, setCompletados]   = useState({})
  const [logData, setLogData]           = useState({})
  const [expandido, setExpandido]       = useState({})
  const [timerAbierto, setTimerAbierto] = useState(null)
  const [guardando, setGuardando]       = useState(false)
  const [guardado, setGuardado]         = useState({})
  const [confetti, setConfetti]         = useState(false)
  const [editorDia, setEditorDia]       = useState(null)
  const [editorKey, setEditorKey]       = useState(0)
  const [diaEditor, setDiaEditor]       = useState(null)   // se conserva al cerrar para animar la salida
  const entrar = useEntrada(screen === 'gym')

  const [hoy] = useState(() => fechaLocal())

  useEffect(() => {
    let cancelado = false

    const cargarDatosGym = async () => {
      try {
        const [rutinasGuardadas, ejerciciosCustom] = await Promise.all([
          getRutinasDia().catch(() => ({})),
          getEjerciciosPersonalizados().catch(() => []),
        ])
        if (cancelado) return

        if (rutinasGuardadas && Object.keys(rutinasGuardadas).length > 0) {
          setRutinas(prev => {
            const merged = { ...prev }
            Object.entries(rutinasGuardadas).forEach(([dia, data]) => {
              merged[Number(dia)] = {
                nombre: data.nombre,
                id: data.rutina_id,
                emoji: data.emoji,
                ejercicios: data.ejercicios,
              }
            })
            return merged
          })
        }

        if (Array.isArray(ejerciciosCustom) && ejerciciosCustom.length > 0) {
          setPool([...POOL_DEFAULT, ...ejerciciosCustom])
        }
      } catch (e) {
        console.error('Error cargando datos de gym:', e)
      }
    }

    cargarDatosGym()
    return () => { cancelado = true }
  }, [])

  const semana = [...Array(7)].map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const fecha = fechaLocal(d)
    const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1
    return { fecha, dayOfWeek, d }
  })

  const cargarSesionFecha = useCallback(async (fecha) => {
    try {
      const sesion = await getSesionFecha(fecha)
      const [y, m, day] = fecha.split('-').map(Number)
      const dObj = new Date(y, m - 1, day)
      const dayOfWeek = dObj.getDay() === 0 ? 6 : dObj.getDay() - 1
      const rutina = rutinas[dayOfWeek]

      if (sesion?.ejercicios?.length > 0 && rutina?.ejercicios?.length > 0) {
        const idxs = []
        const logDataFecha = {}
        sesion.ejercicios.forEach(ej => {
          const idx = rutina.ejercicios.findIndex(ex => ex.nombre === ej.nombre)
          if (idx !== -1) {
            idxs.push(idx)
            logDataFecha[idx] = {
              peso: ej.peso_kg ? String(ej.peso_kg) : '',
              reps: ej.reps ?? '',
              nota: ej.notas ?? '',
            }
          }
        })
        setCompletados(prev => ({ ...prev, [fecha]: idxs }))
        setLogData(prev => ({ ...prev, [fecha]: logDataFecha }))
      } else {
        setCompletados(prev => ({ ...prev, [fecha]: [] }))
      }
    } catch {
      setCompletados(prev => ({ ...prev, [fecha]: [] }))
    }
  }, [rutinas])

  useEffect(() => {
    Promise.all(semana.map(({ fecha }) => cargarSesionFecha(fecha)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedFecha) setSelectedFecha(hoy)
  }, [hoy, selectedFecha])

  const toggleEjercicio = (fecha, idx) => {
    haptic(8)
    setCompletados(prev => {
      const lista = prev[fecha] ?? []
      const yaEsta = lista.includes(idx)
      const nueva  = yaEsta ? lista.filter(i => i !== idx) : [...lista, idx]

      const rutina = rutinas[semana.find(d => d.fecha === fecha)?.dayOfWeek]
      if (!yaEsta && rutina?.ejercicios?.length > 0 && nueva.length === rutina.ejercicios.length) {
        setConfetti(true)
        haptic(30)
        setTimeout(() => setConfetti(false), 1500)
      }
      return { ...prev, [fecha]: nueva }
    })

    setGuardado(prev => (prev[fecha] ? sinClave(prev, fecha) : prev))
  }

  const updateLog = (fecha, idx, field, value) => {
    setLogData(prev => ({
      ...prev,
      [fecha]: { ...(prev[fecha] ?? {}), [idx]: { ...(prev[fecha]?.[idx] ?? {}), [field]: value } },
    }))
  }

  const guardarSesion = async (fecha, dayOfWeek) => {
    const rutina = rutinas[dayOfWeek]
    const completadosDelDia = completados[fecha] || []
    setGuardando(true)
    // Un solo envío: el servidor reemplaza los ejercicios del día y marca la
    // sesión como hecha. O se guarda todo o nada.
    const ejercicios = completadosDelDia
      .map(idx => {
        const ejercicio = rutina.ejercicios[idx]
        if (!ejercicio) return null
        const logEx = logData[fecha]?.[idx] ?? {}
        const m = String(logEx.peso || ejercicio.peso || '').replace(',', '.').match(/\d+(\.\d+)?/)
        return {
          nombre:  ejercicio.nombre,
          musculo: ejercicio.musculo || '',
          series:  ejercicio.series,
          reps:    logEx.reps || ejercicio.reps,
          peso_kg: m ? parseFloat(m[0]) : null,
          notas:   logEx.nota || '',
        }
      })
      .filter(Boolean)
    try {
      await registrarSesion({
        fecha, rutina: rutina.id, ejercicios,
        notas: `${ejercicios.length}/${rutina.ejercicios.length} ejercicios`,
      })
      haptic(20)
      setGuardado(prev => ({ ...prev, [fecha]: true }))
      setTimeout(() => setGuardado(prev => sinClave(prev, fecha)), 2000)
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo guardar la sesión. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const abrirEditor = (dia) => {
    setDiaEditor(dia)
    setEditorKey(k => k + 1)
    setEditorDia(dia)
  }

  const handleSaveRutina = async (dayOfWeek, { nombre, ejercicios, emoji: newEmoji }) => {
    const rutinaActual = rutinas[dayOfWeek]
    setRutinas(prev => ({
      ...prev,
      [dayOfWeek]: { ...prev[dayOfWeek], nombre, ejercicios, emoji: newEmoji ?? prev[dayOfWeek].emoji },
    }))
    setEditorDia(null)

    try {
      await guardarRutinaDia({
        dia_semana: dayOfWeek,
        nombre,
        rutina_id: rutinaActual.id,
        emoji: newEmoji ?? rutinaActual.emoji,
        ejercicios,
      })
      toast.success('Rutina guardada')
    } catch (e) {
      console.error('Error guardando rutina en el servidor:', e)
      setRutinas(prev => ({ ...prev, [dayOfWeek]: rutinaActual }))
      toast.error('No se pudo guardar la rutina.')
    }
  }

  const handleCrearEjercicioPersonalizado = async (ejercicio) => {
    setPool(prev => [...prev, ejercicio])
    try {
      await crearEjercicioPersonalizado({
        nombre: ejercicio.nombre,
        musculo: ejercicio.musculo,
        series: ejercicio.series,
        reps: ejercicio.reps,
        peso: ejercicio.peso,
        color: ejercicio.color,
      })
    } catch (e) {
      console.error('Error guardando ejercicio personalizado en el servidor:', e)
      toast.error('El ejercicio no se guardó en tu cuenta.')
    }
  }

  const diaSeleccionado          = semana.find(d => d.fecha === selectedFecha)
  const rutinaSeleccionada       = diaSeleccionado ? rutinas[diaSeleccionado.dayOfWeek] : null
  const colores                  = rutinaSeleccionada ? COLORES_RUTINA[rutinaSeleccionada.id] ?? COLORES_RUTINA.A : null
  const completadosSeleccionados = completados[selectedFecha] ?? []
  const totalEjerciciosDia       = rutinaSeleccionada?.ejercicios?.length ?? 0
  const sesionCompleta           = totalEjerciciosDia > 0 && completadosSeleccionados.length === totalEjerciciosDia
  const diasAbr                  = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div style={{ padding: 'calc(var(--safe-top) + 20px) 16px 0' }}>

      {diaEditor !== null && (
        <RutinaEditor
          key={editorKey}
          open={editorDia !== null}
          rutina={rutinas[diaEditor]}
          colores={COLORES_RUTINA[rutinas[diaEditor].id] ?? COLORES_RUTINA.A}
          pool={pool}
          onSave={(data) => handleSaveRutina(diaEditor, data)}
          onClose={() => setEditorDia(null)}
          onCrearEjercicio={handleCrearEjercicioPersonalizado}
        />
      )}

      {/* Header */}
      <header className={entrar ? 'nf-enter' : undefined} style={{ padding: '0 4px', marginBottom: '20px' }}>
        <h1 className='nf-large-title'>{t?.gym ?? 'Gym'}</h1>
        <p className='nf-subhead'>{t?.weeklyPlan ?? 'Tu plan semanal'}</p>
      </header>

      <ResumenSemanal semana={semana} completados={completados} rutinas={rutinas} pool={pool} />

      {/* Semana: 7 días caben en el ancho, sin scroll lateral */}
      <div role='tablist' aria-label='Días de la semana' style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '20px' }}>
        {semana.map(({ fecha, dayOfWeek, d }) => {
          const rutina          = rutinas[dayOfWeek]
          const coloresDia      = COLORES_RUTINA[rutina.id] ?? COLORES_RUTINA.A
          const esSeleccionado  = fecha === selectedFecha
          const esHoy           = fecha === hoy
          const hechos          = (completados[fecha] || []).length
          const totalEjercicios = rutina.ejercicios.length
          const pct             = totalEjercicios > 0 ? hechos / totalEjercicios : 0
          const terminado       = pct === 1 && totalEjercicios > 0

          return (
            <button
              key={fecha}
              role='tab'
              aria-selected={esSeleccionado}
              aria-label={`${d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}: ${rutina.nombre}${terminado ? ', completado' : ''}`}
              onClick={() => setSelectedFecha(fecha)}
              style={{
                height: '84px', borderRadius: '16px', position: 'relative', overflow: 'hidden',
                background: esSeleccionado ? 'var(--surface-2)' : 'transparent',
                boxShadow: esSeleccionado
                  ? `inset 0 0 0 1.5px ${coloresDia.text}`
                  : esHoy ? `inset 0 0 0 1px ${coloresDia.text}66` : 'inset 0 0 0 0.5px var(--separator)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                padding: 0,
              }}
            >
              {/* Progreso del día: se llena desde abajo */}
              <span aria-hidden='true' style={{
                position: 'absolute', inset: 0, background: coloresDia.bg,
                transform: `scaleY(${pct})`, transformOrigin: 'bottom',
                transition: 'transform 400ms var(--ease-out)',
              }} />
              <span style={{ position: 'relative', fontSize: '12px', fontWeight: 600, color: esHoy ? coloresDia.text : 'var(--label-3)' }}>
                {diasAbr[dayOfWeek]}
              </span>
              <span className='nf-num' style={{ position: 'relative', fontSize: '17px', fontWeight: 700, color: esSeleccionado ? coloresDia.text : 'var(--label)' }}>
                {d.getDate()}
              </span>
              <span style={{ position: 'relative', fontSize: '16px', lineHeight: 1, height: '18px', display: 'flex', alignItems: 'center' }}>
                {terminado
                  ? <IconCheck size={16} color={coloresDia.text} strokeWidth={3} />
                  : rutina.emoji}
              </span>
            </button>
          )
        })}
      </div>

      {/* Detalle del día */}
      {rutinaSeleccionada && (
        <section className='nf-card' style={{
          overflow: 'hidden', position: 'relative',
          boxShadow: sesionCompleta ? `inset 0 0 0 1px ${colores.text}80, 0 0 28px ${colores.glow}` : undefined,
          transition: 'box-shadow 400ms ease',
        }}>
          {confetti && <Confetti color={colores.text} />}

          <div style={{
            background: colores.bg,
            padding: '14px 12px 14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 className='nf-headline' style={{ color: colores.text }}>{rutinaSeleccionada.emoji} {rutinaSeleccionada.nombre}</h2>
                {sesionCompleta && <span className='nf-badge' style={{ '--tint': colores.text }}><IconCheck size={12} strokeWidth={3} /> Completado</span>}
              </div>
              {totalEjerciciosDia > 0 && (
                <p className='nf-footnote nf-num' style={{ color: colores.text, opacity: 0.8 }}>
                  {completadosSeleccionados.length} de {totalEjerciciosDia} ejercicios
                </p>
              )}
            </div>
            <button onClick={() => abrirEditor(diaSeleccionado.dayOfWeek)} className='nf-btn nf-btn--sm nf-btn--tinted' style={{ '--tint': colores.text }}>
              <IconPencil size={15} /> Editar
            </button>
          </div>

          {rutinaSeleccionada.ejercicios.length > 0 ? (
            <>
              <ul style={{ listStyle: 'none' }}>
                {rutinaSeleccionada.ejercicios.map((ex, j) => {
                  const hecho      = completadosSeleccionados.includes(j)
                  const key        = `${selectedFecha}_${j}`
                  const isExpanded = expandido[key] ?? false
                  const logEx      = logData[selectedFecha]?.[j] ?? {}
                  const timerOpen  = timerAbierto === key
                  const exColor    = getEjercicioColor(ex, pool)
                  const musculo    = ex.musculo || pool.find(p => p.nombre === ex.nombre)?.musculo || ''

                  return (
                    <li key={j} className='nf-row' style={{ display: 'block', padding: 0, '--row-inset': '60px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 4px 4px 4px' }}>
                        {/* Check: 44px de área táctil */}
                        <button
                          onClick={() => toggleEjercicio(selectedFecha, j)}
                          role='checkbox'
                          aria-checked={hecho}
                          aria-label={`Marcar ${ex.nombre}`}
                          className='nf-icon-btn'
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
                          onClick={() => setExpandido(prev => ({ ...prev, [key]: !isExpanded }))}
                          aria-expanded={isExpanded}
                          className='nf-press-soft'
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
                                {logEx.peso && <span style={{ color: colores.text, marginLeft: '4px', fontWeight: 700 }}>→ {logEx.peso} kg</span>}
                              </span>
                            </span>
                          </span>
                          <IconChevronRight size={18} color='var(--label-4)' style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)', flexShrink: 0 }} />
                        </button>

                        <button
                          onClick={() => setTimerAbierto(prev => prev === key ? null : key)}
                          className='nf-icon-btn'
                          aria-label={`Temporizador de descanso para ${ex.nombre}`}
                          aria-pressed={timerOpen}
                          style={{ color: timerOpen ? colores.text : 'var(--label-3)' }}
                        >
                          <IconClock size={20} />
                        </button>
                      </div>

                      {/* Registro real */}
                      <div className='nf-collapse' data-open={isExpanded}>
                        <div>
                          <div style={{ padding: '4px 16px 16px 52px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <label>
                                <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>Peso real (kg)</span>
                                <input
                                  type='number' step='0.5' inputMode='decimal'
                                  className='nf-input nf-num'
                                  tabIndex={isExpanded ? 0 : -1}
                                  value={logEx.peso ?? ''}
                                  placeholder={ex.peso}
                                  onChange={e => updateLog(selectedFecha, j, 'peso', e.target.value)}
                                  style={{ '--tint': colores.text }}
                                />
                              </label>
                              <label>
                                <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>Reps reales</span>
                                <input
                                  type='text' inputMode='numeric'
                                  className='nf-input nf-num'
                                  tabIndex={isExpanded ? 0 : -1}
                                  value={logEx.reps ?? ''}
                                  placeholder={ex.reps}
                                  onChange={e => updateLog(selectedFecha, j, 'reps', e.target.value)}
                                  style={{ '--tint': colores.text }}
                                />
                              </label>
                            </div>
                            <input
                              type='text'
                              className='nf-input'
                              tabIndex={isExpanded ? 0 : -1}
                              aria-label='Nota del ejercicio'
                              value={logEx.nota ?? ''}
                              placeholder='Nota: ej. "sentí el hombro raro"'
                              onChange={e => updateLog(selectedFecha, j, 'nota', e.target.value)}
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

              {completadosSeleccionados.length > 0 && (
                <div className='nf-reveal' style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)', padding: '14px 16px 16px' }}>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{
                      height: '100%', width: '100%', background: colores.text, borderRadius: '2px',
                      transform: `scaleX(${completadosSeleccionados.length / totalEjerciciosDia})`, transformOrigin: 'left',
                      transition: 'transform 400ms var(--ease-out)',
                    }} />
                  </div>

                  <button
                    onClick={() => guardarSesion(selectedFecha, diaSeleccionado.dayOfWeek)}
                    disabled={guardando}
                    className={`nf-btn nf-btn--block nf-btn--lg ${sesionCompleta && !guardado[selectedFecha] ? 'nf-btn--primary' : 'nf-btn--tinted'}`}
                    style={{ '--tint': colores.text }}
                    aria-live='polite'
                  >
                    <IconCheck size={19} />
                    {guardado[selectedFecha]
                      ? 'Sesión guardada'
                      : guardando
                        ? 'Guardando…'
                        : sesionCompleta
                          ? 'Guardar sesión completa'
                          : `Guardar (${completadosSeleccionados.length}/${totalEjerciciosDia})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '34px', marginBottom: '8px' }}>🛌</p>
              <p className='nf-headline' style={{ marginBottom: '4px' }}>Día de descanso</p>
              <p className='nf-footnote'>Recuperar también es entrenar. Toca "Editar" si quieres agregar algo.</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
