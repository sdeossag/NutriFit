// Plan del día: Bruce propone qué comer con lo que falta de tus metas.
// - Respuesta inmediata: al pedirlo aparece el esqueleto con lo que Bruce está haciendo.
// - Cada comida se registra o se cambia por separado, sin bloquear las demás.
// - Ingredientes y pasos se despliegan al tocar la comida (progresión, no todo de golpe).
import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconClock, IconInfoCircle, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { cambiarComidaPlan, generarPlan, getPlan, registrarComidaPlan } from '../api'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'
import Segmented from './Segmented'
import bruceFace from '../assets/bruce-face.webp'

const fechaLocal = (d = new Date()) => d.toLocaleDateString('en-CA')
const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fechaLocal(d) }
const MOMENTO = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena' }
const REGISTRADO = { desayuno: 'registrado', almuerzo: 'registrado', merienda: 'registrada', cena: 'registrada' }
const miles = (n) => Math.round(n).toLocaleString('es-CO')

// Lo que de verdad hace el servidor, en orden: se muestra mientras espera
const PASOS = ['Revisando lo que te falta hoy…', 'Buscando entre lo que te gusta…', 'Cuadrando la proteína…', 'Revisando tus restricciones…']

function Cargando() {
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPaso(p => Math.min(p + 1, PASOS.length - 1)), 2600)
    return () => clearInterval(id)
  }, [])
  return (
    <div aria-busy='true' aria-live='polite'>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 4px 12px' }}>
        <img src={bruceFace} alt='' width={30} height={30} style={{ borderRadius: '50%', animation: 'nf-pulse 1.4s ease-in-out infinite' }} />
        <p key={paso} className='nf-footnote nf-fade'>{PASOS[paso]}</p>
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className='nf-card' style={{ padding: '14px 16px', marginBottom: '10px' }}>
          <div className='nf-skeleton' style={{ width: '28%', height: 11, marginBottom: 10 }} />
          <div className='nf-skeleton' style={{ width: '70%', height: 16, marginBottom: 10 }} />
          <div className='nf-skeleton' style={{ width: '50%', height: 12 }} />
        </div>
      ))}
    </div>
  )
}

function Macro({ v, u, color }) {
  return (
    <span className='nf-num' style={{ fontSize: '13px', fontWeight: 600, color }}>
      {v}<span style={{ fontWeight: 500, color: 'var(--label-3)', marginLeft: '2px' }}>{u}</span>
    </span>
  )
}

