import { useState, useEffect, useRef, useCallback } from 'react'
import { IconCheck, IconChevronRight, IconPlus, IconX, IconClock, IconPencil, IconTrash, IconSearch, IconGripVertical, IconPalette } from '@tabler/icons-react'
import {
  registrarSesion, logEjercicio, getSesionFecha,
  getRutinasDia, guardarRutinaDia,
  getEjerciciosPersonalizados, crearEjercicioPersonalizado,
} from '../api'
import bruceFace from '../assets/bruce-face.png'

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

// Pool global de ejercicios disponibles
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
  'A': { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.2)', text: '#4ade80', glow: 'rgba(74,222,128,0.3)' },
  'B': { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.2)', text: '#60a5fa', glow: 'rgba(96,165,250,0.3)' },
  'C': { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.2)', text: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
  'D': { bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.2)', text: '#fb923c', glow: 'rgba(251,146,60,0.3)' },
  'R': { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.3)', glow: 'transparent' },
}

// Mismo sistema de colores del calendario, por grupo muscular
const COLORES_MUSCULO = {
  'Piernas':  { text: '#4ade80', bg: 'rgba(74,222,128,0.12)' },   // verde  — rutina A
  'Pecho':    { text: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },   // azul   — rutina B
  'Hombros':  { text: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },   // azul   — rutina B
  'Espalda':  { text: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },  // púrpura — rutina C
  'Brazos':   { text: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },  // púrpura — rutina C
  'Core':     { text: '#4ade80', bg: 'rgba(74,222,128,0.12)' },   // verde  — complementario
  'Cardio':   { text: '#fb923c', bg: 'rgba(251,146,60,0.12)' },   // naranja — rutina D
}


// Devuelve { text, bg } para un ejercicio del pool, ya sea predefinido o personalizado
function colorParaEjercicio(ex, colorFallback) {
  if (ex.custom && ex.color) {
    return { text: ex.color, bg: ex.color + '26' } // 26 hex ≈ 15% alpha
  }
  return COLORES_MUSCULO[ex.musculo] ?? { text: colorFallback, bg: colorFallback + '20' }
}

// ─── CONFETTI ──────────────────────────────────────────────────────────────────
function Confetti({ color }) {
  const [particles] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      delay: Math.random() * 0.4,
      size: 4 + Math.random() * 5,
      rot: Math.random() * 360,
      hue: Math.random() > 0.5 ? color : '#fff',
    }))
  )
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: '22px', zIndex: 10 }}>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`, top: '-8px',
          width: `${p.size}px`, height: `${p.size}px`,
          background: p.hue,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          animation: `confettiFall 1.1s ease-in ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  )
}

