import { useState, useEffect, useRef } from 'react'
import {
  IconBell, IconBellOff, IconFlame, IconDroplet, IconMeat,
  IconWheat, IconMessageCircle, IconRefresh,
} from '@tabler/icons-react'
import MacroBar from '../components/MacroBar'
import { toast } from '../lib/toast'
import { getResumenHoy, getBruceFrase, sesionDeHoy } from '../api'
import { prefersReducedMotion, useEntrada } from '../lib/motion'
import {
  soportaNotificaciones, permisoActual, estasSuscrito,
  suscribir, desuscribir,
} from '../utils/notificaciones'

import bruceTuxedo            from '../assets/bruce-tuxedo.webp'
import bruceTuxedoTriste      from '../assets/bruce-tuxedo-triste.webp'
import bruceTuxedoPensando    from '../assets/bruce-tuxedo-pensando.webp'
import bruceTuxedoMuyfeliz    from '../assets/bruce-tuxedo-muyfeliz.webp'
import bruceTuxedoSonrisa     from '../assets/bruce-tuxedo-sonrisa.webp'
import bruceTuxedoDeterminado from '../assets/bruce-tuxedo-determinado.webp'
import bruceBatman            from '../assets/bruce-batman.webp'

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

const FRASE_RESPALDO = 'La consistencia gana siempre. Siempre.'

// Sábado = 6, Domingo = 0
const esDiaDescanso = () => {
  const dia = new Date().getDay()
  return dia === 0 || dia === 6
}
const esDeNoche = () => {
  const h = new Date().getHours()
  return h >= 20 || h < 6
}

const getSaludo = (lang) => {
  const h = new Date().getHours()
  if (lang === 'es') {
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ── Typewriter ────────────────────────────────────────────────────────────
// Con "reducir movimiento" el texto aparece completo de una vez.
function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    if (!text) return
    if (prefersReducedMotion()) { setDisplayed(text); setDone(true); return }
    setDisplayed('')
    setDone(false)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(iv); setDone(true) }
    }, speed)
    return () => clearInterval(iv)
  }, [text, speed])

  return { displayed, done }
}

