import { useState, useEffect, useRef } from 'react'
import {
  IconTrendingDown, IconTrendingUp, IconBarbell, IconToolsKitchen2,
  IconInfoCircle, IconChevronRight, IconRefresh, IconTrophy,
  IconFlame, IconCalendarCheck, IconMeat, IconTarget, IconNotebook, IconDroplet, IconScale,
} from '@tabler/icons-react'
import { registrarPeso, getProgresoCompleto, getHistorialEjercicios, getLogros, marcarLogrosVistos } from '../api'
import Segmented from '../components/Segmented'
import { toast } from '../lib/toast'
import { haptic, useEntrada } from '../lib/motion'
import bruceFace from '../assets/bruce-face.webp'

const C = {
  green:  '#4ade80',
  blue:   '#60a5fa',
  purple: '#a78bfa',
  orange: '#f97316',
  yellow: '#fbbf24',
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const fechaLocal = (d = new Date()) => d.toLocaleDateString('en-CA')
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function BruceAvatar({ size = 38 }) {
  return (
    <img src={bruceFace} alt='' width={size} height={size} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
      background: 'linear-gradient(135deg, #064e3b, #16a34a)',
    }} />
  )
}

function Label({ children, style }) {
  return <p className='nf-footnote' style={{ fontWeight: 600, marginBottom: '8px', ...style }}>{children}</p>
}