// ─── TIMER ─────────────────────────────────────────────────────────────────────
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
        if (prev <= 1) { clearInterval(intervalRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const done = remaining === 0
  const pct  = remaining !== null ? (remaining / sel) : 1
  const r    = 22
  const circ = 2 * Math.PI * r

  return (
    <div style={{
      background: '#1a1a1a', border: `0.5px solid ${color}40`,
      borderRadius: '16px', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
      marginTop: '8px',
    }}>
      {/* Circular progress */}
      <div style={{ position: 'relative', width: '54px', height: '54px', flexShrink: 0 }}>
        <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle cx="27" cy="27" r={r} fill="none" stroke={done ? '#4ade80' : color}
            strokeWidth="3"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: done ? '18px' : '13px', fontWeight: '700',
          color: done ? '#4ade80' : '#fff',
        }}>
          {done ? '✓' : remaining !== null ? remaining : <IconClock size={16} color={color} />}
        </div>
      </div>

      {/* Options */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          {OPTIONS.map(s => (
            <button key={s} onClick={() => { setSel(s); start(s) }} style={{
              flex: 1, padding: '6px 0', borderRadius: '8px', border: 'none',
              background: sel === s && remaining !== null ? `${color}25` : 'rgba(255,255,255,0.06)',
              color: sel === s && remaining !== null ? color : 'rgba(255,255,255,0.4)',
              fontSize: '11px', fontWeight: '700', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {s}s
            </button>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: done ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
          {done ? '¡Listo, a la siguiente serie!' : remaining !== null ? 'Descansando…' : 'Toca para iniciar'}
        </p>
      </div>

      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.3)' }}>
        <IconX size={16} />
      </button>
    </div>
  )
}

// ─── CREAR EJERCICIO PERSONALIZADO ──────────────────────────────────────────────
function CrearEjercicioForm({ colores, onCrear, onCancel }) {
  const [nombre, setNombre]     = useState('')
  const [musculo, setMusculo]   = useState('')
  const [series, setSeries]     = useState('3')
  const [reps, setReps]         = useState('10')
  const [peso, setPeso]         = useState('')
  const [color, setColor]       = useState('#4ade80')

  const puedeCrear = nombre.trim().length > 0

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.07)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '12px', color: '#fff',
    fontSize: '14px', fontWeight: '600',
    padding: '11px 14px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const labelStyle = {
    fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontWeight: '700',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block',
  }

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
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `0.5px solid ${color}40`,
      borderRadius: '16px', padding: '14px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IconPalette size={14} color={color} />
          Nuevo ejercicio
        </p>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px' }}>
          <IconX size={16} />
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <span style={labelStyle}>Nombre del ejercicio</span>
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder='Ej. Hip thrust'
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Categoría / músculo</span>
          <input
            value={musculo}
            onChange={e => setMusculo(e.target.value)}
            placeholder='Ej. Glúteos'
            style={inputStyle}
          />
        </div>
        <div style={{ width: '64px', flexShrink: 0 }}>
          <span style={labelStyle}>Color</span>
          <input
            type='color'
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{
              width: '100%', height: '40px', borderRadius: '12px',
              border: '0.5px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.07)',
              padding: '4px', cursor: 'pointer',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Series</span>
          <input
            type='number' min='1'
            value={series}
            onChange={e => setSeries(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Reps</span>
          <input
            value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder='Ej. 10 o 45s'
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Peso</span>
          <input
            value={peso}
            onChange={e => setPeso(e.target.value)}
            placeholder='Ej. 20 kg'
            style={inputStyle}
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!puedeCrear}
        style={{
          width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
          background: puedeCrear ? color : 'rgba(255,255,255,0.06)',
          color: puedeCrear ? '#000' : 'rgba(255,255,255,0.3)',
          fontSize: '13px', fontWeight: '700',
          cursor: puedeCrear ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          transition: 'all 0.15s',
        }}
      >
        <IconPlus size={14} />
        Crear y agregar
      </button>
    </div>
  )
}

// ─── EDITOR DE RUTINA ──────────────────────────────────────────────────────────
function RutinaEditor({ rutina, dayOfWeek, colores, pool, onSave, onClose, onCrearEjercicio }) {
  const [ejercicios, setEjercicios] = useState([...rutina.ejercicios])
  const [nombre, setNombre]         = useState(rutina.nombre)
  const [vistaPool, setVistaPool]   = useState(false)
  const [busqueda, setBusqueda]     = useState('')
  const [filtroMus, setFiltroMus]   = useState('Todos')
  const [mostrarCrear, setMostrarCrear] = useState(false)

  const musculos = ['Todos', ...new Set(pool.map(e => e.musculo))]

  const poolFiltrado = pool.filter(e => {
    const matchMus = filtroMus === 'Todos' || e.musculo === filtroMus
    const matchBus = e.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const yaEsta   = ejercicios.some(ex => ex.nombre === e.nombre)
    return matchMus && matchBus && !yaEsta
  })

  const agregarDelPool = (ex) => {
    setEjercicios(prev => [...prev, { ...ex }])
  }

  const quitarEjercicio = (idx) => {
    setEjercicios(prev => prev.filter((_, i) => i !== idx))
  }

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
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: '#0d0d0d',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header — padding superior fijo generoso para despejar el notch/Dynamic Island del iPhone.
          Se usa un valor fijo (no solo env()) porque env(safe-area-inset-top) requiere
          viewport-fit=cover en el <meta name="viewport"> del index.html para funcionar;
          si esa meta no está presente, env() devuelve 0px y el header queda pegado arriba. */}
      <div style={{
        padding: 'max(48px, env(safe-area-inset-top, 48px)) 16px 16px',
        borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', padding: '10px',
          borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, minWidth: '40px', minHeight: '40px',
        }}>
          <IconX size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            style={{
              background: 'none', border: 'none', outline: 'none',
              fontSize: '20px', fontWeight: '700', color: '#fff',
              fontFamily: 'inherit', width: '100%', letterSpacing: '-0.5px',
            }}
          />
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
            {ejercicios.length} ejercicios
          </p>
        </div>
        <button onClick={() => onSave({ nombre, ejercicios })} style={{
          background: colores.text, color: '#000',
          border: 'none', borderRadius: '12px',
          padding: '12px 18px', fontSize: '13px', fontWeight: '700',
          cursor: 'pointer', flexShrink: 0, minHeight: '40px',
        }}>
          Guardar
        </button>
      </div>

      {/* Toggle lista / pool */}
      <div style={{ display: 'flex', padding: '12px 16px', gap: '8px', flexShrink: 0 }}>
        {[
          { id: false, label: `Mi rutina (${ejercicios.length})` },
          { id: true,  label: `+ Agregar ejercicio` },
        ].map(({ id, label }) => (
          <button key={String(id)} onClick={() => setVistaPool(id)} style={{
            flex: 1, padding: '10px', borderRadius: '12px', border: 'none',
            background: vistaPool === id ? `${colores.text}20` : 'rgba(255,255,255,0.05)',
            color: vistaPool === id ? colores.text : 'rgba(255,255,255,0.4)',
            fontSize: '12px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s',
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{
        flex: 1, overflowY: 'auto',
        padding: `0 16px max(32px, env(safe-area-inset-bottom, 32px))`,
      }}>
        {!vistaPool ? (
          /* ── Lista de ejercicios actuales ── */
          ejercicios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>💪</p>
              <p style={{ fontSize: '14px' }}>Sin ejercicios aún</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Agrega desde el pool</p>
            </div>
          ) : (
            ejercicios.map((ex, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 0',
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
              }}>
                {/* Reorder */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button onClick={() => moverEjercicio(i, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)', padding: '2px', lineHeight: 1, fontSize: '10px' }}>▲</button>
                  <button onClick={() => moverEjercicio(i, 1)}  style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === ejercicios.length-1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)', padding: '2px', lineHeight: 1, fontSize: '10px' }}>▼</button>
                </div>

                {/* Color dot para personalizados */}
                {ex.custom && ex.color && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ex.color, flexShrink: 0 }} />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '3px' }}>{ex.nombre}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{ex.series}x{ex.reps} - {ex.peso}</p>
                </div>

                <button onClick={() => quitarEjercicio(i)} style={{
                  background: 'rgba(239,68,68,0.1)', border: 'none',
                  width: '28px', height: '28px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#ef4444',
                }}>
                  <IconTrash size={13} />
                </button>
              </div>
            ))
          )
        ) : (
          /* ── Pool de ejercicios ── */
          <>
            {/* Botón crear ejercicio personalizado */}
            {!mostrarCrear && (
              <button
                onClick={() => setMostrarCrear(true)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '14px',
                  border: `0.5px dashed ${colores.text}40`,
                  background: `${colores.text}10`,
                  color: colores.text, fontSize: '12px', fontWeight: '700',
                  cursor: 'pointer', marginBottom: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                <IconPalette size={14} />
                Crear ejercicio personalizado
              </button>
            )}

            {mostrarCrear && (
              <CrearEjercicioForm
                colores={colores}
                onCrear={handleCrearEjercicio}
                onCancel={() => setMostrarCrear(false)}
              />
            )}

            {/* Búsqueda */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
              padding: '10px 12px', marginBottom: '12px',
            }}>
              <IconSearch size={14} color='rgba(255,255,255,0.3)' />
              <input
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder='Buscar ejercicio…'
                style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', flex: 1, fontFamily: 'inherit' }}
              />
            </div>

            {/* Filtro por músculo */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' }}>
              {musculos.map(m => {
                const mc = COLORES_MUSCULO[m] ?? { text: colores.text, bg: `${colores.text}20` }
                const activo = filtroMus === m
                return (
                  <button key={m} onClick={() => setFiltroMus(m)} style={{
                    whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '20px', border: 'none',
                    background: activo ? mc.text : 'rgba(255,255,255,0.07)',
                    color: activo ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    {m}
                  </button>
                )
              })}
            </div>

            {poolFiltrado.map((ex, i) => {
              const mc = colorParaEjercicio(ex, colores.text)
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 0',
                  borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '3px' }}>{ex.nombre}</p>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '9px', padding: '2px 7px', borderRadius: '20px',
                        background: mc.bg, color: mc.text, fontWeight: '700',
                      }}>{ex.musculo}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{ex.series}x{ex.reps} - {ex.peso}</span>
                    </div>
                  </div>
                  <button onClick={() => agregarDelPool(ex)} style={{
                    background: mc.bg, border: '0.5px solid ' + mc.text + '40',
                    width: '30px', height: '30px', borderRadius: '9px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: mc.text, flexShrink: 0,
                  }}>
                    <IconPlus size={14} />
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function GymScreen({ t }) {
  // Arrancan con los valores por defecto; se sobreescriben con lo que venga
  // del backend en cuanto cargue (ver useEffect de carga inicial más abajo).
  const [rutinas, setRutinas]           = useState(RUTINAS_DEFAULT)
  const [pool, setPool]                 = useState(POOL_DEFAULT)
  const [cargandoRutinas, setCargandoRutinas] = useState(true)
  const [selectedFecha, setSelectedFecha] = useState(null)
  const [completados, setCompletados]   = useState({})
  const [logData, setLogData]           = useState({})       // { fecha: { idx: { peso, reps, nota } } }
  const [expandido, setExpandido]       = useState({})       // { fecha_idx: bool }
  const [timerAbierto, setTimerAbierto] = useState(null)     // 'fecha_idx' | null
  const [guardando, setGuardando]       = useState(false)
  const [guardado, setGuardado]         = useState({})
  const [confetti, setConfetti]         = useState(false)
  const [editorDia, setEditorDia]       = useState(null)     // dayOfWeek | null
  const [semanaAnterior, setSemanaAnterior] = useState({})   // { fecha: [ejerciciosGuardados] }

  const [hoy] = useState(() => new Date().toISOString().split('T')[0])

  // ── Cargar rutinas personalizadas y pool de ejercicios desde el backend ──
  useEffect(() => {
    let cancelado = false

    const cargarDatosGym = async () => {
      try {
        const [rutinasGuardadas, ejerciciosCustom] = await Promise.all([
          getRutinasDia().catch(() => ({})),
          getEjerciciosPersonalizados().catch(() => []),
        ])

        if (cancelado) return

        // Merge: empieza de los defaults y sobreescribe los días que el usuario editó
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
          setPool(prev => [...POOL_DEFAULT, ...ejerciciosCustom])
        }
      } catch (e) {
        console.error('Error cargando datos de gym:', e)
      } finally {
        if (!cancelado) setCargandoRutinas(false)
      }
    }

    cargarDatosGym()
    return () => { cancelado = true }
  }, [])

  // ── Semana actual ──
  const semana = [...Array(7)].map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const fecha = d.toISOString().split('T')[0]
    const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1
    return { fecha, dayOfWeek, d }
  })

  // ── Cargar sesión de una fecha ──
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

  // ── Cargar TODAS las sesiones de la semana al montar ── (fix del bug del calendario)
  useEffect(() => {
    const cargarTodas = async () => {
      await Promise.all(semana.map(({ fecha }) => cargarSesionFecha(fecha)))
    }
    cargarTodas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedFecha) setSelectedFecha(hoy)
  }, [hoy, selectedFecha])

  // ── Toggle ejercicio — nunca se bloquea, guardado solo es visual ──
  const toggleEjercicio = (fecha, idx) => {
    setCompletados(prev => {
      const lista = prev[fecha] ?? []
      const yaEsta = lista.includes(idx)
      const nueva  = yaEsta ? lista.filter(i => i !== idx) : [...lista, idx]

      // Check confetti
      const rutina = rutinas[semana.find(d => d.fecha === fecha)?.dayOfWeek]
      if (rutina?.ejercicios?.length > 0 && nueva.length === rutina.ejercicios.length) {
        setConfetti(true)
        setTimeout(() => setConfetti(false), 1500)
      }
      return { ...prev, [fecha]: nueva }
    })

    // Al volver a tocar un ejercicio, permitir guardar de nuevo
    setGuardado(prev => {
      if (!prev[fecha]) return prev
      const { [fecha]: _omit, ...resto } = prev
      return resto
    })
  }

  // ── Log inline ──
  const updateLog = (fecha, idx, field, value) => {
    setLogData(prev => ({
      ...prev,
      [fecha]: { ...(prev[fecha] ?? {}), [idx]: { ...(prev[fecha]?.[idx] ?? {}), [field]: value } }
    }))
  }

  // ── Guardar sesión ──
  const guardarSesion = async (fecha, dayOfWeek) => {
    const rutina = rutinas[dayOfWeek]
    const completadosDelDia = completados[fecha] || []
    setGuardando(true)
    try {
      await registrarSesion({
        fecha, rutina: rutina.id, completada: false,
        notas: `${completadosDelDia.length}/${rutina.ejercicios.length} ejercicios`,
      })
      for (const idx of completadosDelDia) {
        const ejercicio = rutina.ejercicios[idx]
        if (!ejercicio) continue
        const logEx = logData[fecha]?.[idx] ?? {}
        const pesoKg = logEx.peso ? parseFloat(logEx.peso) : (() => {
          const m = ejercicio.peso.match(/[\d.]+/)
          return m ? parseFloat(m[0]) : null
        })()
        try {
          await logEjercicio({
            fecha, nombre: ejercicio.nombre,
            series: ejercicio.series,
            reps: logEx.reps || ejercicio.reps,
            peso_kg: pesoKg,
            notas: logEx.nota || '',
          })
        } catch {}
      }
      setGuardado(prev => ({ ...prev, [fecha]: true }))
      // Después de un momento se vuelve a permitir guardar (por si el usuario sigue marcando)
      setTimeout(() => {
        setGuardado(prev => {
          const { [fecha]: _omit, ...resto } = prev
          return resto
        })
      }, 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }

  // ── Editor de rutina — guarda en el backend para que se vea en todos los dispositivos ──
  const handleSaveRutina = async (dayOfWeek, { nombre, ejercicios }) => {
    const rutinaActual = rutinas[dayOfWeek]

    // Actualización optimista: se ve el cambio al instante en la UI
    setRutinas(prev => ({
      ...prev,
      [dayOfWeek]: { ...prev[dayOfWeek], nombre, ejercicios },
    }))
    setEditorDia(null)

    try {
      await guardarRutinaDia({
        dia_semana: dayOfWeek,
        nombre,
        rutina_id: rutinaActual.id,
        emoji: rutinaActual.emoji,
        ejercicios,
      })
    } catch (e) {
      console.error('Error guardando rutina en el servidor:', e)
      // Si falla el guardado remoto, revertimos para no dar falsa sensación de éxito
      setRutinas(prev => ({ ...prev, [dayOfWeek]: rutinaActual }))
    }
  }

  // ── Crear ejercicio personalizado — se guarda en el backend (pool compartido entre dispositivos) ──
  const handleCrearEjercicioPersonalizado = async (ejercicio) => {
    // Actualización optimista
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
    }
  }

  const diaSeleccionado       = semana.find(d => d.fecha === selectedFecha)
  const rutinaSeleccionada    = diaSeleccionado ? rutinas[diaSeleccionado.dayOfWeek] : null
  const colores               = rutinaSeleccionada ? COLORES_RUTINA[rutinaSeleccionada.id] : null
  const completadosSeleccionados = completados[selectedFecha] ?? []
  const diasAbr = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div style={{ padding: '44px 16px 0', position: 'relative', minHeight: '100%' }}>

      {/* Editor de rutina — overlay dentro del contenedor */}
      {editorDia !== null && (
        <RutinaEditor
          rutina={rutinas[editorDia]}
          dayOfWeek={editorDia}
          colores={COLORES_RUTINA[rutinas[editorDia].id]}
          pool={pool}
          onSave={(data) => handleSaveRutina(editorDia, data)}
          onClose={() => setEditorDia(null)}
          onCrearEjercicio={handleCrearEjercicioPersonalizado}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-1px', marginBottom: '4px' }}>{t?.gym ?? 'Gym'}</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>{t?.weeklyPlan ?? 'Plan semanal'}</p>
        </div>
        <div style={{
          width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #064e3b, #16a34a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(74,222,128,0.25)',
        }}>
          <img src={bruceFace} alt='Bruce' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* Calendario horizontal */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '4px' }}>
        {semana.map(({ fecha, dayOfWeek, d }) => {
          const rutina      = rutinas[dayOfWeek]
          const coloresDia  = COLORES_RUTINA[rutina.id]
          const esSeleccionado = fecha === selectedFecha
          const numDia      = d.getDate()
          const completadosDelDia = completados[fecha] || []
          const totalEjercicios   = rutina.ejercicios.length
          const pct         = totalEjercicios > 0 ? completadosDelDia.length / totalEjercicios : 0
          const terminado   = pct === 1 && totalEjercicios > 0

          return (
            <button key={fecha} onClick={() => setSelectedFecha(fecha)} style={{
              minWidth: '56px', height: '80px', borderRadius: '14px',
              border: esSeleccionado ? `0.5px solid ${coloresDia.text}` : '0.5px solid rgba(255,255,255,0.06)',
              background: 'transparent', position: 'relative', overflow: 'hidden',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '4px', cursor: 'pointer', color: 'inherit', padding: '0',
              transition: 'border-color 0.2s',
            }}>
              {/* Fill animado */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: `${pct * 100}%`,
                background: coloresDia.bg,
                borderRadius: '0 0 14px 14px',
                transition: 'height 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                pointerEvents: 'none',
              }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{diasAbr[dayOfWeek]}</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: esSeleccionado ? coloresDia.text : 'rgba(255,255,255,0.7)' }}>{numDia}</span>
                <div style={{
                  height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: terminado ? 'scale(1)' : 'scale(0.5)',
                  opacity: terminado ? 1 : 0,
                  transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
                }}>
                  <IconCheck size={12} color={coloresDia.text} strokeWidth={3} />
                </div>
                <span style={{ fontSize: '16px' }}>{rutina.emoji}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detalle del día */}
      {rutinaSeleccionada && (
        <div style={{
          background: '#131313', borderRadius: '22px',
          border: '0.5px solid rgba(255,255,255,0.06)',
          overflow: 'hidden', position: 'relative',
        }}>
          {/* Confetti al completar */}
          {confetti && <Confetti color={colores.text} />}

          {/* Header rutina */}
          <div style={{
            background: colores.bg, border: `0.5px solid ${colores.border}`,
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '13px', color: colores.text, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
                {rutinaSeleccionada.nombre}
              </p>
              {rutinaSeleccionada.ejercicios.length > 0 && (
                <p style={{ fontSize: '12px', color: colores.text, opacity: 0.7 }}>
                  {completadosSeleccionados.length}/{rutinaSeleccionada.ejercicios.length} ejercicios
                </p>
              )}
            </div>
            {/* Botón editar rutina */}
            {rutinaSeleccionada.id !== 'R' && (
              <button
                onClick={() => setEditorDia(diaSeleccionado.dayOfWeek)}
                style={{
                  background: `${colores.text}15`, border: `0.5px solid ${colores.text}30`,
                  borderRadius: '10px', padding: '7px 12px',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  color: colores.text, fontSize: '11px', fontWeight: '700',
                  cursor: 'pointer',
                }}>
                <IconPencil size={11} />
                Editar
              </button>
            )}
          </div>

          {/* Ejercicios */}
          {rutinaSeleccionada.ejercicios.length > 0 ? (
            <>
              <div>
                {rutinaSeleccionada.ejercicios.map((ex, j) => {
                  const hecho      = completadosSeleccionados.includes(j)
                  const key        = `${selectedFecha}_${j}`
                  const isExpanded = expandido[key] ?? false
                  const logEx      = logData[selectedFecha]?.[j] ?? {}
                  const timerKey   = `${selectedFecha}_${j}`
                  const timerOpen  = timerAbierto === timerKey

                  return (
                    <div key={j} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
                      {/* Fila principal */}
                      <div
                        onClick={() => {
                          const newExp = !isExpanded
                          setExpandido(prev => ({ ...prev, [key]: newExp }))
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '13px 16px',
                          cursor: 'pointer',
                          background: hecho ? 'rgba(255,255,255,0.015)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        {/* Check */}
                        <div
                          onClick={e => { e.stopPropagation(); toggleEjercicio(selectedFecha, j) }}
                          style={{
                            width: '22px', height: '22px', borderRadius: '50%',
                            border: `1.5px solid ${hecho ? colores.text : 'rgba(255,255,255,0.15)'}`,
                            background: hecho ? colores.text : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, cursor: 'pointer',
                            transition: 'all 0.2s', boxShadow: hecho ? `0 0 8px ${colores.glow}` : 'none',
                          }}
                        >
                          {hecho && <IconCheck size={11} color='#0d0d0d' strokeWidth={3} />}
                        </div>

                        {/* Color dot para personalizados */}
                        {ex.custom && ex.color && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ex.color, flexShrink: 0 }} />
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: '13px', fontWeight: '600',
                            opacity: hecho ? 0.35 : 1,
                            textDecoration: hecho ? 'line-through' : 'none',
                            marginBottom: '2px', transition: 'all 0.2s',
                          }}>
                            {ex.nombre}
                          </p>
                          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                            {ex.series}x{ex.reps} - {ex.peso}
                            {logEx.peso && <span style={{ color: colores.text, marginLeft: '6px', fontWeight: '700' }}>&#x2192; {logEx.peso} kg</span>}
                          </p>
                        </div>

                        {/* Timer btn */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setTimerAbierto(prev => prev === timerKey ? null : timerKey)
                          }}
                          style={{
                            background: timerOpen ? `${colores.text}20` : 'rgba(255,255,255,0.05)',
                            border: 'none', width: '28px', height: '28px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: timerOpen ? colores.text : 'rgba(255,255,255,0.3)',
                            transition: 'all 0.15s', flexShrink: 0,
                          }}
                        >
                          <IconClock size={13} />
                        </button>

                        {/* Expand arrow */}
                        <div style={{
                          color: 'rgba(255,255,255,0.2)', fontSize: '10px',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                          transition: 'transform 0.2s',
                        }}>▶</div>
                      </div>

                      {/* Panel expandido: log de peso/reps/nota */}
                      {isExpanded && (
                        <div style={{
                          padding: '12px 16px 16px 16px',
                          background: 'rgba(255,255,255,0.015)',
                          borderTop: '0.5px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Peso real (kg)</p>
                              <input
                                type='number' step='0.5'
                                value={logEx.peso ?? ''}
                                placeholder={ex.peso}
                                onChange={e => updateLog(selectedFecha, j, 'peso', e.target.value)}
                                style={{
                                  width: '100%', background: 'rgba(255,255,255,0.07)',
                                  border: `0.5px solid rgba(255,255,255,0.12)`,
                                  borderRadius: '12px', color: '#fff',
                                  fontSize: '15px', fontWeight: '600',
                                  padding: '11px 14px', outline: 'none',
                                  fontFamily: 'inherit', boxSizing: 'border-box',
                                }}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reps reales</p>
                              <input
                                type='text'
                                value={logEx.reps ?? ''}
                                placeholder={ex.reps}
                                onChange={e => updateLog(selectedFecha, j, 'reps', e.target.value)}
                                style={{
                                  width: '100%', background: 'rgba(255,255,255,0.07)',
                                  border: '0.5px solid rgba(255,255,255,0.12)',
                                  borderRadius: '12px', color: '#fff',
                                  fontSize: '15px', fontWeight: '600',
                                  padding: '11px 14px', outline: 'none',
                                  fontFamily: 'inherit', boxSizing: 'border-box',
                                }}
                              />
                            </div>
                          </div>
                          <input
                            type='text'
                            value={logEx.nota ?? ''}
                            placeholder='Nota: ej. "sentí el hombro raro"'
                            onChange={e => updateLog(selectedFecha, j, 'nota', e.target.value)}
                            style={{
                              width: '100%', background: 'rgba(255,255,255,0.05)',
                              border: '0.5px solid rgba(255,255,255,0.1)',
                              borderRadius: '12px', color: 'rgba(255,255,255,0.6)',
                              fontSize: '13px', padding: '11px 14px', outline: 'none',
                              fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      )}

                      {/* Timer */}
                      {timerOpen && (
                        <div style={{ padding: '0 16px 12px' }}>
                          <RestTimer color={colores.text} onClose={() => setTimerAbierto(null)} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progreso y guardar */}
              {completadosSeleccionados.length > 0 && (
                <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.04)', padding: '16px' }}>
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{
                      height: '100%', background: colores.text, borderRadius: '2px',
                      transition: 'width 0.4s ease',
                      width: `${(completadosSeleccionados.length / rutinaSeleccionada.ejercicios.length) * 100}%`,
                    }} />
                  </div>
                  <button
                    onClick={() => guardarSesion(selectedFecha, diaSeleccionado.dayOfWeek)}
                    disabled={guardando}
                    style={{
                      width: '100%',
                      background: guardado[selectedFecha] ? `${colores.text}15` : `${colores.text}20`,
                      border: `0.5px solid ${colores.text}40`,
                      borderRadius: '12px', color: colores.text,
                      fontSize: '13px', fontWeight: '700', padding: '13px',
                      cursor: guardando ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      transition: 'all 0.2s',
                      opacity: guardando ? 0.6 : 1,
                    }}
                  >
                    <IconCheck size={14} />
                    {guardado[selectedFecha] ? 'Guardado ✓' : guardando ? 'Guardando…' : `Guardar sesión (${completadosSeleccionados.length}/${rutinaSeleccionada.ejercicios.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              <p style={{ fontSize: '14px' }}>🛌 Día de descanso</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}