// ── Bruce Card ────────────────────────────────────────────────────────────
function BruceCard({ resumen, entrar, onOpenChat, usuario }) {
  const [frase,         setFrase]         = useState('')
  const [pose,          setPose]          = useState('normal')
  const [cargandoFrase, setCargandoFrase] = useState(true)
  const [pop,           setPop]           = useState(false)
  const ultimoContexto = useRef(null)
  const vivo = useRef(true)
  const { displayed, done } = useTypewriter(frase)

  useEffect(() => () => { vivo.current = false }, [])

  const esNoche  = esDeNoche()
  const descanso = esDiaDescanso()
  const imagenBruce = esNoche ? POSES.batman : POSES[pose] ?? POSES.normal

  useEffect(() => {
    if (!resumen) return

    const contextoBase = {
      calorias_hoy:   resumen.totales?.calorias  ?? 0,
      meta_calorias:  resumen.metas?.calorias    ?? 1900,
      proteina_hoy:   resumen.totales?.proteina  ?? 0,
      meta_proteina:  resumen.metas?.proteina    ?? 140,
      carbos_hoy:     resumen.totales?.carbos    ?? 0,
      meta_carbos:    resumen.metas?.carbos      ?? 200,
      es_dia_gym:     !esDiaDescanso(),
      hora:           new Date().getHours(),
      racha_gym:      resumen.racha_gym          ?? 0,
      racha_comida:   resumen.racha_comida       ?? 0,
      nombre_usuario: usuario?.first_name?.split(' ')[0] || usuario?.email?.split('@')[0] || '',
      objetivo:       resumen.objetivo           ?? usuario?.objetivo ?? 'mantener',
    }

    // Volver a la pestaña no debe pedirle otra frase a la IA si nada cambió
    const clave = `${contextoBase.calorias_hoy}|${contextoBase.proteina_hoy}|${contextoBase.hora}`
    if (ultimoContexto.current === clave) return
    ultimoContexto.current = clave

    const pedir = (fueAlGym) => {
      setCargandoFrase(true)
      getBruceFrase({ ...contextoBase, fue_al_gym: fueAlGym })
        .then(data => {
          if (!vivo.current || ultimoContexto.current !== clave) return
          setFrase(data.frase)
          setPose(esDeNoche() ? 'batman' : (data.pose ?? 'normal'))
        })
        .catch(() => {
          if (!vivo.current || ultimoContexto.current !== clave) return
          setFrase(FRASE_RESPALDO); setPose('normal')
        })
        .finally(() => { if (vivo.current && ultimoContexto.current === clave) setCargandoFrase(false) })
    }

    sesionDeHoy()
      .then(sesion => pedir(sesion?.completada === true))
      .catch(() => pedir(false))
  }, [resumen, usuario])

  const tocarBruce = () => {
    setPop(false)
    requestAnimationFrame(() => setPop(true))
    onOpenChat()
  }

  return (
    <section
      className={entrar ? 'nf-enter' : undefined}
      style={{
        animationDelay: '240ms',
        background: 'linear-gradient(135deg, #0b1c12 0%, #0f2a1b 100%)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'inset 0 0 0 0.5px rgba(74,222,128,0.16)',
        padding: '16px',
        display: 'flex', alignItems: 'flex-end', gap: '12px',
        marginTop: '12px',
      }}
    >
      <button
        onClick={tocarBruce}
        aria-label='Hablar con Bruce'
        style={{
          width: esNoche ? '124px' : '92px', height: esNoche ? '124px' : '92px',
          flexShrink: 0, borderRadius: '16px',
          animation: pop ? 'nf-pop 360ms var(--ease-out)' : undefined,
        }}
        onAnimationEnd={() => setPop(false)}
      >
        <img
          src={imagenBruce}
          alt=''
          className='nf-float'
          style={{
            width: '100%', height: '100%',
            objectFit: esNoche ? 'cover' : 'contain',
            objectPosition: 'bottom center',
            filter: 'drop-shadow(0 6px 16px rgba(74,222,128,0.22))',
          }}
        />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--green)' }}>Bruce</span>
            <span className='nf-badge'>
              {esNoche ? 'Modo noche' : descanso ? 'Descanso' : 'Tu coach'}
            </span>
          </div>
          <button onClick={onOpenChat} className='nf-btn nf-btn--sm nf-btn--tinted' aria-label='Abrir chat con Bruce'>
            <IconMessageCircle size={15} strokeWidth={2} /> Chat
          </button>
        </div>

        <div style={{
          background: 'rgba(0,0,0,0.28)',
          borderRadius: '14px',
          padding: '12px 14px',
          minHeight: '60px',
          display: 'flex', alignItems: 'center',
        }}>
          {cargandoFrase ? (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} aria-label='Bruce está pensando'>
              {[0, 1, 2].map(i => (
                <span key={i} className='nf-dot' style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.86)', lineHeight: 1.5 }} aria-live='polite'>
              “{displayed}{!done && <span style={{ opacity: 0.35 }}>|</span>}”
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

// ── HomeScreen ────────────────────────────────────────────────────────────
export default function HomeScreen({ t, lang, screen, usuario, onGoToProfile, onOpenChat }) {
  const [resumen,      setResumen]      = useState(null)
  const [cargando,     setCargando]     = useState(true)
  const [error,        setError]        = useState(false)
  const [suscrito,     setSuscrito]     = useState(false)
  const [cargandoBell, setCargandoBell] = useState(false)
  // La entrada escalonada es para la primera vez. Volver a la pestaña
  // decenas de veces al día no debe repetir la animación.
  const entrar = useEntrada(screen === 'home')

  useEffect(() => {
    estasSuscrito().then(setSuscrito)
  }, [])

  const cargar = () => {
    setCargando(true)
    getResumenHoy()
      .then(data  => { setResumen(data); setError(false) })
      .catch(()   => setError(true))
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    if (screen !== 'home') return
    cargar()
  }, [screen])

  const toggleNotificaciones = async () => {
    if (!soportaNotificaciones()) {
      toast.error('Tu navegador no soporta notificaciones push.')
      return
    }
    if (permisoActual() === 'denied') {
      toast.error('Las notificaciones están bloqueadas. Actívalas en la configuración del navegador.')
      return
    }
    setCargandoBell(true)
    try {
      if (suscrito) {
        await desuscribir()
        setSuscrito(false)
        toast('Notificaciones desactivadas')
      } else {
        await suscribir()
        setSuscrito(true)
        toast.success('Bruce te escribirá cada día')
      }
    } catch (e) {
      console.error('Error notificaciones:', e)
      toast.error('No se pudieron cambiar las notificaciones.')
    } finally {
      setCargandoBell(false)
    }
  }

  const totales = resumen?.totales ?? { calorias: 0, proteina: 0, carbos: 0, grasas: 0 }
  const metas   = {
    calorias: usuario?.meta_calorias || resumen?.metas?.calorias || METAS.calorias,
    proteina: usuario?.meta_proteina || resumen?.metas?.proteina || METAS.proteina,
    carbos:   usuario?.meta_carbos   || resumen?.metas?.carbos   || METAS.carbos,
    grasas:   usuario?.meta_grasas   || resumen?.metas?.grasas   || METAS.grasas,
  }
  const calPct   = Math.min(Math.round((totales.calorias / metas.calorias) * 100), 100)
  const restante = Math.max(metas.calorias - totales.calorias, 0)
  const pasado   = totales.calorias > metas.calorias

  const nombreUsuario = usuario?.first_name?.split(' ')[0] || usuario?.email?.split('@')[0] || ''
  const sinDatosAun   = cargando && !resumen

  const macros = [
    { label: t.protein, value: totales.proteina, unit: 'g', goal: metas.proteina, color: 'var(--green)',  icon: IconMeat,    pct: (totales.proteina / metas.proteina) * 100 },
    { label: t.carbs,   value: totales.carbos,   unit: 'g', goal: metas.carbos,   color: 'var(--blue)',   icon: IconWheat,   pct: (totales.carbos   / metas.carbos)   * 100 },
    { label: t.fats,    value: totales.grasas,   unit: 'g', goal: metas.grasas,   color: 'var(--orange)', icon: IconFlame,   pct: (totales.grasas   / metas.grasas)   * 100 },
    { label: t.water,   value: +((resumen?.agua_ml ?? 0) / 1000).toFixed(1), unit: 'L', goal: 2.5, color: 'var(--cyan)', icon: IconDroplet, pct: ((resumen?.agua_ml ?? 0) / 2500) * 100 },
  ]

  const R = 28
  const CIRC = 2 * Math.PI * R

  return (
    <div>
      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: 'calc(var(--safe-top) + 20px) 16px 8px',
        background: 'radial-gradient(120% 70% at 85% 0%, rgba(74,222,128,0.12) 0%, transparent 60%)',
      }}>
        {/* Header */}
        <header
          className={entrar ? 'nf-enter' : undefined}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', padding: '0 4px' }}
        >
          <div style={{ minWidth: 0 }}>
            <p className='nf-subhead' style={{ marginBottom: '2px' }}>{getSaludo(lang)},</p>
            <h1 className='nf-large-title' style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombreUsuario || 'hola'}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginRight: '-6px' }}>
            <button
              onClick={toggleNotificaciones}
              disabled={cargandoBell}
              className='nf-icon-btn'
              aria-label={suscrito ? 'Desactivar notificaciones' : 'Activar notificaciones'}
              aria-pressed={suscrito}
              style={{ color: suscrito ? 'var(--green)' : 'var(--label-2)', opacity: cargandoBell ? 0.5 : 1 }}
            >
              {suscrito ? <IconBell size={22} strokeWidth={1.8} /> : <IconBellOff size={22} strokeWidth={1.8} />}
            </button>
            <button onClick={onGoToProfile} className='nf-icon-btn' aria-label='Abrir ajustes' style={{ padding: 0 }}>
              <span style={{
                width: '34px', height: '34px', borderRadius: '50%', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #064e3b, #16a34a)',
                fontSize: '13px', fontWeight: 700, color: '#fff',
                boxShadow: '0 0 0 0.5px rgba(255,255,255,0.15)',
              }}>
                {usuario?.avatar_display
                  ? <img src={usuario.avatar_display} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (nombreUsuario[0] ?? '?').toUpperCase()}
              </span>
            </button>
          </div>
        </header>

        {/* Calorías */}
        <section
          className={`nf-card${entrar ? ' nf-enter' : ''}`}
          style={{ padding: '20px', animationDelay: '60ms', background: 'rgba(255,255,255,0.035)' }}
          aria-label={`${t.calToday}: ${totales.calorias} de ${metas.calorias}`}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <IconFlame size={15} color='var(--green)' />
                <span className='nf-footnote' style={{ fontWeight: 600 }}>{t.calToday}</span>
              </div>
              {sinDatosAun ? (
                <div className='nf-skeleton' style={{ width: '150px', height: '52px' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span className='nf-num' style={{ fontSize: '52px', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1 }}>
                    {totales.calorias.toLocaleString('es-CO')}
                  </span>
                  <span className='nf-num' style={{ color: 'var(--label-3)', fontSize: '17px', fontWeight: 500 }}>
                    / {metas.calorias.toLocaleString('es-CO')}
                  </span>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', width: '68px', height: '68px', flexShrink: 0 }} aria-hidden='true'>
              <svg width='68' height='68' style={{ transform: 'rotate(-90deg)' }}>
                <circle cx='34' cy='34' r={R} fill='none' stroke='rgba(255,255,255,0.07)' strokeWidth='6' />
                <circle
                  cx='34' cy='34' r={R} fill='none'
                  stroke={pasado ? 'var(--orange)' : 'var(--green)'} strokeWidth='6'
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - calPct / 100)}
                  strokeLinecap='round'
                  style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }}
                />
              </svg>
              <span className='nf-num' style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: pasado ? 'var(--orange)' : 'var(--green)',
              }}>{calPct}%</span>
            </div>
          </div>

          <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{
              height: '100%', borderRadius: '3px', width: '100%',
              transform: `scaleX(${calPct / 100})`, transformOrigin: 'left',
              background: pasado ? 'var(--orange)' : 'linear-gradient(90deg, var(--green-dark) 0%, var(--green) 100%)',
              transition: 'transform 900ms var(--ease-out)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span className='nf-footnote nf-num'>
              {pasado
                ? `${(totales.calorias - metas.calorias).toLocaleString('es-CO')} kcal por encima`
                : `${restante.toLocaleString('es-CO')} kcal restantes`}
            </span>
            <span className='nf-caption nf-num'>{t.goal} {metas.calorias.toLocaleString('es-CO')}</span>
          </div>
        </section>
      </div>

      <div style={{ padding: '0 16px' }}>
        {error && (
          <div className='nf-card nf-reveal' role='alert' style={{
            marginTop: '12px', padding: '12px 12px 12px 16px',
            display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: 'inset 0 0 0 0.5px rgba(248,113,113,0.3)',
          }}>
            <p className='nf-footnote' style={{ flex: 1, color: 'var(--red)' }}>
              No pudimos traer tu resumen. Revisa tu conexión.
            </p>
            <button className='nf-btn nf-btn--sm nf-btn--destructive' onClick={cargar}>
              <IconRefresh size={15} /> Reintentar
            </button>
          </div>
        )}

        {/* Macros */}
        <h2 className='nf-section-label' style={{ marginTop: '20px' }}>Macros del día</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {macros.map((m, idx) => {
            const Icon = m.icon
            return (
              <div
                key={m.label}
                className={`nf-card${entrar ? ' nf-enter' : ''}`}
                style={{ padding: '16px', animationDelay: `${120 + idx * 40}ms` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className='nf-footnote' style={{ fontWeight: 600 }}>{m.label}</span>
                  <Icon size={17} color={m.color} strokeWidth={2} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '2px' }}>
                  <span className='nf-num' style={{ fontSize: '30px', fontWeight: 700, color: m.color, letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {m.unit === 'g' ? Math.round(m.value) : Number(m.value).toFixed(1)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: m.color, opacity: 0.6 }}>{m.unit}</span>
                </div>
                <p className='nf-caption nf-num'>de {m.goal}{m.unit}</p>
                <MacroBar pct={Math.min(m.pct, 100)} color={m.color} />
              </div>
            )
          })}
        </div>

        <BruceCard resumen={resumen} entrar={entrar} onOpenChat={onOpenChat} usuario={usuario} />
      </div>
    </div>
  )
}
