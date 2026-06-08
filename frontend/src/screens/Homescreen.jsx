import { useState, useEffect, useRef } from 'react'
import {
  IconBell, IconFlame, IconDroplet, IconMeat,
  IconWheat, IconUserCircle, IconMessageCircle,
} from '@tabler/icons-react'
import MacroBar    from '../components/MacroBar'
import { getResumenHoy, getBruceFrase, sesionDeHoy } from '../api'

import bruceTuxedo       from '../assets/bruce-tuxedo.png'
import bruceTuxedoTriste from '../assets/bruce-tuxedo-triste.png'
import bruceTuxedoPensando   from '../assets/bruce-tuxedo-pensando.png'
import bruceTuxedoMuyfeliz   from '../assets/bruce-tuxedo-muyfeliz.png'
import bruceTuxedoSonrisa    from '../assets/bruce-tuxedo-sonrisa.png'
import bruceTuxedoDeterminado from '../assets/bruce-tuxedo-determinado.png'
import bruceBatman       from '../assets/bruce-batman.png'

const METAS = { calorias: 1900, proteina: 140, carbos: 200, grasas: 55 }

const POSES = {
  normal:      bruceTuxedo,
  triste:      bruceTuxedoTriste,
  pensando:    bruceTuxedoPensando,
  muyfeliz:    bruceTuxedoMuyfeliz,
  sonrisa:     bruceTuxedoSonrisa,
  determinado: bruceTuxedoDeterminado,
  batman:      bruceBatman,
}

// Sábado = 6, Domingo = 0
const esDiaDescanso = () => {
  const dia = new Date().getDay()
  return dia === 0 || dia === 6
}

const getSaludo = (lang) => {
  const h = new Date().getHours()
  if (lang === 'es') {
    if (h < 12) return 'Buenos días,'
    if (h < 18) return 'Buenas tardes,'
    return 'Buenas noches,'
  }
  if (h < 12) return 'Good morning,'
  if (h < 18) return 'Good afternoon,'
  return 'Good evening,'
}

// ── Typewriter ────────────────────────────────────────────────────────────
function useTypewriter(text, speed = 20) {
  const [displayed, setDisplayed] = useState('')
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    if (!text) return
    setDisplayed('')
    setDone(false)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(iv); setDone(true) }
    }, speed)
    return () => clearInterval(iv)
  }, [text])

  return { displayed, done }
}

