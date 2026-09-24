// Plan del día: Bruce propone qué comer con lo que falta de tus metas.
// - En Comidas solo hay una tarjeta compacta con la próxima comida; el plan
//   completo vive en una hoja (tarea enfocada: abrir, hacer, cerrar).
// - Cada comida se registra, se cambia o se fotografía por separado.
// - La foto no adivina el plato: ya sabe qué es y solo estima cuánto comiste.
import { useEffect, useRef, useState } from 'react'
import {
  IconCamera, IconCheck, IconChevronDown, IconChevronRight, IconClock, IconInfoCircle,
  IconRefresh, IconSparkles, IconAlertTriangle,
} from '@tabler/icons-react'
import { cambiarComidaPlan, fotoComidaPlan, generarPlan, getPlan, registrarComidaPlan } from '../api'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'
import { fotoABase64 } from '../lib/imagen'
import Segmented from './Segmented'
import Sheet, { SheetHeader } from './Sheet'
import bruceFace from '../assets/bruce-face.webp'

const fechaLocal = (d = new Date()) => d.toLocaleDateString('en-CA')
const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fechaLocal(d) }
const MOMENTO = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena' }
const REGISTRADO = { desayuno: 'registrado', almuerzo: 'registrado', merienda: 'registrada', cena: 'registrada' }
const miles = (n) => Math.round(n).toLocaleString('es-CO')
const veces = (f) => `${f.toLocaleString('es-CO', { maximumFractionDigits: 1 })}×`

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

// Lo que Bruce vio en la foto: qué cambió y cuánto suma, antes de registrar
function RevisionFoto({ r, nombre, onConfirmar, onPlaneado, onCancelar, ocupada }) {
  if (!r.coincide) {
    return (
      <div className='nf-reveal' style={{ padding: '0 16px 14px' }}>
        <p className='nf-footnote' style={{ display: 'flex', gap: '6px', color: 'var(--orange)', marginBottom: '10px' }}>
          <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          Esto no parece “{nombre}”{r.observacion ? `: ${r.observacion.toLowerCase()}` : ''}. Regístralo con la foto normal de Comidas.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onPlaneado} disabled={ocupada} className='nf-btn nf-btn--gray' style={{ flex: 1 }}>Registrar lo planeado</button>
          <button onClick={onCancelar} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--label-2)' }}>Cancelar</button>
        </div>
      </div>
    )
  }
  const cambios = r.ingredientes.filter(i => Math.abs(i.factor - 1) >= 0.1)
  return (
    <div className='nf-reveal' style={{ padding: '0 16px 14px' }}>
      <div style={{ background: 'var(--surface-2)', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
        {r.observacion && <p className='nf-footnote' style={{ marginBottom: '8px', color: 'var(--label-2)' }}>{r.observacion}</p>}
        {cambios.length === 0 && r.extras.length === 0 ? (
          <p style={{ fontSize: '14px' }}>La porción se ve como la planeada.</p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {cambios.map(i => (
              <li key={i.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '3px 0' }}>
                <span>{i.nombre}</span>
                <span className='nf-num' style={{ fontWeight: 600, color: i.factor === 0 ? 'var(--label-3)' : i.factor > 1 ? 'var(--orange)' : 'var(--blue)' }}>
                  {i.factor === 0 ? 'no estaba' : veces(i.factor)}
                </span>
              </li>
            ))}
            {r.extras.map(e => (
              <li key={e.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '3px 0' }}>
                <span>+ {e.nombre}</span>
                <span className='nf-footnote nf-num'>{e.cantidad}</span>
              </li>
            ))}
          </ul>
        )}
        <p className='nf-num' style={{ marginTop: '8px', fontSize: '15px', fontWeight: 600 }}>
          <span style={{ color: 'var(--label-3)', textDecoration: 'line-through', fontWeight: 500 }}>{miles(r.antes.calorias)}</span>
          {' → '}{miles(r.calorias)} kcal
          <span className='nf-footnote' style={{ marginLeft: '8px' }}>{Math.round(r.proteina)} g proteína</span>
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onConfirmar} disabled={ocupada} className='nf-btn nf-btn--tinted' style={{ flex: 1, '--tint': 'var(--green)' }}>
          <IconCheck size={17} /> Registrar {miles(r.calorias)} kcal
        </button>
        <button onClick={onCancelar} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--label-2)' }}>Cancelar</button>
      </div>
    </div>
  )
}