// ── Score semanal ─────────────────────────────────────────────────────────
function ScoreArc({ score, animado, desglose }) {
  const [mostrarInfo, setMostrarInfo] = useState(false)
  const ref = useRef(null)
  const R = 54, cx = 70, cy = 70
  const startAngle = -210, totalDeg = 240
  const pct = animado ? clamp(score, 0, 100) / 100 : 0
  const toRad = d => (d * Math.PI) / 180
  const ptOn  = (deg) => [cx + R * Math.cos(toRad(deg)), cy + R * Math.sin(toRad(deg))]
  const [sx, sy]   = ptOn(startAngle)
  const [ex, ey]   = ptOn(startAngle + totalDeg)
  const scoreColor = score >= 80 ? C.green : score >= 50 ? C.yellow : C.orange
  const arco = `M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`

  // Cerrar el detalle al tocar fuera
  useEffect(() => {
    if (!mostrarInfo) return
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setMostrarInfo(false) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [mostrarInfo])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={140} height={100} viewBox='0 0 140 100' role='img' aria-label={`Score semanal: ${score} de 100`}>
        <path d={arco} fill='none' stroke='rgba(255,255,255,0.08)' strokeWidth={9} strokeLinecap='round' />
        {/* pathLength=100: el arco se dibuja animando el dashoffset */}
        <path d={arco} pathLength={100} fill='none' stroke={scoreColor} strokeWidth={9} strokeLinecap='round'
          strokeDasharray='100' strokeDashoffset={100 - pct * 100}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-out) 150ms, stroke 300ms ease', opacity: pct > 0.005 ? 1 : 0 }} />
        <text x={cx} y={cy + 6} textAnchor='middle' fill='#fff' fontSize={28} fontWeight={700} fontFamily='inherit' style={{ fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </text>
        <text x={cx} y={cy + 22} textAnchor='middle' fill='rgba(235,235,245,0.42)' fontSize={11} fontFamily='inherit'>de 100</text>
      </svg>
      <button
        onClick={() => setMostrarInfo(v => !v)}
        className='nf-icon-btn nf-icon-btn--sm'
        aria-label='Cómo se calcula el score'
        aria-expanded={mostrarInfo}
        style={{ position: 'absolute', top: '-8px', right: '-10px', color: mostrarInfo ? 'var(--label)' : 'var(--label-3)' }}
      >
        <IconInfoCircle size={18} />
      </button>
      {mostrarInfo && desglose && (
        <div
          role='dialog'
          aria-label='Cómo se calcula el score'
          className='nf-glass'
          style={{
            position: 'absolute', top: '26px', left: '-4px', zIndex: 10,
            borderRadius: '16px', padding: '14px', width: '220px',
            transformOrigin: 'top right',
            animation: 'nf-pop-in 180ms var(--ease-out)',
          }}
        >
          <p className='nf-footnote' style={{ fontWeight: 600, marginBottom: '10px', color: 'var(--label)' }}>Cómo se calcula</p>
          {[
            { label: 'Gym (50%)',        val: desglose.dias_gym,     total: desglose.dias_planeados ?? 7, pts: desglose.pct_gym,        color: C.green  },
            { label: 'Calorías (35%)',   val: desglose.dias_cal,     total: 7, pts: desglose.pct_cal,        color: C.blue   },
            { label: 'Constancia (15%)', val: desglose.dias_activos, total: 7, pts: desglose.pct_constancia, color: C.purple },
          ].map(({ label, val, total, pts, color }) => (
            <div key={label} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className='nf-caption' style={{ color: 'var(--label-2)' }}>{label}</span>
                <span className='nf-num' style={{ fontSize: '12px', fontWeight: 700, color }}>+{pts} pts</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', background: color, transform: `scaleX(${Math.min(val / total, 1)})`, transformOrigin: 'left' }} />
              </div>
              <span className='nf-caption nf-num'>{val} de {total} días</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// El anillo de gym se cierra con los días que la persona planeó entrenar, no con 7
const ANILLOS = (diasGym, diasCal, diasActivos, planeados = 7) => [
  { label: 'Gym',       dias: diasGym,     total: planeados, color: C.green,  r: 44, stroke: 10 },
  { label: 'Calorías',  dias: diasCal,     total: 7,         color: C.blue,   r: 32, stroke: 9  },
  { label: 'Actividad', dias: diasActivos, total: 7,         color: C.purple, r: 20, stroke: 8  },
].map(a => ({ ...a, val: a.dias / a.total }))

function AnillosFitness({ anillos, animado }) {
  const SIZE = 110
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden='true' style={{ flexShrink: 0 }}>
      {anillos.map(({ val, color, r, stroke }) => {
        const c = SIZE / 2
        const pct = animado ? clamp(val, 0, 1) : 0
        return (
          <g key={r}>
            <circle cx={c} cy={c} r={r} fill='none' stroke={`${color}22`} strokeWidth={stroke} />
            <circle cx={c} cy={c} r={r} fill='none' stroke={color} strokeWidth={stroke}
              strokeLinecap='round' pathLength={100}
              strokeDasharray='100' strokeDashoffset={100 - pct * 100}
              transform={`rotate(-90 ${c} ${c})`}
              style={{ transition: 'stroke-dashoffset 900ms var(--ease-out) 250ms', opacity: pct > 0.005 ? 1 : 0 }}
            />
          </g>
        )
      })}
    </svg>
  )
}

function LeyendaAnillos({ anillos }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '14px', paddingTop: '14px', boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
      {anillos.map(({ label, dias, total, color }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <p className='nf-num' style={{ fontSize: '17px', fontWeight: 700, color }}>{dias}<span className='nf-caption' style={{ fontWeight: 500 }}>/{total}</span></p>
          <p className='nf-caption' style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}

function GridMensual({ dias, metaCal, animado }) {
  const hoy = fechaLocal()
  const primerDia = dias[0] ? new Date(dias[0].fecha + 'T12:00:00') : new Date()
  const offsetInicio = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1
  const celdas = [...Array(offsetInicio).fill(null), ...dias]
  const semanas = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))

  const colorDia = (d) => {
    if (!d) return 'transparent'
    if (d.calorias === 0 && !d.gym) return 'rgba(255,255,255,0.05)'
    if (d.gym && d.calorias >= metaCal * 0.8) return C.green
    if (d.gym) return 'rgba(74,222,128,0.5)'
    if (d.calorias >= metaCal * 0.8) return 'rgba(74,222,128,0.28)'
    if (d.calorias > 0) return 'rgba(74,222,128,0.14)'
    return 'rgba(255,255,255,0.05)'
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '6px' }}>
        {DIAS.map(d => <div key={d} className='nf-caption' style={{ textAlign: 'center', fontWeight: 600 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
        {semanas.flatMap((semana, si) => Array(7).fill(null).map((_, di) => {
          const d = semana[di] ?? null
          const esHoy = d && d.fecha === hoy
          return (
            <div
              key={`${si}-${di}`}
              title={d ? `${d.fecha}: ${d.calorias} kcal${d.gym ? ' · gym' : ''}` : undefined}
              style={{
                aspectRatio: '1', borderRadius: '6px',
                background: animado ? colorDia(d) : d ? 'rgba(255,255,255,0.05)' : 'transparent',
                boxShadow: esHoy ? `inset 0 0 0 1.5px ${C.green}` : 'none',
                transition: `background-color 400ms ease ${si * 40 + di * 10}ms`,
              }}
            />
          )
        }))}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
        {[
          { color: C.green,                 label: 'Gym + meta cal' },
          { color: 'rgba(74,222,128,0.5)',  label: 'Solo gym' },
          { color: 'rgba(74,222,128,0.28)', label: 'Solo meta cal' },
          { color: 'rgba(255,255,255,0.05)', label: 'Sin datos' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, boxShadow: 'inset 0 0 0 0.5px var(--separator)' }} />
            <span className='nf-caption'>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GraficoPeso({ pesos, proyeccion, pesoObjetivo, animado }) {
  const W = 300, H = 110, PROJ = 14

  const sinDatos       = !pesos || pesos.length === 0
  const pocosRegistros = !sinDatos && pesos.length < 3

  if (sinDatos) {
    return (
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0 4px' }}>
        <BruceAvatar size={40} />
        <div>
          <p className='nf-headline' style={{ color: 'var(--green)', marginBottom: '4px' }}>Empieza a registrar tu peso</p>
          <p className='nf-footnote'>Registra tu peso y Bruce te mostrará tu progreso real, con proyección incluida.</p>
        </div>
      </div>
    )
  }

  const puntosProyeccion = (!pocosRegistros && proyeccion?.puntos) ? proyeccion.puntos.slice(0, PROJ) : []
  const todos  = [...pesos, ...puntosProyeccion]
  const vals   = todos.map(p => p.peso_kg)
  const minV   = Math.min(...vals, pesoObjetivo ?? Infinity) - 1
  const maxV   = Math.max(...vals, pesoObjetivo ?? -Infinity) + 1
  const range  = maxV - minV || 1
  const total  = Math.max(todos.length - 1, 1)
  const toX    = (i) => (i / total) * W
  const toY    = (v) => H - ((v - minV) / range) * H

  const realPts = pesos.map((p, i) => [toX(i), toY(p.peso_kg)])
  const projPts = puntosProyeccion.map((p, i) => [toX(pesos.length + i), toY(p.peso_kg)])
  const pathD   = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const objY    = pesoObjetivo ? toY(pesoObjetivo) : null
  const ultimo  = realPts[realPts.length - 1]

  return (
    <div>
      <svg width='100%' viewBox={`0 0 ${W} ${H + 16}`} style={{ display: 'block', overflow: 'visible' }} role='img' aria-label='Gráfico de evolución de peso'>
        <defs>
          <linearGradient id='pesoGrad' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor={C.green} stopOpacity={0.3} />
            <stop offset='100%' stopColor={C.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(t => (
          <g key={t}>
            <line x1={0} y1={H * t} x2={W} y2={H * t} stroke='rgba(255,255,255,0.06)' strokeWidth={1} />
            <text x={2} y={H * t - 4} fill='rgba(235,235,245,0.42)' fontSize={9} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {(maxV - t * range).toFixed(1)}
            </text>
          </g>
        ))}
        {objY !== null && (
          <g>
            <line x1={0} y1={objY} x2={W} y2={objY} stroke={C.yellow} strokeWidth={1} strokeDasharray='4 3' opacity={0.6} />
            <text x={W - 2} y={objY - 4} fill={C.yellow} fontSize={9} textAnchor='end' opacity={0.85}>Meta</text>
          </g>
        )}
        {realPts.length > 1 && (
          <g style={{ opacity: animado ? 1 : 0, transition: 'opacity 500ms ease' }}>
            <path d={`${pathD(realPts)} L ${ultimo[0]} ${H} L ${realPts[0][0]} ${H} Z`} fill='url(#pesoGrad)' />
            <path d={pathD(realPts)} pathLength={100} fill='none' stroke={C.green} strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round'
              strokeDasharray='100' strokeDashoffset={animado ? 0 : 100}
              style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }} />
          </g>
        )}
        {animado && projPts.length > 1 && (
          <path d={`M ${ultimo[0]} ${ultimo[1]} ${pathD(projPts).slice(1)}`}
            fill='none' stroke={C.green} strokeWidth={1.5} strokeDasharray='5 4' opacity={0.5} strokeLinecap='round' />
        )}
        {animado && ultimo && <circle cx={ultimo[0]} cy={ultimo[1]} r={4.5} fill={C.green} stroke='#141416' strokeWidth={2} />}
      </svg>
      {pocosRegistros && (
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'center',
          background: 'rgba(74,222,128,0.07)', borderRadius: '12px', padding: '10px 12px', marginTop: '12px',
        }}>
          <BruceAvatar size={28} />
          <p className='nf-footnote'>
            Registra al menos <strong style={{ color: 'var(--green)' }}>3 días</strong> de peso para ver la proyección. Llevas {pesos.length}.
          </p>
        </div>
      )}
    </div>
  )
}

function BarrasComparacion({ actual, anterior, metaCal, animado }) {
  const hayDatosAnteriores = anterior.some(d => d.calorias > 0 || d.gym)
  const maxVal = Math.max(...actual.map(d => d.calorias), ...anterior.map(d => d.calorias), metaCal, 1)
  const H = 88
  const metaY = (metaCal / maxVal) * H

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: C.green }} />
          <span className='nf-caption' style={{ color: 'var(--label-2)' }}>Esta semana</span>
        </div>
        {hayDatosAnteriores && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(255,255,255,0.2)' }} />
            <span className='nf-caption' style={{ color: 'var(--label-2)' }}>Semana anterior</span>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        {/* Línea de meta */}
        <div aria-hidden='true' style={{
          position: 'absolute', left: 0, right: 0, bottom: `${24 + metaY}px`,
          borderTop: '1px dashed rgba(251,191,36,0.45)',
        }} />
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: H + 24 }}>
          {actual.map((d, i) => {
            const ant  = anterior[i] ?? { calorias: 0 }
            const hAct = animado ? Math.max((d.calorias / maxVal) * H, d.calorias > 0 ? 5 : 0) : 0
            const hAnt = (animado && hayDatosAnteriores) ? Math.max((ant.calorias / maxVal) * H, ant.calorias > 0 ? 4 : 0) : 0
            const enMeta = d.calorias >= metaCal * 0.85 && d.calorias <= metaCal * 1.1
            const esHoy  = i === actual.length - 1   // la semana son los últimos 7 días, hoy al final
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: H, gap: '2px' }}>
                  {hayDatosAnteriores && (
                    <div style={{ flex: 1, borderRadius: '4px 4px 1px 1px', height: hAnt, background: 'rgba(255,255,255,0.14)', transition: `height 600ms var(--ease-out) ${i * 40}ms` }} />
                  )}
                  <div
                    title={`${d.calorias} kcal`}
                    style={{
                      flex: 1, borderRadius: '4px 4px 1px 1px', height: hAct,
                      background: esHoy ? C.green : enMeta ? 'rgba(74,222,128,0.6)' : d.calorias > 0 ? 'rgba(74,222,128,0.28)' : 'transparent',
                      transition: `height 600ms var(--ease-out) ${i * 40 + 40}ms`,
                    }}
                  />
                </div>
                <span className='nf-caption' style={{ color: esHoy ? 'var(--green)' : undefined, fontWeight: esHoy ? 700 : 500 }}>
                  {esHoy ? 'Hoy' : DIAS[d.dia_sem ?? i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const ICONO_LOGRO = {
  barbell: IconBarbell, flame: IconFlame, calendar: IconCalendarCheck, trophy: IconTrophy,
  meat: IconMeat, target: IconTarget, notebook: IconNotebook, droplet: IconDroplet, scale: IconScale,
}
// Bronce, plata, oro, diamante, leyenda
const COLOR_NIVEL = ['#c98a5a', '#cbd5e1', '#fbbf24', '#67e8f9', '#c084fc']

function TarjetaLogro({ l, i, entrar }) {
  const Icono    = ICONO_LOGRO[l.icono] ?? IconTrophy
  const ganado   = l.nivel > 0
  const medalla  = ganado ? COLOR_NIVEL[l.nivel - 1] : 'var(--label-4)'
  const maximo   = l.siguiente == null
  return (
    <div
      className={`nf-card${entrar ? ' nf-enter' : ''}${l.nuevo ? ' nf-logro-nuevo' : ''}`}
      style={{
        padding: '14px', animationDelay: `${i * 40}ms`,
        '--tint': l.color,
        boxShadow: l.nuevo ? `inset 0 0 0 1px ${l.color}99, 0 0 24px ${l.color}40` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        {/* Ícono dentro de una medalla: el anillo toma el color del nivel */}
        <span style={{
          width: '40px', height: '40px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ganado ? `${l.color}22` : 'rgba(255,255,255,0.04)',
          boxShadow: `inset 0 0 0 2px ${medalla}`,
          opacity: ganado ? 1 : 0.55,
        }}>
          <Icono size={20} color={ganado ? l.color : 'var(--label-3)'} strokeWidth={1.9} />
        </span>
        {l.nuevo
          ? <span className='nf-badge' style={{ '--tint': l.color }}>¡Nuevo!</span>
          : ganado && <span className='nf-badge' style={{ '--tint': medalla }}>{l.nivel_nombre}</span>}
      </div>
      <p style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: ganado ? 'var(--label)' : 'var(--label-2)' }}>{l.titulo}</p>
      <p className='nf-caption' style={{ minHeight: '32px', marginBottom: '8px' }}>
        {maximo ? `Nivel máximo · ${l.descripcion}` : `Siguiente: ${l.descripcion}`}
      </p>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{
          height: '100%', width: '100%', borderRadius: '2px', background: ganado || l.progreso > 0 ? l.color : 'transparent',
          transform: `scaleX(${l.progreso})`, transformOrigin: 'left',
          transition: 'transform 700ms var(--ease-out) 200ms',
        }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <p className='nf-caption nf-num' style={{ fontWeight: 600 }}>
          {maximo ? `${l.valor} ${l.unidad}` : `${l.valor} / ${l.siguiente} ${l.unidad}`}
        </p>
        {/* Un punto por nivel, del color de su medalla cuando ya se ganó */}
        <span role='img' aria-label={`Nivel ${l.nivel} de ${l.niveles.length}`} style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {l.niveles.map((_, n) => (
            <span key={n} style={{ width: '5px', height: '5px', borderRadius: '50%', background: n < l.nivel ? COLOR_NIVEL[n] : 'rgba(255,255,255,0.14)' }} />
          ))}
        </span>
      </div>
    </div>
  )
}

function Logros({ logros, entrar }) {
  if (!logros || !logros.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
      {logros.map((l, i) => <TarjetaLogro key={l.clave} l={l} i={i} entrar={entrar} />)}
    </div>
  )
}

// ── Gráfico de progresión por ejercicio ───────────────────────────────────
function GraficoEjercicio({ registros, color = C.green }) {
  const W = 300, H = 100
  if (!registros || registros.length === 0) return null

  const gradId = `ejGrad_${color.replace(/[^a-zA-Z0-9]/g, '')}`
  const vals   = registros.map(r => r.peso_kg)
  const minV   = Math.min(...vals)
  const maxV   = Math.max(...vals)
  const range  = (maxV - minV) || 1
  const toX    = (i) => registros.length > 1 ? (i / (registros.length - 1)) * W : W / 2
  const toY    = (v) => H - ((v - minV) / range) * (H - 16) - 8
  const pts    = registros.map((r, i) => [toX(i), toY(r.peso_kg)])
  const pathD  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const primero = registros[0]
  const ultimo  = registros[registros.length - 1]
  const fmt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  return (
    <svg width='100%' viewBox={`0 0 ${W} ${H + 20}`} style={{ display: 'block', overflow: 'visible' }} role='img' aria-label='Progresión de carga'>
      <defs>
        <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor={color} stopOpacity={0.3} />
          <stop offset='100%' stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {pts.length > 1 && (
        <>
          <path d={`${pathD} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`} fill={`url(#${gradId})`} />
          <path d={pathD} fill='none' stroke={color} strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' />
        </>
      )}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4.5 : 3}
          fill={i === pts.length - 1 ? color : `${color}99`} stroke='#141416' strokeWidth={1.5} />
      ))}
      {registros.length > 1 && (
        <>
          <text x={0} y={H + 16} fill='rgba(235,235,245,0.42)' fontSize={10}>{fmt(primero.fecha)}</text>
          <text x={W} y={H + 16} fill='rgba(235,235,245,0.42)' fontSize={10} textAnchor='end'>{fmt(ultimo.fecha)}</text>
        </>
      )}
    </svg>
  )
}

const COLORES_MUSCULO = {
  'Piernas':  { text: '#4ade80' },
  'Core':     { text: '#4ade80' },
  'Pecho':    { text: '#60a5fa' },
  'Hombros':  { text: '#60a5fa' },
  'Espalda':  { text: '#a78bfa' },
  'Brazos':   { text: '#a78bfa' },
  'Cardio':   { text: '#fb923c' },
}
const colorMusculo = (m) => COLORES_MUSCULO[m]?.text ?? '#9ca3af'

function Sparkline({ registros, color }) {
  const W = 56, H = 24
  if (!registros || registros.length < 2) {
    return <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 1.5, background: 'rgba(255,255,255,0.12)', borderRadius: 1 }} />
    </div>
  }
  const vals  = registros.map(r => r.peso_kg)
  const minV  = Math.min(...vals)
  const range = (Math.max(...vals) - minV) || 1
  const pts   = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 2 - ((v - minV) / range) * (H - 4)])
  const d     = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }} aria-hidden='true'>
      <path d={d} fill='none' stroke={color} strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round' />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  )
}