// ── Bruce Card ────────────────────────────────────────────────────────────
function BruceCard({ resumen, animado, onOpenChat }) {
  const [frase,         setFrase]         = useState('')
  const [pose,          setPose]          = useState('normal')
  const [cargandoFrase, setCargandoFrase] = useState(true)
  const [clicked,       setClicked]       = useState(false)
  const { displayed, done } = useTypewriter(frase, 20)

  // Batman de noche
  const hora = new Date().getHours()
  const esNoche = hora >= 20 || hora < 6
  const descanso = esDiaDescanso()
  const useBatman = esNoche
  const imagenBruce = esNoche ? POSES.batman : POSES[pose] ?? POSES.normal

  useEffect(() => {
    if (!resumen) return

    const h        = new Date().getHours()
    const descanso = esDiaDescanso()

    // Consultar si fue al gym hoy
    sesionDeHoy()
      .then(sesion => {
        const fueAlGym = sesion?.completada === true

        setCargandoFrase(true)
        getBruceFrase({
          calorias_hoy:  resumen.totales?.calorias ?? 0,
          meta_calorias: resumen.metas?.calorias   ?? 1900,
          proteina_hoy:  resumen.totales?.proteina ?? 0,
          meta_proteina: resumen.metas?.proteina   ?? 140,
          fue_al_gym:    fueAlGym,
          es_dia_gym:    !descanso,
          hora:          h,
        })
          .then(data => {
            setFrase(data.frase)
            setPose(esNoche ? 'batman' : (data.pose ?? 'normal'))
          })
          .catch(() => {
            setFrase('La consistencia gana siempre. Siempre.')
            setPose('normal')
          })
          .finally(() => setCargandoFrase(false))
      })
      .catch(() => {
        // Si falla sesionDeHoy, igual llama a Bruce sin dato de gym
        setCargandoFrase(true)
        getBruceFrase({
          calorias_hoy:  resumen.totales?.calorias ?? 0,
          meta_calorias: resumen.metas?.calorias   ?? 1900,
          proteina_hoy:  resumen.totales?.proteina ?? 0,
          meta_proteina: resumen.metas?.proteina   ?? 140,
          fue_al_gym:    false,
          es_dia_gym:    !descanso,
          hora:          h,
        })
          .then(data => { setFrase(data.frase); setPose(data.pose ?? 'normal') })
          .catch(() => setFrase('La consistencia gana siempre. Siempre.'))
          .finally(() => setCargandoFrase(false))
      })
  }, [resumen])

  const handleClick = () => {
    setClicked(true)
    setTimeout(() => setClicked(false), 600)
    onOpenChat()
  }

  return (
    <div style={{
      position: 'relative',
      marginTop: '8px',
      marginBottom: '8px',
      opacity: animado ? 1 : 0,
      transform: animado ? 'translateY(0)' : 'translateY(24px)',
      transition: 'all 0.55s ease 0.5s',
    }}>

      {/* ── Card ── */}
    <div style={{
      background: 'linear-gradient(135deg, #091810, #0d2418)',
      border: '0.5px solid rgba(74,222,128,0.15)',
      borderRadius: '24px',
      padding: '16px',
      display: 'flex',
      alignItems: 'flex-end',
      gap: '12px',
    }}>

      {/* Bruce — tamaño fijo, no interfiere con el texto */}
      <div
        onClick={handleClick}
        style={{
          width: useBatman ? '130px' : '90px',
          minWidth: useBatman ? '130px' : '90px',
          height: useBatman ? '130px' : '90px',
          cursor: 'pointer',
          animation: clicked
            ? 'bruceClick 0.5s ease'
            : 'bruceFloat 3s ease-in-out infinite',
          flexShrink: 0,
        }}
      >
        <img
          src={imagenBruce}
          alt='Bruce'
          style={{
            width: '100%',
            height: '100%',
            objectFit: useBatman ? 'cover' : 'contain',
            objectPosition: 'bottom center',
            filter: useBatman
              ? 'drop-shadow(0 6px 20px rgba(74,222,128,0.35))'
              : 'drop-shadow(0 6px 16px rgba(74,222,128,0.2))',
          }}
        />
      </div>

      {/* Contenido derecha */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#4ade80' }}>Bruce</span>
            <span style={{
              fontSize: '9px', fontWeight: '700', letterSpacing: '0.07em',
              color: 'rgba(74,222,128,0.7)',
              background: 'rgba(74,222,128,0.08)',
              padding: '2px 8px', borderRadius: '6px',
            }}>
              {esNoche ? 'MODO NOCHE' : descanso ? 'DESCANSO' : 'TU COACH'}
            </span>
          </div>

          <button
            onClick={onOpenChat}
            style={{
              background: 'rgba(74,222,128,0.1)',
              border: '0.5px solid rgba(74,222,128,0.2)',
              borderRadius: '12px', padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: '5px',
              cursor: 'pointer',
            }}
          >
            <IconMessageCircle size={13} color='#4ade80' strokeWidth={2} />
            <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700' }}>Chat</span>
          </button>
        </div>

        {/* Frase */}
        <div style={{
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '14px',
          padding: '12px 14px',
          minHeight: '56px',
          display: 'flex',
          alignItems: 'center',
        }}>
          {cargandoFrase ? (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#4ade80', opacity: 0.5,
                  animation: `bruceDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          ) : (
            <p style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.72)',
              lineHeight: '1.65',
              fontStyle: 'italic',
              margin: 0,
            }}>
              "{displayed}{!done && <span style={{ opacity: 0.35 }}>|</span>}"
            </p>
          )}
        </div>
      </div>
    </div>

          {/* Keyframes */}
          <style>{`
            @keyframes bruceFloat {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50%       { transform: translateY(-7px) rotate(1.5deg); }
            }
            @keyframes bruceClick {
              0%   { transform: scale(1)    rotate(0deg); }
              25%  { transform: scale(1.2)  rotate(-7deg); }
              55%  { transform: scale(1.1)  rotate(5deg); }
              80%  { transform: scale(1.03) rotate(-2deg); }
              100% { transform: scale(1)    rotate(0deg); }
            }
            @keyframes bruceDot {
              0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
              40%           { transform: scale(1.1); opacity: 1; }
            }
          `}</style>
        </div>
      )
    }

// ── HomeScreen ────────────────────────────────────────────────────────────
const descanso = esDiaDescanso()

export default function HomeScreen({ t, lang, setLang, screen, onGoToProfile, onOpenChat }) {
  const [resumen,  setResumen]  = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error,    setError]    = useState(null)
  const [animado,  setAnimado]  = useState(false)

  useEffect(() => {
    if (screen !== 'home') return
    setCargando(true)
    setAnimado(false)
    getResumenHoy()
      .then(data  => { setResumen(data); setError(null) })
      .catch(()   => setError(true))
      .finally(() => { setCargando(false); setTimeout(() => setAnimado(true), 80) })
  }, [screen])

  const totales  = resumen?.totales ?? { calorias: 0, proteina: 0, carbos: 0, grasas: 0 }
  const metas    = resumen?.metas   ?? METAS
  const calPct   = Math.min(Math.round((totales.calorias / metas.calorias) * 100), 100)
  const restante = Math.max(metas.calorias - totales.calorias, 0)

  const macros = [
    { label: t.protein, value: totales.proteina, unit: 'g', goal: metas.proteina, color: '#4ade80', icon: IconMeat,    pct: (totales.proteina / metas.proteina) * 100 },
    { label: t.carbs,   value: totales.carbos,   unit: 'g', goal: metas.carbos,   color: '#60a5fa', icon: IconWheat,   pct: (totales.carbos   / metas.carbos)   * 100 },
    { label: t.fats,    value: totales.grasas,   unit: 'g', goal: metas.grasas,   color: '#fb923c', icon: IconFlame,   pct: (totales.grasas   / metas.grasas)   * 100 },
    { label: t.water,   value: 0,                unit: 'L', goal: 2.5,            color: '#22d3ee', icon: IconDroplet, pct: 0 },
  ]

  return (
    <div style={{ paddingBottom: '8px' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: '60px 20px 28px',
        background: 'linear-gradient(180deg, #0c1a10 0%, #0a0a0a 100%)',
      }}>
        <div style={{
          position: 'absolute', top: '-80px', right: '-60px',
          width: '260px', height: '260px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(74,222,128,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: '28px',
          opacity: animado ? 1 : 0,
          transform: animado ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.5s ease',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{
                background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)',
                borderRadius: '20px', padding: '4px 12px',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700', letterSpacing: '0.1em' }}>NUTRIFIT</span>
              </div>
              <button onClick={() => setLang(lang === 'es' ? 'en' : 'es')} style={{
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '11px',
                fontWeight: '600', padding: '4px 8px', cursor: 'pointer', letterSpacing: '0.05em',
              }}>
                {lang === 'es' ? 'EN' : 'ES'}
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '2px' }}>{getSaludo(lang)}</p>
            <h1 style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '-1.5px', lineHeight: 1 }}>Samuel 👋</h1>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <IconBell size={17} color='rgba(255,255,255,0.45)' />
            </button>
            <button onClick={onGoToProfile} style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <IconUserCircle size={22} color='rgba(255,255,255,0.55)' strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* Hero calorías */}
        <div style={{
          background: 'rgba(255,255,255,0.025)', border: '0.5px solid rgba(255,255,255,0.07)',
          borderRadius: '24px', padding: '22px',
          opacity: animado ? 1 : 0,
          transform: animado ? 'translateY(0)' : 'translateY(14px)',
          transition: 'all 0.55s ease 0.1s',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
                <IconFlame size={12} color='#4ade80' />
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '600' }}>
                  {t.calToday}
                </span>
                {cargando && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginLeft: '4px' }}>cargando…</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '54px', fontWeight: '700', letterSpacing: '-3px', lineHeight: 1 }}>
                  {totales.calorias.toLocaleString()}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px' }}>
                  /{metas.calorias.toLocaleString()}
                </span>
              </div>
            </div>
            <div style={{ position: 'relative', width: '68px', height: '68px', flexShrink: 0 }}>
              <svg width="68" height="68" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="34" cy="34" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
                <circle cx="34" cy="34" r="28" fill="none" stroke="#4ade80" strokeWidth="5"
                  strokeDasharray={String(2 * Math.PI * 28)}
                  strokeDashoffset={String(2 * Math.PI * 28 * (1 - calPct / 100))}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#4ade80' }}>{calPct}%</span>
              </div>
            </div>
          </div>

          <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{
              height: '100%', borderRadius: '2px', width: `${calPct}%`,
              background: calPct >= 95 ? '#fb923c' : 'linear-gradient(90deg, #16a34a 0%, #4ade80 100%)',
              transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{restante.toLocaleString()} kcal restantes</span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>{t.goal} {metas.calorias.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Grid macros */}
      <div style={{ padding: '20px 16px 0' }}>
        <p style={{
          fontSize: '11px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
          letterSpacing: '0.09em', fontWeight: '600', marginBottom: '12px',
        }}>Macros del día</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {macros.map((m, idx) => {
            const Icon = m.icon
            return (
              <div key={m.label} style={{
                background: '#131313', borderRadius: '20px',
                border: '0.5px solid rgba(255,255,255,0.06)',
                padding: '18px 16px',
                opacity: animado ? 1 : 0,
                transform: animado ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 0.5s ease ${0.18 + idx * 0.08}s`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600' }}>
                    {m.label}
                  </span>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '8px',
                    background: `${m.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={13} color={m.color} strokeWidth={2.2} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '30px', fontWeight: '700', color: m.color, letterSpacing: '-1px', lineHeight: 1 }}>
                    {m.unit === 'g' ? Math.round(m.value) : Number(m.value).toFixed(1)}
                  </span>
                  <span style={{ fontSize: '13px', color: m.color, opacity: 0.45, marginLeft: '1px' }}>{m.unit}</span>
                </div>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', marginBottom: '10px' }}>de {m.goal}{m.unit}</p>
                <MacroBar pct={Math.min(m.pct, 100)} color={m.color} />
              </div>
            )
          })}
        </div>

        {/* Bruce */}
        <BruceCard resumen={resumen} animado={animado} onOpenChat={onOpenChat} />

        {error && (
          <div style={{
            marginTop: '14px', background: 'rgba(239,68,68,0.07)',
            border: '0.5px solid rgba(239,68,68,0.18)', borderRadius: '14px',
            padding: '12px 16px', fontSize: '12px', color: '#f87171', lineHeight: '1.6',
          }}>
            ⚠ Backend desconectado —{' '}
            <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: '4px', fontSize: '11px' }}>
              python manage.py runserver
            </code>
          </div>
        )}
      </div>
    </div>
  )
}