function ComidaPlan({ c, abierta, onAbrir, onRegistrar, onCambiar, ocupada }) {
  return (
    <div className='nf-card' style={{
      marginBottom: '10px', overflow: 'hidden',
      opacity: ocupada ? 0.55 : 1, transition: 'opacity 200ms ease',
    }}>
      <button
        onClick={onAbrir}
        aria-expanded={abierta}
        className='nf-press-soft'
        style={{ width: '100%', textAlign: 'left', padding: '14px 12px 12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className='nf-caption' style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {MOMENTO[c.momento]}
            {c.minutos ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}><IconClock size={12} /> {c.minutos} min</span> : null}
          </span>
          <span style={{
            display: 'block', fontSize: '16px', fontWeight: 600, margin: '3px 0 6px', letterSpacing: '-0.01em',
            color: c.registrada ? 'var(--label-3)' : 'var(--label)',
          }}>
            {c.nombre}
          </span>
          <span style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Macro v={miles(c.calorias)} u='kcal' color='var(--label)' />
            <Macro v={Math.round(c.proteina)} u='g P' color='var(--green)' />
            <Macro v={Math.round(c.carbos)} u='g C' color='var(--blue)' />
            <Macro v={Math.round(c.grasas)} u='g G' color='var(--orange)' />
          </span>
        </span>
        {c.registrada
          ? <span className='nf-badge' style={{ '--tint': 'var(--green)', flexShrink: 0 }}><IconCheck size={12} strokeWidth={3} /> Registrada</span>
          : <IconChevronDown size={20} color='var(--label-3)' aria-hidden='true' style={{ flexShrink: 0, marginTop: '14px', transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />}
      </button>

      <div className='nf-collapse' data-open={abierta}>
        <div>
          <div style={{ padding: '0 16px 12px' }}>
            {c.porcion && <p className='nf-footnote' style={{ marginBottom: '10px' }}>{c.porcion}</p>}
            <ul style={{ listStyle: 'none', marginBottom: c.preparacion?.length ? '12px' : 0 }}>
              {c.ingredientes.map((i, n) => (
                <li key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '5px 0', boxShadow: n ? 'inset 0 0.5px 0 var(--separator)' : 'none' }}>
                  <span style={{ fontSize: '14px' }}>{i.nombre}</span>
                  <span className='nf-footnote nf-num' style={{ flexShrink: 0 }}>{i.cantidad}</span>
                </li>
              ))}
            </ul>
            {c.preparacion?.length > 0 && (
              <ol style={{ paddingLeft: '18px' }}>
                {c.preparacion.map((p, n) => <li key={n} className='nf-footnote' style={{ marginBottom: '4px', color: 'var(--label-2)' }}>{p}</li>)}
              </ol>
            )}
          </div>
        </div>
      </div>

      {!c.registrada && (
        <div style={{ display: 'flex', gap: '8px', padding: '0 12px 12px' }}>
          <button onClick={onRegistrar} disabled={ocupada} className='nf-btn nf-btn--tinted' style={{ flex: 1, '--tint': 'var(--green)' }}>
            <IconCheck size={17} /> Me lo comí
          </button>
          <button onClick={onCambiar} disabled={ocupada} className='nf-btn nf-btn--gray' aria-label={`Otra opción para ${MOMENTO[c.momento].toLowerCase()}`}>
            <IconRefresh size={17} className={ocupada ? 'nf-spinner' : undefined} /> Otra
          </button>
        </div>
      )}
    </div>
  )
}

export default function PlanBruce({ visible, onRegistrada }) {
  const [dia, setDia]           = useState('hoy')
  const [datos, setDatos]       = useState(null)
  const [generando, setGenerando] = useState(false)
  const [ocupada, setOcupada]   = useState(null)   // índice de la comida que se está cambiando o registrando
  const [abiertas, setAbiertas] = useState(new Set())
  const pedido = useRef(0)
  const fecha = dia === 'hoy' ? fechaLocal() : manana()

  useEffect(() => {
    if (!visible) return
    const id = ++pedido.current
    getPlan(fecha)
      .then(d => { if (id === pedido.current) setDatos(d) })
      .catch(() => { if (id === pedido.current) setDatos(null) })
  }, [visible, fecha])

  const armar = async () => {
    setGenerando(true)
    setAbiertas(new Set())
    try {
      const d = await generarPlan(fecha)
      setDatos(d)
      haptic(20)
    } catch (e) {
      toast.error(e.mensaje || 'Bruce no pudo armar el plan. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  const cambiar = async (i) => {
    setOcupada(i)
    try {
      setDatos(await cambiarComidaPlan(fecha, i))
      haptic(10)
    } catch (e) {
      toast.error(e.mensaje || 'No encontré otra opción. Intenta de nuevo.')
    } finally {
      setOcupada(null)
    }
  }

  const registrar = async (i) => {
    setOcupada(i)
    try {
      const d = await registrarComidaPlan(fecha, i)
      setDatos(d)
      const c = d.plan.comidas[i]
      haptic(20)
      toast.success(`${MOMENTO[c.momento]} ${REGISTRADO[c.momento]} · ${miles(c.calorias)} kcal`)
      if (dia === 'hoy') onRegistrada?.()
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo registrar. Intenta de nuevo.')
    } finally {
      setOcupada(null)
    }
  }

  const alternar = (i) => setAbiertas(prev => {
    const n = new Set(prev)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })

  const plan     = datos?.plan
  const restante = datos?.restante
  const sinTiempo = dia === 'hoy' && datos && datos.momentos.length === 0
  const cubre = plan ? plan.comidas.reduce((t, c) => ({ cal: t.cal + c.calorias, p: t.p + c.proteina }), { cal: 0, p: 0 }) : null

  return (
    <section style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '0 4px 10px' }}>
        <h2 className='nf-title-3'>Plan de Bruce</h2>
        <div style={{ width: '150px' }}>
          <Segmented
            options={[{ id: 'hoy', label: 'Hoy' }, { id: 'manana', label: 'Mañana' }]}
            value={dia}
            onChange={(v) => { if (!generando) { setDia(v); setDatos(null); setAbiertas(new Set()) } }}
            label='Día del plan'
          />
        </div>
      </div>

      {generando ? <Cargando /> : plan && plan.comidas.length > 0 ? (
        <>
          {plan.consejo && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '0 4px 12px' }}>
              <img src={bruceFace} alt='' width={30} height={30} style={{ borderRadius: '50%', flexShrink: 0 }} />
              <p className='nf-footnote' style={{ color: 'var(--label-2)', fontStyle: 'italic' }}>“{plan.consejo}”</p>
            </div>
          )}
          {datos.no_alcanza && (
            <p className='nf-caption' style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '0 4px 12px' }}>
              <IconInfoCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              Hoy ya no alcanzas toda la meta con las comidas que quedan. No la compenses de golpe: mañana arrancas completo.
            </p>
          )}
          {plan.comidas.map((c, i) => (
            <ComidaPlan
              key={`${c.momento}-${c.nombre}`}
              c={c}
              abierta={abiertas.has(i)}
              onAbrir={() => alternar(i)}
              onRegistrar={() => registrar(i)}
              onCambiar={() => cambiar(i)}
              ocupada={ocupada === i}
            />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 4px' }}>
            <p className='nf-caption nf-num'>
              El plan suma {miles(cubre.cal)} kcal y {Math.round(cubre.p)} g de proteína
            </p>
            <button onClick={armar} className='nf-btn nf-btn--plain nf-btn--sm' style={{ '--tint': 'var(--label-2)', flexShrink: 0 }}>
              <IconRefresh size={15} /> Rehacer
            </button>
          </div>
        </>
      ) : (
        <div className='nf-card' style={{ padding: '18px 16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <img src={bruceFace} alt='' width={48} height={48} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {sinTiempo ? (
              <>
                <p className='nf-headline'>Por hoy ya estamos</p>
                <p className='nf-footnote' style={{ marginBottom: '10px' }}>Deja listo lo de mañana y no improvises.</p>
                <button onClick={() => { setDia('manana'); setDatos(null) }} className='nf-btn nf-btn--tinted nf-btn--sm'>Planear mañana</button>
              </>
            ) : (
              <>
                <p className='nf-headline'>¿Qué como {dia === 'hoy' ? 'hoy' : 'mañana'}?</p>
                <p className='nf-footnote' style={{ marginBottom: '10px' }}>
                  {dia === 'hoy' && restante
                    ? `Te faltan ${miles(restante.calorias)} kcal y ${restante.proteina} g de proteína. Te armo las comidas con lo que te gusta.`
                    : 'Te armo el día completo con lo que te gusta y respetando tus restricciones.'}
                </p>
                <button onClick={armar} className='nf-btn nf-btn--primary nf-btn--sm'>
                  <IconSparkles size={16} /> Armar mi plan
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