function EjercicioCard({ ejercicio, expandido, onToggle }) {
  const registros = ejercicio.registros ?? []
  const primero   = registros[0]
  const ultimo    = registros[registros.length - 1]
  const maxPeso   = registros.length ? Math.max(...registros.map(r => r.peso_kg)) : 0
  const diff      = registros.length >= 2 ? +(ultimo.peso_kg - primero.peso_kg).toFixed(1) : 0
  const color     = colorMusculo(ejercicio.musculo)

  return (
    <div className='nf-card' style={{ overflow: 'hidden', boxShadow: expandido ? `inset 0 0 0 0.5px ${color}55` : undefined }}>
      <button
        onClick={onToggle}
        aria-expanded={expandido}
        className='nf-press-soft'
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 12px 14px 16px', textAlign: 'left' }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '16px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ejercicio.nombre}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <span className='nf-badge' style={{ '--tint': color, height: '20px' }}>{ejercicio.musculo ?? 'General'}</span>
            <span className='nf-caption nf-num'>{registros.length} {registros.length === 1 ? 'sesión' : 'sesiones'}</span>
          </span>
        </span>
        <Sparkline registros={registros} color={color} />
        <span style={{ textAlign: 'right', flexShrink: 0, minWidth: '58px' }}>
          <span className='nf-num' style={{ display: 'block', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {ultimo?.peso_kg ?? '–'}<span className='nf-caption' style={{ fontWeight: 500 }}> kg</span>
          </span>
          {registros.length >= 2 && (
            <span className='nf-num' style={{ fontSize: '12px', fontWeight: 700, color: diff >= 0 ? C.green : C.orange }}>
              {diff >= 0 ? '+' : ''}{diff} kg
            </span>
          )}
        </span>
        <IconChevronRight size={18} color='var(--label-4)' style={{ flexShrink: 0, transform: expandido ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
      </button>

      <div className='nf-collapse' data-open={expandido && registros.length > 0}>
        <div>
          {registros.length > 0 && (
            <div style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)', padding: '16px' }}>
              <GraficoEjercicio registros={registros} color={color} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '14px' }}>
                {[
                  { label: 'Máximo',   val: `${maxPeso} kg`,         color },
                  { label: 'Sesiones', val: registros.length,        color: C.blue   },
                  { label: 'Inicio',   val: `${primero.peso_kg} kg`, color: C.purple },
                ].map(({ label, val, color: c }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px 8px', textAlign: 'center' }}>
                    <p className='nf-caption' style={{ fontWeight: 600, marginBottom: '2px' }}>{label}</p>
                    <p className='nf-num' style={{ fontSize: '16px', fontWeight: 700, color: c }}>{val}</p>
                  </div>
                ))}
              </div>

              <p className='nf-caption' style={{ fontWeight: 600, margin: '16px 0 4px' }}>Historial reciente</p>
              {[...registros].reverse().slice(0, 6).map((r, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', boxShadow: i ? 'inset 0 0.5px 0 var(--separator)' : 'none',
                }}>
                  <span className='nf-footnote'>
                    {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className='nf-caption nf-num'>{r.series}×{r.reps}</span>
                    <span className='nf-num' style={{ fontSize: '15px', fontWeight: 700, color: i === 0 ? color : 'var(--label)' }}>{r.peso_kg} kg</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pestaña de cargas ─────────────────────────────────────────────────────
function TabPesos() {
  const [historialEj,       setHistorialEj]       = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [errorHistorial,    setErrorHistorial]    = useState(false)
  const [filtroGrupo,       setFiltroGrupo]       = useState('Todos')
  const [expandido,         setExpandido]         = useState(null)

  const cargar = () => {
    setCargandoHistorial(true)
    setErrorHistorial(false)
    getHistorialEjercicios()
      .then(data => setHistorialEj(data))
      .catch(() => setErrorHistorial(true))
      .finally(() => setCargandoHistorial(false))
  }
  useEffect(cargar, [])

  if (cargandoHistorial) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} aria-busy='true'>
        {[0, 1, 2].map(i => <div key={i} className='nf-skeleton' style={{ height: '72px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
    )
  }

  if (errorHistorial) return <ErrorCarga onRetry={cargar} />

  if (historialEj.length === 0) {
    return (
      <div className='nf-card nf-enter' style={{ padding: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <BruceAvatar size={40} />
        <div>
          <p className='nf-headline' style={{ color: 'var(--green)', marginBottom: '4px' }}>Aún no hay registros de carga</p>
          <p className='nf-footnote'>
            Cuando guardes una sesión de gym con el peso real de cada ejercicio, Bruce te mostrará tu progresión aquí.
          </p>
        </div>
      </div>
    )
  }

  const gruposPresentes = ['Todos', ...new Set(historialEj.map(e => e.musculo).filter(Boolean))]
  const ejerciciosFiltrados = filtroGrupo === 'Todos' ? historialEj : historialEj.filter(e => e.musculo === filtroGrupo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', margin: '0 -16px', padding: '0 16px 2px' }}>
        {gruposPresentes.map(grupo => (
          <button
            key={grupo}
            onClick={() => { setFiltroGrupo(grupo); setExpandido(null) }}
            className='nf-chip'
            aria-pressed={filtroGrupo === grupo}
            style={{ '--tint': grupo === 'Todos' ? C.green : colorMusculo(grupo), flexShrink: 0 }}
          >
            {grupo}
          </button>
        ))}
      </div>

      <p className='nf-caption' style={{ paddingLeft: '4px' }}>
        {ejerciciosFiltrados.length} {ejerciciosFiltrados.length === 1 ? 'ejercicio' : 'ejercicios'}
      </p>

      {ejerciciosFiltrados.length === 0 ? (
        <div className='nf-card' style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p className='nf-footnote'>Sin registros para este grupo todavía.</p>
        </div>
      ) : (
        ejerciciosFiltrados.map(ej => (
          <EjercicioCard
            key={ej.nombre}
            ejercicio={ej}
            expandido={expandido === ej.nombre}
            onToggle={() => setExpandido(prev => prev === ej.nombre ? null : ej.nombre)}
          />
        ))
      )}
    </div>
  )
}

function ErrorCarga({ onRetry }) {
  return (
    <div className='nf-card' role='alert' style={{ padding: '24px 20px', textAlign: 'center' }}>
      <p className='nf-headline' style={{ marginBottom: '4px' }}>No pudimos cargar tus datos</p>
      <p className='nf-footnote' style={{ marginBottom: '14px' }}>Revisa tu conexión e intenta de nuevo.</p>
      <button className='nf-btn nf-btn--tinted' onClick={onRetry}><IconRefresh size={17} /> Reintentar</button>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export default function ProgressScreen({ t, screen }) {
  const [data,       setData]       = useState(null)
  const [logros,     setLogros]     = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState(false)
  const [nuevoPeso,  setNuevoPeso]  = useState('')
  const [guardando,  setGuardando]  = useState(false)
  const [animado,    setAnimado]    = useState(false)
  const [vistaRacha, setVistaRacha] = useState('gym')
  const [seccion,    setSeccion]    = useState('semana')
  const entrar = useEntrada(screen === 'progress')

  // Lo recién ganado se celebra una vez: aviso + vibración, y el servidor lo
  // marca como visto. El brillo en la tarjeta se queda mientras la pantalla siga abierta.
  const cargarLogros = () =>
    getLogros()
      .then(d => {
        setLogros(d.logros)
        const nuevos = d.logros.filter(l => l.nuevo)
        if (!nuevos.length) return
        haptic(30)
        toast.success(nuevos.length === 1
          ? `¡Nuevo logro! ${nuevos[0].titulo} · ${nuevos[0].nivel_nombre}`
          : `¡Ganaste ${nuevos.length} logros nuevos!`)
        marcarLogrosVistos().catch(() => {})
      })
      .catch(() => {})

  const cargar = () => {
    cargarLogros()
    setCargando(prev => prev || !data)
    getProgresoCompleto()
      .then(d => { setData(d); setError(false) })
      .catch(() => setError(true))
      .finally(() => {
        setCargando(false)
        // Los gráficos se dibujan una vez; después solo transicionan sus valores
        requestAnimationFrame(() => setAnimado(true))
      })
  }

  useEffect(() => {
    if (screen !== 'progress') return
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const guardarPeso = async () => {
    const kg = parseFloat(nuevoPeso)
    if (!kg || kg < 30 || kg > 300) {
      toast.error('Escribe un peso entre 30 y 300 kg')
      return
    }
    setGuardando(true)
    try {
      const r = await registrarPeso({ peso_kg: kg })
      setNuevoPeso('')
      document.activeElement?.blur?.()
      haptic()
      // Si el peso se movió 2 kg o más, el servidor reajustó las metas: se cuenta qué cambió
      const a = r?.metas_ajustadas
      if (a) {
        const num = (n) => Math.abs(n).toLocaleString('es-CO')
        toast.success(
          `${a.cambio_kg < 0 ? 'Bajaste' : 'Subiste'} ${num(a.cambio_kg)} kg desde tu último ajuste. Tu meta pasa de ${num(a.antes)} a ${num(a.despues)} kcal.`,
          { duration: 6500 },
        )
      } else {
        toast.success(`${kg} kg registrados`)
      }
      const d = await getProgresoCompleto()
      setData(d)
      cargarLogros()
    } catch { toast.error('Error al guardar el peso.') }
    finally { setGuardando(false) }
  }

  const semanaActual   = data?.semana_actual   ?? Array(7).fill({ calorias: 0, gym: false })
  const semanaAnterior = data?.semana_anterior ?? Array(7).fill({ calorias: 0, gym: false })
  const diasMes        = data?.dias            ?? []
  const pesos          = data?.pesos           ?? []
  const proyeccion     = data?.proyeccion      ?? null
  const score          = data?.score_semanal   ?? 0
  const desglose       = data?.desglose_score  ?? null
  const metaCal        = data?.metas?.calorias ?? 1900
  const pesoObjetivo   = data?.peso_objetivo   ?? null

  const rachaGym    = data?.racha_gym    ?? 0
  const rachaComida = data?.racha_comida ?? 0
  const racha       = vistaRacha === 'gym' ? rachaGym : rachaComida

  const pesoActual   = pesos.length ? pesos[pesos.length - 1].peso_kg : null
  const pesoAnterior = pesos.length > 1 ? pesos[pesos.length - 2].peso_kg : pesoActual
  const pesoDiff     = pesoActual && pesoAnterior ? +(pesoActual - pesoAnterior).toFixed(1) : null

  const diasGym     = semanaActual.filter(d => d.gym).length
  // Mismo criterio que el servidor: entre 80% y 110% de la meta
  const diasCal     = semanaActual.filter(d => d.calorias >= metaCal * 0.8 && d.calorias <= metaCal * 1.1).length
  const diasActivos = semanaActual.filter(d => d.calorias > 0 || d.gym).length
  const anillos     = ANILLOS(diasGym, diasCal, diasActivos, data?.desglose_score?.dias_planeados)

  const promedioCal = (() => {
    const con = semanaActual.filter(d => d.calorias > 0)
    return con.length ? Math.round(con.reduce((s, d) => s + d.calorias, 0) / con.length) : 0
  })()

  const enter = (delay) => ({ className: `nf-card${entrar ? ' nf-enter' : ''}`, style: { padding: '18px', animationDelay: `${delay}ms` } })

  return (
    <div style={{ padding: 'calc(var(--safe-top) + 20px) 16px 0' }}>

      <header className={entrar ? 'nf-enter' : undefined} style={{ padding: '0 4px', marginBottom: '16px' }}>
        <h1 className='nf-large-title'>{t?.progress ?? 'Progreso'}</h1>
        <p className='nf-subhead'>Tu evolución semanal</p>
      </header>

      <Segmented
        label='Periodo'
        value={seccion}
        onChange={setSeccion}
        options={[{ id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }, { id: 'pesos', label: 'Cargas' }]}
        style={{ marginBottom: '16px' }}
      />

      {seccion === 'pesos' && <TabPesos />}

      {seccion !== 'pesos' && cargando && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} aria-busy='true'>
          <div className='nf-skeleton' style={{ height: '170px', borderRadius: 'var(--r-lg)' }} />
          <div className='nf-skeleton' style={{ height: '200px', borderRadius: 'var(--r-lg)' }} />
        </div>
      )}

      {seccion !== 'pesos' && error && !data && <ErrorCarga onRetry={cargar} />}

      {data && seccion === 'semana' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Score + anillos */}
          <section {...enter(0)} style={{ ...enter(0).style, position: 'relative', zIndex: 2 }}>
            <Label>Score semanal</Label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '8px' }}>
              <div>
                <ScoreArc score={score} animado={animado} desglose={desglose} />
                <p className='nf-caption' style={{ textAlign: 'center', marginTop: '2px', fontWeight: 600 }}>
                  {score >= 80 ? 'Semana perfecta' : score >= 50 ? 'Buen ritmo' : 'Puedes mejorar'}
                </p>
              </div>
              <AnillosFitness anillos={anillos} animado={animado} />
            </div>
            <LeyendaAnillos anillos={anillos} />
          </section>

          {/* Calorías */}
          <section {...enter(60)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <Label style={{ marginBottom: '4px' }}>Calorías · promedio diario</Label>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span className='nf-num' style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{promedioCal.toLocaleString('es-CO')}</span>
                  <span className='nf-footnote'>kcal/día</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className='nf-caption'>Meta</p>
                <p className='nf-num' style={{ fontSize: '16px', fontWeight: 700, color: C.yellow }}>{metaCal.toLocaleString('es-CO')}</p>
              </div>
            </div>
            <BarrasComparacion actual={semanaActual} anterior={semanaAnterior} metaCal={metaCal} animado={animado} />
          </section>

          {/* Peso + racha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <section {...enter(120)} style={{ ...enter(120).style, padding: '16px' }}>
              <Label>Peso</Label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '2px' }}>
                <span className='nf-num' style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{pesoActual ?? '–'}</span>
                <span className='nf-footnote'>kg</span>
              </div>
              <div style={{ minHeight: '20px', marginBottom: '10px' }}>
                {pesoDiff !== null && pesoDiff !== 0 && (
                  <span className='nf-num' style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600, color: pesoDiff <= 0 ? C.green : C.orange }}>
                    {pesoDiff <= 0 ? <IconTrendingDown size={15} /> : <IconTrendingUp size={15} />}
                    {pesoDiff > 0 ? '+' : ''}{pesoDiff} kg
                  </span>
                )}
              </div>
              <form
                onSubmit={e => { e.preventDefault(); guardarPeso() }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  type='number' inputMode='decimal' step='0.1' enterKeyHint='done'
                  className='nf-input nf-num'
                  value={nuevoPeso}
                  placeholder={pesoActual ? String(pesoActual) : '70.0'}
                  aria-label='Registrar peso de hoy en kilogramos'
                  onChange={e => setNuevoPeso(e.target.value)}
                  style={{ width: 0, flex: 1, minHeight: '40px', padding: '8px 10px' }}
                />
                <button type='submit' disabled={guardando || !nuevoPeso} className='nf-btn nf-btn--primary' style={{ minHeight: '40px', padding: '0 12px' }}>
                  {guardando ? '…' : 'OK'}
                </button>
              </form>
            </section>

            <section {...enter(160)} style={{ ...enter(160).style, padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <Segmented
                label='Tipo de racha'
                value={vistaRacha}
                onChange={setVistaRacha}
                options={[
                  { id: 'gym',    label: <IconBarbell size={16} />,       ariaLabel: 'Racha de gym' },
                  { id: 'comida', label: <IconToolsKitchen2 size={16} />, ariaLabel: 'Racha de comida' },
                ]}
                style={{ marginBottom: '10px' }}
              />
              <p className='nf-caption' style={{ fontWeight: 600 }}>Racha {vistaRacha === 'gym' ? 'de gym' : 'de comida'}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '2px 0 10px' }}>
                <span className='nf-num' style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: racha >= 3 ? C.green : 'var(--label)' }}>{racha}</span>
                <span className='nf-footnote'>{racha === 1 ? 'día' : 'días'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginTop: 'auto' }} aria-hidden='true'>
                {semanaActual.map((d, i) => {
                  const activo = vistaRacha === 'gym' ? d.gym : d.calorias > 0
                  return (
                    <span key={i} style={{
                      aspectRatio: '1', borderRadius: '50%',
                      background: activo ? C.green : 'rgba(255,255,255,0.08)',
                      transition: 'background-color 250ms ease',
                    }} />
                  )
                })}
              </div>
              {racha > 7 && (
                <p className='nf-caption' style={{ color: 'var(--green)', marginTop: '6px', fontWeight: 600 }}>+{racha - 7} días más de racha</p>
              )}
            </section>
          </div>

          {/* Evolución de peso */}
          <section {...enter(200)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px' }}>
              <div>
                <Label style={{ marginBottom: '2px' }}>Evolución de peso</Label>
                {proyeccion && (
                  <p className='nf-footnote'>
                    Tendencia{' '}
                    <strong className='nf-num' style={{ color: proyeccion.tendencia_kg_semana <= 0 ? C.green : C.orange }}>
                      {proyeccion.tendencia_kg_semana > 0 ? '+' : ''}{proyeccion.tendencia_kg_semana} kg/sem
                    </strong>
                  </p>
                )}
              </div>
              {proyeccion?.dias_para_objetivo && (
                <div style={{ textAlign: 'right' }}>
                  <p className='nf-caption'>Llegas a tu meta en</p>
                  <p className='nf-num' style={{ fontSize: '16px', fontWeight: 700, color: C.green }}>~{proyeccion.dias_para_objetivo} días</p>
                </div>
              )}
            </div>
            <GraficoPeso pesos={pesos} proyeccion={proyeccion} pesoObjetivo={pesoObjetivo} animado={animado} />
          </section>

          {logros.length > 0 && (
            <section>
              <h2 className='nf-section-label' style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Logros</span>
                <span className='nf-num' style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {logros.reduce((n, l) => n + l.nivel, 0)} de {logros.reduce((n, l) => n + l.niveles.length, 0)} niveles
                </span>
              </h2>
              <Logros logros={logros} entrar={entrar} />
            </section>
          )}

          {racha >= 5 && (
            <section className='nf-card' style={{
              background: 'linear-gradient(135deg, #0b1c12, #0f2a1b)',
              boxShadow: 'inset 0 0 0 0.5px rgba(74,222,128,0.18)',
              padding: '18px', display: 'flex', gap: '14px', alignItems: 'center',
            }}>
              <BruceAvatar size={52} />
              <div>
                <p className='nf-headline' style={{ color: 'var(--green)', marginBottom: '2px' }}>Imparable, parcero</p>
                <p className='nf-footnote'>
                  {racha} días seguidos de {vistaRacha === 'gym' ? 'gym' : 'registro'}. Eso no es suerte, es disciplina. Sigue así.
                </p>
              </div>
            </section>
          )}
        </div>
      )}

      {data && seccion === 'mes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <section className='nf-card' style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <Label style={{ marginBottom: '2px' }}>Actividad mensual</Label>
                <p className='nf-caption'>Últimos 30 días</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className='nf-num' style={{ fontSize: '24px', fontWeight: 700, color: C.green, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {diasMes.filter(d => d.gym || d.calorias > 0).length}
                </p>
                <p className='nf-caption'>días activos</p>
              </div>
            </div>
            <GridMensual dias={diasMes} metaCal={metaCal} animado={animado} />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Días de gym',   val: diasMes.filter(d => d.gym).length, unit: 'días', color: C.green },
              { label: 'En meta cal',   val: diasMes.filter(d => d.calorias >= metaCal * 0.8).length, unit: 'días', color: C.blue },
              { label: 'Promedio cal',  val: (() => { const c = diasMes.filter(d => d.calorias > 0); return c.length ? Math.round(c.reduce((s, d) => s + d.calorias, 0) / c.length) : 0 })(), unit: 'kcal', color: C.orange },
              { label: 'Mejor racha',   val: (() => { let max = 0, cur = 0; diasMes.forEach(d => { if (d.gym) { cur++; max = Math.max(max, cur) } else cur = 0 }); return max })(), unit: 'días', color: C.purple },
            ].map(({ label, val, unit, color }) => (
              <div key={label} className='nf-card' style={{ padding: '16px' }}>
                <p className='nf-caption' style={{ fontWeight: 600, marginBottom: '6px' }}>{label}</p>
                <p className='nf-num' style={{ fontSize: '28px', fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {val.toLocaleString('es-CO')} <span className='nf-caption' style={{ fontWeight: 500 }}>{unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