function ComidaPlan({ c, esHoy, abierta, onAbrir, onRegistrar, onCambiar, onFoto, ocupada, trabajo, revision, onConfirmarFoto, onCancelarFoto }) {
  return (
    <div className='nf-card' style={{
      marginBottom: '10px', overflow: 'hidden',
      opacity: ocupada && !revision ? 0.55 : 1, transition: 'opacity 200ms ease',
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

      {!c.registrada && (revision ? (
        <RevisionFoto r={revision} nombre={c.nombre} ocupada={ocupada} onConfirmar={onConfirmarFoto} onPlaneado={onRegistrar} onCancelar={onCancelarFoto} />
      ) : (
        <div style={{ display: 'flex', gap: '8px', padding: '0 12px 12px' }}>
          {/* Lo de mañana aún no se come: solo se puede cambiar */}
          {esHoy ? (<>
          <button onClick={onRegistrar} disabled={ocupada} className='nf-btn nf-btn--tinted' style={{ flex: 1, '--tint': 'var(--green)' }}>
            <IconCheck size={17} /> Me lo comí
          </button>
          <button onClick={onFoto} disabled={ocupada} className='nf-btn nf-btn--gray' style={{ padding: '0 14px' }} aria-label={`Registrar ${MOMENTO[c.momento].toLowerCase()} con foto`}>
            {trabajo === 'foto' ? <img src={bruceFace} alt='' width={20} height={20} style={{ borderRadius: '50%', animation: 'nf-pulse 1.2s ease-in-out infinite' }} /> : <IconCamera size={18} />}
          </button>
          <button onClick={onCambiar} disabled={ocupada} className='nf-btn nf-btn--gray' style={{ padding: '0 14px' }} aria-label={`Otra opción para ${MOMENTO[c.momento].toLowerCase()}`}>
            <IconRefresh size={18} className={trabajo === 'cambiar' ? 'nf-spinner' : undefined} />
          </button>
          </>) : (
          <button onClick={onCambiar} disabled={ocupada} className='nf-btn nf-btn--gray' style={{ flex: 1 }}>
            <IconRefresh size={17} className={trabajo === 'cambiar' ? 'nf-spinner' : undefined} /> Otra opción
          </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tarjeta compacta en Comidas ─────────────────────────────────────────────
function TarjetaPlan({ datos, onAbrir }) {
  const plan = datos?.plan
  const proxima = plan?.comidas.find(c => !c.registrada)
  const todas = plan && plan.comidas.length > 0 && !proxima
  const conflicto = datos?.conflictos?.length > 0

  let titulo = '¿Qué como hoy?'
  let detalle = 'Bruce te arma las comidas con lo que te gusta'
  if (proxima) {
    titulo = `${MOMENTO[proxima.momento]} · ${proxima.nombre}`
    detalle = `${miles(proxima.calorias)} kcal · ${Math.round(proxima.proteina)} g proteína`
  } else if (todas) {
    titulo = 'Cumpliste el plan de hoy'
    detalle = 'Puedes dejar listo el de mañana'
  } else if (datos?.restante && datos.momentos?.length) {
    detalle = `Te faltan ${miles(datos.restante.calorias)} kcal y ${datos.restante.proteina} g de proteína`
  }

  return (
    <button
      onClick={onAbrir}
      className='nf-card nf-press-soft'
      aria-haspopup='dialog'
      style={{ width: '100%', textAlign: 'left', padding: '12px 12px 12px 14px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}
    >
      <span style={{ position: 'relative', flexShrink: 0 }}>
        <img src={bruceFace} alt='' width={40} height={40} style={{ borderRadius: '50%', display: 'block' }} />
        {todas && (
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--surface-1)' }}>
            <IconCheck size={12} color='#0a0a0a' strokeWidth={3} />
          </span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className='nf-caption' style={{ display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--green)' }}>
          Plan de Bruce
        </span>
        <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titulo}
        </span>
        <span className='nf-footnote nf-num' style={{ display: 'block', color: conflicto ? 'var(--orange)' : undefined }}>
          {conflicto ? 'Tu plan tiene algo que ya no comes' : detalle}
        </span>
      </span>
      <IconChevronRight size={20} color='var(--label-3)' aria-hidden='true' style={{ flexShrink: 0 }} />
    </button>
  )
}

export default function PlanBruce({ visible, onRegistrada }) {
  const [abierto, setAbierto]     = useState(false)
  const [dia, setDia]             = useState('hoy')
  const [planes, setPlanes]       = useState({})   // por fecha: lo que devuelve /plan/
  const [generando, setGenerando] = useState(false)
  // { indice, tipo: 'registrar' | 'cambiar' | 'foto' } de la comida que está trabajando
  const [trabajo, setTrabajo]     = useState(null)
  const [revision, setRevision]   = useState(null) // { indice, r } propuesta de la foto
  const [abiertas, setAbiertas]   = useState(new Set())
  const fotoRef = useRef(null)
  const fotoPara = useRef(null)

  const hoy = fechaLocal()
  const fecha = dia === 'hoy' ? hoy : manana()
  const datos = planes[fecha]
  const guardar = (f, d) => setPlanes(prev => ({ ...prev, [f]: d }))

  // Una notificación de comida o Bruce desde el chat pueden abrir la hoja
  useEffect(() => {
    const abrir = (e) => { setDia(e.detail?.dia ?? 'hoy'); setAbierto(true) }
    window.addEventListener('nf:abrir-plan', abrir)
    return () => window.removeEventListener('nf:abrir-plan', abrir)
  }, [])

  // La tarjeta muestra hoy; la hoja, el día elegido
  useEffect(() => {
    if (!visible) return
    let vivo = true
    getPlan(hoy).then(d => { if (vivo) setPlanes(prev => ({ ...prev, [hoy]: d })) }).catch(() => {})
    return () => { vivo = false }
  }, [visible, hoy])

  useEffect(() => {
    if (!abierto || fecha === hoy) return
    let vivo = true
    getPlan(fecha).then(d => { if (vivo) setPlanes(prev => ({ ...prev, [fecha]: d })) }).catch(() => {})
    return () => { vivo = false }
  }, [abierto, fecha, hoy])

  const armar = async () => {
    setGenerando(true)
    setAbiertas(new Set())
    setRevision(null)
    try {
      guardar(fecha, await generarPlan(fecha))
      haptic(20)
    } catch (e) {
      toast.error(e.mensaje || 'Bruce no pudo armar el plan. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  const cambiar = async (i) => {
    setTrabajo({ indice: i, tipo: 'cambiar' })
    try {
      guardar(fecha, await cambiarComidaPlan(fecha, i))
      haptic(10)
    } catch (e) {
      toast.error(e.mensaje || 'No encontré otra opción. Intenta de nuevo.')
    } finally {
      setTrabajo(null)
    }
  }

  const registrar = async (i, ajuste) => {
    setTrabajo({ indice: i, tipo: 'registrar' })
    try {
      const d = await registrarComidaPlan(fecha, i, ajuste)
      guardar(fecha, d)
      setRevision(null)
      const c = d.plan.comidas[i]
      haptic(20)
      toast.success(`${MOMENTO[c.momento]} ${REGISTRADO[c.momento]} · ${miles(ajuste?.calorias ?? c.calorias)} kcal`)
      if (fecha === hoy) onRegistrada?.()
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo registrar. Intenta de nuevo.')
    } finally {
      setTrabajo(null)
    }
  }

  const pedirFoto = (i) => {
    fotoPara.current = i
    fotoRef.current?.click()
  }

  const analizarFoto = async (file) => {
    const i = fotoPara.current
    if (fotoRef.current) fotoRef.current.value = ''
    if (!file || i == null) return
    setTrabajo({ indice: i, tipo: 'foto' })
    try {
      const imagen = await fotoABase64(file, 1280)
      const r = await fotoComidaPlan(fecha, i, imagen)
      setRevision({ indice: i, r })
      haptic(10)
    } catch (e) {
      toast.error(e.mensaje || 'Bruce no pudo ver la foto. Intenta con otra.')
    } finally {
      setTrabajo(null)
    }
  }

  const confirmarFoto = () => {
    const { indice, r } = revision
    const cambios = r.ingredientes.filter(x => Math.abs(x.factor - 1) >= 0.1).map(x => `${x.nombre.toLowerCase()} ${x.factor === 0 ? 'no' : veces(x.factor)}`)
    registrar(indice, {
      calorias: r.calorias, proteina: r.proteina, carbos: r.carbos, grasas: r.grasas,
      nota: cambios.length ? `según la foto: ${cambios.join(', ')}` : 'porción según la foto',
    })
  }

  const alternar = (i) => setAbiertas(prev => {
    const n = new Set(prev)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })

  const plan = datos?.plan
  const sinTiempo = dia === 'hoy' && datos && datos.momentos.length === 0
  const cubre = plan ? plan.comidas.reduce((t, c) => ({ cal: t.cal + c.calorias, p: t.p + c.proteina }), { cal: 0, p: 0 }) : null

  return (
    <>
      <TarjetaPlan datos={planes[hoy]} onAbrir={() => setAbierto(true)} />

      <input ref={fotoRef} type='file' accept='image/*' capture='environment' hidden onChange={e => analizarFoto(e.target.files?.[0])} />

      <Sheet
        open={abierto}
        onClose={() => setAbierto(false)}
        large
        label='Plan de Bruce'
        header={
          <>
            <SheetHeader
              title='Plan de Bruce'
              right={<button className='nf-btn nf-btn--plain' onClick={() => setAbierto(false)}>Listo</button>}
            />
            <div style={{ padding: '0 16px 12px' }}>
              <Segmented
                options={[{ id: 'hoy', label: 'Hoy' }, { id: 'manana', label: 'Mañana' }]}
                value={dia}
                onChange={(v) => { if (!generando) { setDia(v); setAbiertas(new Set()); setRevision(null) } }}
                label='Día del plan'
              />
            </div>
          </>
        }
      >
        <div style={{ padding: '4px 16px calc(var(--safe-bottom) + 32px)' }}>
          {generando ? <Cargando /> : plan && plan.comidas.length > 0 ? (
            <>
              {datos.conflictos?.length > 0 && (
                <div className='nf-card' style={{ padding: '12px 14px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', background: 'color-mix(in srgb, var(--orange) 10%, var(--surface-1))' }}>
                  <IconAlertTriangle size={18} color='var(--orange)' style={{ flexShrink: 0 }} />
                  <p className='nf-footnote' style={{ flex: 1, color: 'var(--label)' }}>
                    {datos.conflictos.join(', ')} ya no cuadra con tus preferencias.
                  </p>
                  <button onClick={armar} className='nf-btn nf-btn--sm nf-btn--tinted' style={{ '--tint': 'var(--orange)', flexShrink: 0 }}>Rehacer</button>
                </div>
              )}
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
                  esHoy={dia === 'hoy'}
                  abierta={abiertas.has(i)}
                  onAbrir={() => alternar(i)}
                  onRegistrar={() => registrar(i)}
                  onCambiar={() => cambiar(i)}
                  onFoto={() => pedirFoto(i)}
                  ocupada={trabajo?.indice === i}
                  trabajo={trabajo?.indice === i ? trabajo.tipo : null}
                  revision={revision?.indice === i ? revision.r : null}
                  onConfirmarFoto={confirmarFoto}
                  onCancelarFoto={() => setRevision(null)}
                />
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0 4px' }}>
                <p className='nf-caption nf-num'>El plan suma {miles(cubre.cal)} kcal y {Math.round(cubre.p)} g de proteína</p>
                <button onClick={armar} className='nf-btn nf-btn--plain nf-btn--sm' style={{ '--tint': 'var(--label-2)', flexShrink: 0 }}>
                  <IconRefresh size={15} /> Rehacer
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 12px' }}>
              <img src={bruceFace} alt='' width={64} height={64} style={{ borderRadius: '50%', margin: '0 auto 12px', display: 'block' }} />
              {sinTiempo ? (
                <>
                  <p className='nf-headline'>Por hoy ya estamos</p>
                  <p className='nf-footnote' style={{ margin: '4px 0 16px' }}>Deja listo lo de mañana y no improvises.</p>
                  <button onClick={() => setDia('manana')} className='nf-btn nf-btn--tinted'>Planear mañana</button>
                </>
              ) : (
                <>
                  <p className='nf-headline'>¿Qué como {dia === 'hoy' ? 'hoy' : 'mañana'}?</p>
                  <p className='nf-footnote' style={{ margin: '4px 0 16px' }}>
                    {dia === 'hoy' && datos?.restante
                      ? `Te faltan ${miles(datos.restante.calorias)} kcal y ${datos.restante.proteina} g de proteína. Te armo las comidas con lo que te gusta.`
                      : 'Te armo el día completo con lo que te gusta y respetando tus restricciones.'}
                  </p>
                  <button onClick={armar} className='nf-btn nf-btn--primary'>
                    <IconSparkles size={17} /> Armar mi plan
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </>
  )
}
