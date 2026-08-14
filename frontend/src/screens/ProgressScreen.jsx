import { useState, useEffect } from 'react'
import { IconTrendingDown, IconTrendingUp, IconBarbell, IconToolsKitchen2, IconInfoCircle, IconX } from '@tabler/icons-react'
import { registrarPeso, getProgresoCompleto, getHistorialEjercicios } from '../api'
import bruceFace from '../assets/bruce-face.png'

const C = {
  green:  '#4ade80',
  blue:   '#60a5fa',
  purple: '#a78bfa',
  orange: '#f97316',
  yellow: '#fbbf24',
  card:   '#131313',
  border: 'rgba(255,255,255,0.06)',
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function BruceAvatar({ size = 38 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #064e3b, #16a34a)',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(74,222,128,0.25)',
      flexShrink: 0,
    }}>
      <img src={bruceFace} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Bruce" />
    </div>
  )
}

function ScoreArc({ score, animado, desglose }) {
  const [mostrarInfo, setMostrarInfo] = useState(false)
  const R = 54, cx = 70, cy = 70
  const startAngle = -210, totalDeg = 240
  const pct    = animado ? clamp(score, 0, 100) / 100 : 0
  const toRad  = d => (d * Math.PI) / 180
  const ptOn   = (deg) => [cx + R * Math.cos(toRad(deg)), cy + R * Math.sin(toRad(deg))]
  const [sx, sy]   = ptOn(startAngle)
  const endDeg     = startAngle + totalDeg * pct
  const [ex, ey]   = ptOn(endDeg)
  const large      = totalDeg * pct > 180 ? 1 : 0
  const scoreColor = score >= 80 ? C.green : score >= 50 ? C.yellow : C.orange
  const [sx2, sy2] = ptOn(startAngle + totalDeg)

  return (
    <div style={{ position: 'relative' }}>
      <svg width={140} height={100} viewBox="0 0 140 100">
        <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${sx2} ${sy2}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeLinecap="round" />
        {pct > 0.01 && (
          <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`}
            fill="none" stroke={scoreColor} strokeWidth={8} strokeLinecap="round"
            style={{ transition: 'all 1s cubic-bezier(0.4,0,0.2,1) 0.2s' }} />
        )}
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#fff" fontSize={26} fontWeight={700} fontFamily="inherit">
          {animado ? score : 0}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={10} fontFamily="inherit">
          / 100
        </text>
      </svg>
      <button
        onClick={() => setMostrarInfo(v => !v)}
        style={{
          position: 'absolute', top: 0, right: 0,
          background: 'none', border: 'none', padding: 4, cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
        }}
      >
        {mostrarInfo ? <IconX size={14} /> : <IconInfoCircle size={14} />}
      </button>
      {mostrarInfo && desglose && (
        <div style={{
          position: 'absolute', top: 20, left: 0, zIndex: 10,
          background: '#1a1a1a', border: `0.5px solid ${C.border}`,
          borderRadius: 14, padding: '12px 14px', minWidth: 190,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
            Como se calcula
          </p>
          {[
            { label: 'Gym (50%)',        val: desglose.dias_gym,     pts: desglose.pct_gym,        color: C.green  },
            { label: 'Calorias (35%)',   val: desglose.dias_cal,     pts: desglose.pct_cal,        color: C.blue   },
            { label: 'Constancia (15%)', val: desglose.dias_activos, pts: desglose.pct_constancia, color: C.purple },
          ].map(({ label, val, pts, color }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>+{pts} pts</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: color,
                  width: `${(val / 7) * 100}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{val} de 7 dias</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AnillosFitness({ diasGym, diasCal, diasActivos, animado }) {
  const rings = [
    { label: 'Gym',       val: diasGym     / 7, color: C.green,  r: 44, stroke: 10 },
    { label: 'Calorias',  val: diasCal     / 7, color: C.blue,   r: 32, stroke: 9  },
    { label: 'Actividad', val: diasActivos / 7, color: C.purple, r: 20, stroke: 8  },
  ]
  const SIZE = 110
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {rings.map(({ val, color, r, stroke }) => {
          const cx = SIZE / 2, cy = SIZE / 2
          const circ = 2 * Math.PI * r
          const pct  = animado ? clamp(val, 0, 1) : 0
          return (
            <g key={r}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${color}18`} strokeWidth={stroke} />
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1) 0.3s' }}
              />
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rings.map(({ label, val, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label} </span>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>{Math.round(val * 7)}/7</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GridMensual({ dias, metaCal, animado }) {
  const hoy = new Date()
  const primerDia = dias[0] ? new Date(dias[0].fecha + 'T12:00:00') : hoy
  const offsetInicio = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1
  const celdas = [...Array(offsetInicio).fill(null), ...dias]
  const semanas = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))

  const colorDia = (d) => {
    if (!d) return 'transparent'
    if (d.calorias === 0 && !d.gym) return 'rgba(255,255,255,0.04)'
    if (d.gym && d.calorias >= metaCal * 0.8) return C.green
    if (d.gym) return 'rgba(74,222,128,0.45)'
    if (d.calorias >= metaCal * 0.8) return 'rgba(74,222,128,0.25)'
    if (d.calorias > 0) return 'rgba(74,222,128,0.12)'
    return 'rgba(255,255,255,0.04)'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {['L','M','X','J','V','S','D'].map(d => (
          <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      {semanas.map((semana, si) => (
        <div key={si} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {Array(7).fill(null).map((_, di) => {
            const d = semana[di] ?? null
            const esHoy = d && d.fecha === hoy.toISOString().split('T')[0]
            return (
              <div key={di} style={{
                flex: 1, aspectRatio: '1', borderRadius: 5,
                background: animado ? colorDia(d) : 'rgba(255,255,255,0.04)',
                border: esHoy ? `1.5px solid ${C.green}` : '1.5px solid transparent',
                transition: `background 0.4s ease ${si * 0.04 + di * 0.01}s`,
              }} />
            )
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { color: C.green,                  label: 'Gym + meta cal' },
          { color: 'rgba(74,222,128,0.45)',  label: 'Solo gym' },
          { color: 'rgba(74,222,128,0.25)',  label: 'Solo meta cal' },
          { color: 'rgba(255,255,255,0.04)', label: 'Sin datos' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{label}</span>
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

  const puntosProyeccion = (!pocosRegistros && proyeccion && proyeccion.puntos)
    ? proyeccion.puntos.slice(0, PROJ)
    : []

  const basePuntos = sinDatos ? [{ peso_kg: 0 }] : pesos
  const todosLos   = [...basePuntos, ...puntosProyeccion]
  const vals       = todosLos.map(p => p.peso_kg)
  const minV       = Math.min(...vals) - 1
  const maxV       = Math.max(...vals) + 1
  const range      = maxV - minV || 1
  const totalPts   = Math.max(todosLos.length - 1, 1)
  const toX        = (i) => (i / totalPts) * W
  const toY        = (v) => H - ((v - minV) / range) * H

  const realPts = sinDatos ? [] : pesos.map((p, i) => [toX(i), toY(p.peso_kg)])
  const projPts = puntosProyeccion.map((p, i) => [toX((sinDatos ? 0 : pesos.length) + i), toY(p.peso_kg)])
  const pathD   = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const objY    = (pesoObjetivo && !sinDatos) ? toY(pesoObjetivo) : null

  if (sinDatos) {
    return (
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '24px 0 8px' }}>
        <BruceAvatar size={44} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 6 }}>
            Empieza a registrar tu peso
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            Registra tu peso diario y Bruce te mostrara tu progreso real con proyeccion incluida.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H + 16} viewBox={`0 0 ${W} ${H + 16}`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="pesoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity={1} />
              <stop offset="100%" stopColor={C.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <g key={t}>
              <line x1={0} y1={H * t} x2={W} y2={H * t} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <text x={2} y={H * t - 3} fill="rgba(255,255,255,0.2)" fontSize={8}>{(maxV - t * range).toFixed(1)}</text>
            </g>
          ))}
          {objY !== null && (
            <g>
              <line x1={0} y1={objY} x2={W} y2={objY} stroke={C.yellow} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
              <text x={W - 2} y={objY - 3} fill={C.yellow} fontSize={8} textAnchor="end" opacity={0.7}>Meta</text>
            </g>
          )}
          {animado && realPts.length > 1 && (
            <>
              <path d={`${pathD(realPts)} L ${realPts[realPts.length-1][0]} ${H} L ${realPts[0][0]} ${H} Z`}
                fill="url(#pesoGrad)" opacity={0.15} />
              <path d={pathD(realPts)} fill="none" stroke={C.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {animado && !pocosRegistros && projPts.length > 1 && (
            <path d={`M ${realPts[realPts.length-1][0]} ${realPts[realPts.length-1][1]} ${pathD(projPts).slice(1)}`}
              fill="none" stroke={C.green} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.45} strokeLinecap="round" />
          )}
          {animado && realPts.length > 0 && (
            <circle cx={realPts[realPts.length-1][0]} cy={realPts[realPts.length-1][1]}
              r={4} fill={C.green} stroke="#0a0a0a" strokeWidth={2} />
          )}
        </svg>
      </div>
      {pocosRegistros && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          background: 'rgba(74,222,128,0.05)', border: `0.5px solid rgba(74,222,128,0.12)`,
          borderRadius: 12, padding: '10px 12px', marginTop: 12,
        }}>
          <BruceAvatar size={28} />
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
            Registra al menos <span style={{ color: C.green, fontWeight: 700 }}>3 dias</span> de peso para ver la proyeccion.
            Llevas {pesos.length}.
          </p>
        </div>
      )}
    </div>
  )
}

function BarrasComparacion({ actual, anterior, metaCal, animado }) {
  const hayDatosAnteriores = anterior.some(d => d.calorias > 0 || d.gym)
  const maxVal = Math.max(...actual.map(d => d.calorias), ...anterior.map(d => d.calorias), metaCal, 1)
  const H = 80
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Esta semana</span>
        </div>
        {hayDatosAnteriores && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Semana anterior</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: H + 24 }}>
        {actual.map((d, i) => {
          const ant  = anterior[i] ?? { calorias: 0 }
          const hAct = animado ? Math.max((d.calorias / maxVal) * H, d.calorias > 0 ? 5 : 0) : 0
          const hAnt = (animado && hayDatosAnteriores) ? Math.max((ant.calorias / maxVal) * H, ant.calorias > 0 ? 4 : 0) : 0
          const enMeta = d.calorias >= metaCal * 0.85 && d.calorias <= metaCal * 1.1
          const esHoy  = i === actual.length - 1
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: H, gap: 2 }}>
                {hayDatosAnteriores && (
                  <div style={{ flex: 1, borderRadius: '4px 4px 0 0', height: hAnt, background: 'rgba(255,255,255,0.1)', transition: `height 0.7s cubic-bezier(0.4,0,0.2,1) ${i*0.05}s` }} />
                )}
                <div style={{
                  flex: 1, borderRadius: '4px 4px 0 0', height: hAct,
                  background: esHoy ? `linear-gradient(180deg,${C.green},#16a34a)` : enMeta ? 'rgba(74,222,128,0.55)' : d.calorias > 0 ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.04)',
                  boxShadow: esHoy ? `0 0 10px rgba(74,222,128,0.3)` : 'none',
                  transition: `height 0.7s cubic-bezier(0.4,0,0.2,1) ${i*0.05+0.05}s`,
                }} />
              </div>
              <span style={{ fontSize: 10, color: esHoy ? C.green : 'rgba(255,255,255,0.25)', fontWeight: esHoy ? 700 : 400 }}>
                {['L','M','X','J','V','S','D'][i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Logros({ logros, animado }) {
  if (!logros || !logros.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {logros.map((l, i) => (
        <div key={l.id} style={{
          flexShrink: 0, background: C.card, borderRadius: 16,
          border: `0.5px solid ${l.color}30`, padding: '12px 14px', minWidth: 110, textAlign: 'center',
          opacity: animado ? 1 : 0, transform: animado ? 'scale(1)' : 'scale(0.85)',
          transition: `all 0.4s cubic-bezier(0.34,1.5,0.64,1) ${i*0.07}s`,
        }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>&#127942;</div>
          <p style={{ fontSize: 12, fontWeight: 700, color: l.color, marginBottom: 3 }}>{l.titulo}</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.3 }}>{l.desc}</p>
        </div>
      ))}
    </div>
  )
}

// ── Gráfico de progresión de carga por ejercicio ──────────────────────────────
function GraficoEjercicio({ registros, animado, color = C.green }) {
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

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H + 20} viewBox={`0 0 ${W} ${H + 20}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {animado && pts.length > 1 && (
          <>
            <path
              d={`${pathD} L ${pts[pts.length-1][0]} ${H} L ${pts[0][0]} ${H} Z`}
              fill={`url(#${gradId})`} opacity={0.3}
            />
            <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {animado && pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y}
            r={i === pts.length - 1 ? 4 : 3}
            fill={i === pts.length - 1 ? color : `${color}80`}
            stroke="#0a0a0a" strokeWidth={1.5}
          />
        ))}
        {registros.length > 1 && (
          <>
            <text x={0} y={H + 16} fill="rgba(255,255,255,0.2)" fontSize={9}>
              {new Date(primero.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
            </text>
            <text x={W} y={H + 16} fill="rgba(255,255,255,0.2)" fontSize={9} textAnchor="end">
              {new Date(ultimo.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

// Mapa de grupo muscular → colores (mismo sistema que GymScreen)
const COLORES_MUSCULO = {
  'Piernas':  { text: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  'Core':     { text: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  'Pecho':    { text: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  'Hombros':  { text: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  'Espalda':  { text: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Brazos':   { text: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Cardio':   { text: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
}
const colorMusculo = (m) => COLORES_MUSCULO[m] ?? { text: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.07)' }

// Mini sparkline — solo la línea, sin ejes
function Sparkline({ registros, color }) {
  const W = 56, H = 24
  if (!registros || registros.length < 2) {
    return <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 1.5, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }} />
    </div>
  }
  const vals  = registros.map(r => r.peso_kg)
  const minV  = Math.min(...vals)
  const maxV  = Math.max(...vals)
  const range = (maxV - minV) || 1
  const toX   = (i) => (i / (vals.length - 1)) * W
  const toY   = (v) => H - 2 - ((v - minV) / range) * (H - 4)
  const pts   = vals.map((v, i) => [toX(i), toY(v)])
  const d     = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={2.5} fill={color} />
    </svg>
  )
}

// Card de ejercicio expandible
function EjercicioCard({ ejercicio, expandido, onToggle, animado, delay }) {
  const registros = ejercicio.registros ?? []
  const primero   = registros[0]
  const ultimo    = registros[registros.length - 1]
  const maxPeso   = registros.length ? Math.max(...registros.map(r => r.peso_kg)) : 0
  const diff      = registros.length >= 2 ? +(ultimo.peso_kg - primero.peso_kg).toFixed(1) : 0
  const mc        = colorMusculo(ejercicio.musculo)

  return (
    <div style={{
      background: C.card,
      borderRadius: expandido ? 20 : 18,
      border: expandido ? `0.5px solid ${mc.text}30` : `0.5px solid ${C.border}`,
      overflow: 'hidden',
      transition: 'border-color 0.2s, border-radius 0.2s',
      opacity: animado ? 1 : 0,
      transform: animado ? 'translateY(0)' : 'translateY(12px)',
      transitionProperty: 'opacity, transform, border-color, border-radius',
      transitionDuration: `0.4s, 0.4s, 0.2s, 0.2s`,
      transitionDelay: `${delay}s, ${delay}s, 0s, 0s`,
    }}>

      {/* Fila principal — siempre visible */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          background: expandido ? `${mc.text}06` : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        {/* Badge músculo */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: mc.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: mc.text }} />
        </div>

        {/* Nombre + músculo */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ejercicio.nombre}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 20,
              background: mc.bg, color: mc.text, fontWeight: 700,
            }}>
              {ejercicio.musculo ?? 'General'}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              {registros.length} {registros.length === 1 ? 'sesion' : 'sesiones'}
            </span>
          </div>
        </div>

        {/* Sparkline */}
        <Sparkline registros={registros} color={mc.text} />

        {/* Último peso + diff */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 3 }}>
            {ultimo?.peso_kg ?? '--'}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}> kg</span>
          </p>
          {registros.length >= 2 && (
            <p style={{ fontSize: 11, fontWeight: 700, color: diff >= 0 ? C.green : C.orange }}>
              {diff >= 0 ? '+' : ''}{diff} kg
            </p>
          )}
        </div>

        {/* Flecha */}
        <div style={{
          color: 'rgba(255,255,255,0.2)', fontSize: 10,
          transform: expandido ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.25s',
          flexShrink: 0,
        }}>&#9654;</div>
      </div>

      {/* Panel expandido */}
      {expandido && registros.length > 0 && (
        <div style={{
          borderTop: `0.5px solid rgba(255,255,255,0.04)`,
          padding: '16px 16px 20px',
          background: `${mc.text}04`,
        }}>

          {/* Gráfico completo */}
          <GraficoEjercicio registros={registros} animado={true} color={mc.text} />

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[
              { label: 'Maximo',   val: `${maxPeso} kg`,        color: mc.text  },
              { label: 'Sesiones', val: registros.length,        color: C.blue   },
              { label: 'Inicio',   val: `${primero.peso_kg} kg`, color: C.purple },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                padding: '10px 12px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Historial reciente */}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>
              Historial reciente
            </p>
            {[...registros].reverse().slice(0, 6).map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                  {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{r.series}x{r.reps}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? mc.text : '#fff' }}>{r.peso_kg} kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Pesos: lista de ejercicios con filtro + cards expandibles ─────────────
function TabPesos({ animado }) {
  const [historialEj,       setHistorialEj]       = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [errorHistorial,    setErrorHistorial]    = useState(false)
  const [filtroGrupo,       setFiltroGrupo]       = useState('Todos')
  const [expandido,         setExpandido]         = useState(null)   // nombre del ejercicio expandido

  useEffect(() => {
    setCargandoHistorial(true)
    getHistorialEjercicios()
      .then(data => setHistorialEj(data))
      .catch(() => setErrorHistorial(true))
      .finally(() => setCargandoHistorial(false))
  }, [])

  if (cargandoHistorial) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        Cargando historial...
      </div>
    )
  }

  if (errorHistorial) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        Error cargando historial. Verifica tu conexion.
      </div>
    )
  }

  if (historialEj.length === 0) {
    return (
      <div style={{
        background: C.card, borderRadius: 22, border: `0.5px solid ${C.border}`,
        padding: 28,
        opacity: animado ? 1 : 0, transition: 'all 0.5s ease',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <BruceAvatar size={44} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 6 }}>
              Aun no hay registros de carga
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Cuando guardes una sesion de gym con el peso real de cada ejercicio,
              Bruce te mostrara tu progresion aqui.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Grupos presentes en los datos reales del usuario
  const gruposPresentes = ['Todos', ...new Set(
    historialEj.map(e => e.musculo).filter(Boolean)
  )]

  const ejerciciosFiltrados = filtroGrupo === 'Todos'
    ? historialEj
    : historialEj.filter(e => e.musculo === filtroGrupo)

  const handleToggle = (nombre) => {
    setExpandido(prev => prev === nombre ? null : nombre)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Filtros por grupo muscular */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
        {gruposPresentes.map(grupo => {
          const mc     = grupo === 'Todos' ? null : colorMusculo(grupo)
          const activo = filtroGrupo === grupo
          return (
            <button
              key={grupo}
              onClick={() => { setFiltroGrupo(grupo); setExpandido(null) }}
              style={{
                whiteSpace: 'nowrap', padding: '8px 14px',
                borderRadius: 20, border: 'none', flexShrink: 0,
                background: activo
                  ? (mc ? mc.text : C.green)
                  : 'rgba(255,255,255,0.07)',
                color: activo ? '#000' : 'rgba(255,255,255,0.45)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {grupo}
            </button>
          )
        })}
      </div>

      {/* Conteo */}
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', paddingLeft: 2 }}>
        {ejerciciosFiltrados.length} {ejerciciosFiltrados.length === 1 ? 'ejercicio' : 'ejercicios'}
      </p>

      {/* Lista de cards */}
      {ejerciciosFiltrados.length === 0 ? (
        <div style={{
          background: C.card, borderRadius: 18, border: `0.5px solid ${C.border}`,
          padding: '32px 20px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            Sin registros para este grupo todavia.
          </p>
        </div>
      ) : (
        ejerciciosFiltrados.map((ej, i) => (
          <EjercicioCard
            key={ej.nombre}
            ejercicio={ej}
            expandido={expandido === ej.nombre}
            onToggle={() => handleToggle(ej.nombre)}
            animado={animado}
            delay={i * 0.04}
          />
        ))
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ProgressScreen({ t, screen }) {
  const [data,       setData]       = useState(null)
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState(null)
  const [nuevoPeso,  setNuevoPeso]  = useState('')
  const [guardando,  setGuardando]  = useState(false)
  const [animado,    setAnimado]    = useState(false)
  const [vistaRacha, setVistaRacha] = useState('gym')
  const [seccion,    setSeccion]    = useState('semana')

  useEffect(() => {
    if (screen !== 'progress') return
    setCargando(true)
    setAnimado(false)
    getProgresoCompleto()
      .then(d => { setData(d); setError(null) })
      .catch(() => setError(true))
      .finally(() => { setCargando(false); setTimeout(() => setAnimado(true), 100) })
  }, [screen])

  const guardarPeso = async () => {
    const kg = parseFloat(nuevoPeso)
    if (!kg || kg < 30 || kg > 300) return
    setGuardando(true)
    try {
      await registrarPeso({ peso_kg: kg })
      setNuevoPeso('')
      const d = await getProgresoCompleto()
      setData(d)
    } catch { setError('Error al guardar el peso.') }
    finally { setGuardando(false) }
  }

  const semanaActual   = data?.semana_actual   ?? Array(7).fill({ calorias: 0, gym: false })
  const semanaAnterior = data?.semana_anterior ?? Array(7).fill({ calorias: 0, gym: false })
  const diasMes        = data?.dias            ?? []
  const pesos          = data?.pesos           ?? []
  const proyeccion     = data?.proyeccion      ?? null
  const score          = data?.score_semanal   ?? 0
  const desglose       = data?.desglose_score  ?? null
  const logros         = data?.logros          ?? []
  const metaCal        = data?.metas?.calorias ?? 1900
  const pesoObjetivo   = data?.peso_objetivo   ?? null

  const rachaGym    = data?.racha_gym    ?? 0
  const rachaComida = data?.racha_comida ?? 0
  const racha       = vistaRacha === 'gym' ? rachaGym : rachaComida

  const pesoActual   = pesos.length ? pesos[pesos.length - 1].peso_kg : null
  const pesoAnterior = pesos.length > 1 ? pesos[pesos.length - 2].peso_kg : pesoActual
  const pesoDiff     = pesoActual && pesoAnterior ? (pesoActual - pesoAnterior).toFixed(1) : null

  const diasGym     = semanaActual.filter(d => d.gym).length
  const diasCal     = semanaActual.filter(d => d.calorias >= metaCal * 0.8).length
  const diasActivos = semanaActual.filter(d => d.calorias > 0 || d.gym).length

  const promedioCal = (() => {
    const con = semanaActual.filter(d => d.calorias > 0)
    return con.length ? Math.round(con.reduce((s, d) => s + d.calorias, 0) / con.length) : 0
  })()

  return (
    <div style={{ padding: '56px 16px 24px', color: '#fff', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1px', marginBottom: 2 }}>
            {t?.progress ?? 'Progreso'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>Tu evolucion semanal</p>
        </div>
        <BruceAvatar size={38} />
      </div>

      {/* Tabs */}
      <div style={{ background: C.card, borderRadius: 14, border: `0.5px solid ${C.border}`, padding: 4, display: 'flex', gap: 4, marginBottom: 16, marginTop: 16 }}>
        {[
          { id: 'semana', label: 'Semana'  },
          { id: 'mes',    label: 'Mes'     },
          { id: 'pesos',  label: 'Cargas'  },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setSeccion(id)} style={{
            flex: 1, padding: '9px 8px', borderRadius: 11, border: 'none',
            background: seccion === id ? C.green : 'transparent',
            color: seccion === id ? '#000' : 'rgba(255,255,255,0.4)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {/* Loading / error para semana y mes */}
      {cargando && seccion !== 'pesos' && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          Cargando progreso...
        </div>
      )}

      {error && !cargando && seccion !== 'pesos' && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Error cargando datos. Verifica tu conexion.
        </div>
      )}

      {/* ── TAB PESOS — siempre renderiza independiente del estado de data ── */}
      {seccion === 'pesos' && <TabPesos animado={animado} />}

      {/* ── TABs SEMANA y MES ── */}
      {!cargando && !error && (
        <>
          {/* ── SEMANA ── */}
          {seccion === 'semana' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Score + anillos */}
              <div style={{
                background: C.card, borderRadius: 22, border: `0.5px solid ${C.border}`, padding: 20,
                opacity: animado ? 1 : 0, transform: animado ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.5s ease', position: 'relative', overflow: 'visible',
              }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 14 }}>Score semanal</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ position: 'relative' }}>
                    <ScoreArc score={score} animado={animado} desglose={desglose} />
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 4 }}>
                      {score >= 80 ? 'Semana perfecta' : score >= 50 ? 'Buen ritmo' : 'Puedes mejorar'}
                    </p>
                  </div>
                  <AnillosFitness diasGym={diasGym} diasCal={diasCal} diasActivos={diasActivos} animado={animado} />
                </div>
              </div>

              {/* Calorías / comparación */}
              <div style={{
                background: C.card, borderRadius: 22, border: `0.5px solid ${C.border}`, padding: 20,
                opacity: animado ? 1 : 0, transform: animado ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.5s ease 0.1s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>Calorias / comparacion</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1 }}>{promedioCal}</span>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>kcal/dia</span>
                    </div>
                  </div>
                  <div style={{ background: 'rgba(74,222,128,0.08)', border: '0.5px solid rgba(74,222,128,0.15)', borderRadius: 12, padding: '8px 12px', textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>Meta</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{metaCal.toLocaleString()}</p>
                  </div>
                </div>
                <BarrasComparacion actual={semanaActual} anterior={semanaAnterior} metaCal={metaCal} animado={animado} />
              </div>

              {/* Peso + Racha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                {/* Card peso corporal */}
                <div style={{
                  background: C.card, borderRadius: 20, border: `0.5px solid ${C.border}`, padding: 18,
                  opacity: animado ? 1 : 0, transition: 'all 0.5s ease 0.2s',
                }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Peso</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 4 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1 }}>{pesoActual ?? '--'}</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>kg</span>
                  </div>
                  {pesoDiff !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                      {parseFloat(pesoDiff) <= 0 ? <IconTrendingDown size={13} color={C.green} /> : <IconTrendingUp size={13} color={C.orange} />}
                      <span style={{ fontSize: 12, color: parseFloat(pesoDiff) <= 0 ? C.green : C.orange, fontWeight: 600 }}>
                        {parseFloat(pesoDiff) > 0 ? '+' : ''}{pesoDiff} kg
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" value={nuevoPeso} step="0.1" placeholder="70.0"
                      onChange={e => setNuevoPeso(e.target.value)}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', width: 0 }}
                    />
                    <button onClick={guardarPeso} disabled={guardando || !nuevoPeso} style={{
                      background: nuevoPeso ? C.green : 'rgba(255,255,255,0.06)',
                      color: nuevoPeso ? '#000' : 'rgba(255,255,255,0.2)',
                      border: 'none', borderRadius: 10, padding: '8px 12px',
                      fontSize: 13, fontWeight: 700, cursor: nuevoPeso ? 'pointer' : 'default',
                      transition: 'all 0.2s', fontFamily: 'inherit',
                    }}>{guardando ? '...' : 'OK'}</button>
                  </div>
                </div>

                {/* Card racha */}
                <div style={{
                  background: C.card, borderRadius: 20, border: `0.5px solid ${C.border}`, padding: 18,
                  opacity: animado ? 1 : 0, transition: 'all 0.5s ease 0.25s',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
                    {[{ id: 'gym', Icon: IconBarbell }, { id: 'comida', Icon: IconToolsKitchen2 }].map(({ id, Icon }) => (
                      <button key={id} onClick={() => setVistaRacha(id)} style={{
                        flex: 1, padding: '5px 4px', borderRadius: 8, border: 'none',
                        background: vistaRacha === id ? C.green : 'transparent',
                        color: vistaRacha === id ? '#000' : 'rgba(255,255,255,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                      }}>
                        <Icon size={13} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
                    Racha {vistaRacha === 'gym' ? 'gym' : 'comida'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 10 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1, color: racha >= 3 ? C.green : '#fff' }}>{racha}</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}> dias</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {semanaActual.map((d, i) => {
                      const activo = vistaRacha === 'gym' ? d.gym : d.calorias > 0
                      return (
                        <div key={i} style={{
                          flex: 1, aspectRatio: '1', borderRadius: '50%',
                          background: activo ? C.green : 'rgba(255,255,255,0.06)',
                          boxShadow: activo ? `0 0 6px rgba(74,222,128,0.3)` : 'none',
                          transition: 'all 0.3s',
                        }} />
                      )
                    })}
                  </div>
                  {racha > 7 && (
                    <p style={{ fontSize: 10, color: C.green, marginTop: 6, fontWeight: 600 }}>
                      +{racha - 7} dias mas de racha real
                    </p>
                  )}
                </div>
              </div>

              {/* Evolución de peso corporal */}
              <div style={{
                background: C.card, borderRadius: 22, border: `0.5px solid ${C.border}`, padding: 20,
                opacity: animado ? 1 : 0, transition: 'all 0.5s ease 0.3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Evolucion de peso</p>
                    {proyeccion && (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        Tendencia:{' '}
                        <span style={{ fontWeight: 700, color: proyeccion.tendencia_kg_semana <= 0 ? C.green : C.orange }}>
                          {proyeccion.tendencia_kg_semana > 0 ? '+' : ''}{proyeccion.tendencia_kg_semana} kg/sem
                        </span>
                      </p>
                    )}
                  </div>
                  {proyeccion?.dias_para_objetivo && (
                    <div style={{ background: 'rgba(74,222,128,0.08)', border: '0.5px solid rgba(74,222,128,0.15)', borderRadius: 12, padding: '6px 12px', textAlign: 'right' }}>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>Objetivo</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.green }}>~{proyeccion.dias_para_objetivo}d</p>
                    </div>
                  )}
                </div>
                <GraficoPeso pesos={pesos} proyeccion={proyeccion} pesoObjetivo={pesoObjetivo} animado={animado} />
              </div>

              {/* Logros */}
              {logros.length > 0 && (
                <div style={{ opacity: animado ? 1 : 0, transition: 'opacity 0.5s ease 0.4s' }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 12 }}>Logros desbloqueados</p>
                  <Logros logros={logros} animado={animado} />
                </div>
              )}

              {/* Banner Bruce racha >= 5 */}
              {racha >= 5 && (
                <div style={{
                  background: 'linear-gradient(135deg,#080f10,#0c1f22)',
                  border: `0.5px solid rgba(74,222,128,0.15)`,
                  borderRadius: 20, padding: 20,
                  display: 'flex', gap: 14, alignItems: 'center',
                  opacity: animado ? 1 : 0, transition: 'opacity 0.5s ease 0.5s',
                }}>
                  <BruceAvatar size={52} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 17, color: C.green, marginBottom: 4 }}>Imparable, parcero</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                      {racha} dias seguidos de {vistaRacha === 'gym' ? 'gym' : 'registro'}. Eso no es suerte, es disciplina.
                    </p>
                    <p style={{ fontWeight: 700, fontSize: 15, color: C.green }}>Sigue asi.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MES ── */}
          {seccion === 'mes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                background: C.card, borderRadius: 22, border: `0.5px solid ${C.border}`, padding: 20,
                opacity: animado ? 1 : 0, transition: 'all 0.5s ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Actividad mensual</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Ultimos 30 dias</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color: C.green, letterSpacing: '-1px' }}>{diasMes.filter(d => d.gym || d.calorias > 0).length}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>dias activos</p>
                  </div>
                </div>
                <GridMensual dias={diasMes} metaCal={metaCal} animado={animado} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Dias gym',    val: diasMes.filter(d => d.gym).length,                                                                                                          unit: 'dias', color: C.green  },
                  { label: 'En meta cal', val: diasMes.filter(d => d.calorias >= metaCal * 0.8).length,                                                                                   unit: 'dias', color: C.blue   },
                  { label: 'Prom. cal',   val: (() => { const c = diasMes.filter(d => d.calorias > 0); return c.length ? Math.round(c.reduce((s,d) => s+d.calorias,0)/c.length) : 0 })(), unit: 'kcal', color: C.orange },
                  { label: 'Mejor racha', val: (() => { let max=0,cur=0; diasMes.forEach(d => { if(d.gym){cur++;max=Math.max(max,cur)}else cur=0 }); return max })(),                      unit: 'dias', color: C.purple },
                ].map(({ label, val, unit, color }) => (
                  <div key={label} style={{ background: C.card, borderRadius: 18, border: `0.5px solid ${C.border}`, padding: '16px 14px' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>{label}</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-1px', lineHeight: 1 }}>
                      {val} <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}