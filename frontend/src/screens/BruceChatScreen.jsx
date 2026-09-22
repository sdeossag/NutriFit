import { useState, useEffect, useRef } from 'react'
import { IconArrowUp, IconChevronLeft, IconTrash, IconEdit, IconChevronRight } from '@tabler/icons-react'
import {
  getSesionesChatBruce, crearSesionChat, getSesionChat,
  eliminarSesionChat, enviarMensajeBruce,
} from '../api'
import { toast } from '../lib/toast'
import bruceFace        from '../assets/bruce-face.webp'
import bruceTuxedo      from '../assets/bruce-tuxedo.webp'
import bruceMuyfeliz    from '../assets/bruce-tuxedo-muyfeliz.webp'
import brucePensando    from '../assets/bruce-tuxedo-pensando.webp'
import bruceDeterminado from '../assets/bruce-tuxedo-determinado.webp'
import bruceBatman      from '../assets/bruce-batman.webp'

const esDiaDescanso = () => { const d = new Date().getDay(); return d === 0 || d === 6 }
const esDeNoche = () => { const h = new Date().getHours(); return h >= 20 || h < 6 }

// Pose según la última respuesta de Bruce
const getPose = (texto) => {
  if (!texto) return 'normal'
  const t = texto.toLowerCase()
  if (t.includes('bien') || t.includes('excelente') || t.includes('perfecto') || t.includes('genial')) return 'muyfeliz'
  if (t.includes('vamos') || t.includes('arriba') || t.includes('dale') || t.includes('mueve')) return 'determinado'
  if (t.includes('hmm') || t.includes('depende') || t.includes('interesante') || t.includes('veamos')) return 'pensando'
  return 'normal'
}

const POSES = {
  normal:      bruceTuxedo,
  muyfeliz:    bruceMuyfeliz,
  pensando:    brucePensando,
  determinado: bruceDeterminado,
  batman:      bruceBatman,
}

const BURBUJA_BRUCE = '#26262a'

function Avatar({ size = 28 }) {
  return (
    <img
      src={bruceFace} alt='' width={size} height={size}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
        background: 'linear-gradient(135deg, #064e3b, #16a34a)',
      }}
    />
  )
}

// ── Burbuja ───────────────────────────────────────────────────────────────
function Mensaje({ msg, agrupado, animar }) {
  const esBruce = msg.rol === 'bruce'
  return (
    <div
      className={animar ? 'nf-reveal' : undefined}
      onAnimationEnd={e => e.currentTarget.classList.remove('nf-reveal')}
      style={{
        display: 'flex',
        flexDirection: esBruce ? 'row' : 'row-reverse',
        alignItems: 'flex-end',
        gap: '8px',
        marginTop: agrupado ? '3px' : '12px',
        paddingLeft: esBruce ? 0 : '52px',
        paddingRight: esBruce ? '52px' : 0,
      }}
    >
      {esBruce && (agrupado ? <span style={{ width: 28, flexShrink: 0 }} /> : <Avatar />)}
      <div style={{
        background: esBruce ? BURBUJA_BRUCE : 'var(--green)',
        color: esBruce ? 'var(--label)' : '#04210f',
        borderRadius: '20px',
        borderBottomLeftRadius: esBruce ? '6px' : '20px',
        borderBottomRightRadius: esBruce ? '20px' : '6px',
        padding: '9px 14px',
        maxWidth: '100%',
        userSelect: 'text',
      }}>
        <p style={{ fontSize: '16px', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {msg.contenido}
        </p>
        <p className='nf-num' style={{
          fontSize: '11px', marginTop: '3px',
          color: esBruce ? 'var(--label-3)' : 'rgba(4,33,15,0.55)',
          textAlign: esBruce ? 'left' : 'right',
        }}>
          {new Date(msg.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function Escribiendo() {
  return (
    <div className='nf-reveal' onAnimationEnd={e => e.currentTarget.classList.remove('nf-reveal')} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '12px' }} aria-label='Bruce está escribiendo'>
      <Avatar />
      <div style={{
        background: BURBUJA_BRUCE, borderRadius: '20px', borderBottomLeftRadius: '6px',
        padding: '14px 16px', display: 'flex', gap: '5px', alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => <span key={i} className='nf-dot' style={{ background: 'var(--label-2)', animationDelay: `${i * 0.18}s` }} />)}
      </div>
    </div>
  )
}

// ── Lista de conversaciones ───────────────────────────────────────────────
function ListaSesiones({ sesiones, onSeleccionar, onNueva, onEliminar, cargando, creando }) {
  const esNoche = esDeNoche()

  return (
    <div style={{ height: '100%', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <header style={{
        padding: 'calc(var(--safe-top) + 20px) 20px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <Avatar size={44} />
          <div style={{ minWidth: 0 }}>
            <h1 className='nf-large-title'>Bruce</h1>
            <p className='nf-footnote'>{esNoche ? 'Modo noche activado 🦇' : 'Tu coach personal'}</p>
          </div>
        </div>
        <button onClick={onNueva} disabled={creando} className='nf-btn nf-btn--primary' aria-label='Nueva conversación'>
          <IconEdit size={18} strokeWidth={2} /> Nueva
        </button>
      </header>

      <div style={{ padding: '16px 16px calc(var(--tabbar-h) + var(--tabbar-gap) + 24px)' }}>
        {cargando && (
          <div className='nf-card' style={{ overflow: 'hidden' }} aria-busy='true'>
            {[0, 1, 2].map(i => (
              <div key={i} className='nf-row' style={{ '--row-inset': '64px' }}>
                <div className='nf-skeleton' style={{ width: 36, height: 36, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className='nf-skeleton' style={{ width: '60%', height: 14, marginBottom: 6 }} />
                  <div className='nf-skeleton' style={{ width: '30%', height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!cargando && sesiones.length === 0 && (
          <div className='nf-enter' style={{ textAlign: 'center', padding: '40px 20px' }}>
            <img
              src={esNoche ? bruceBatman : bruceTuxedo} alt='' className='nf-float'
              style={{ width: '150px', margin: '0 auto 16px', filter: 'drop-shadow(0 8px 20px rgba(74,222,128,0.2))' }}
            />
            <p className='nf-title-3' style={{ marginBottom: '6px' }}>Sin conversaciones aún</p>
            <p className='nf-subhead' style={{ marginBottom: '20px' }}>
              Pregúntale a Bruce por calorías, comidas o tu rutina.
            </p>
            <button onClick={onNueva} disabled={creando} className='nf-btn nf-btn--tinted'>Empezar a hablar</button>
          </div>
        )}

        {!cargando && sesiones.length > 0 && (
          <div className='nf-card' style={{ overflow: 'hidden' }}>
            {sesiones.map(s => (
              <div key={s.id} className='nf-row' style={{ '--row-inset': '64px', padding: 0 }}>
                <button
                  onClick={() => onSeleccionar(s)}
                  className='nf-press-soft'
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0 10px 16px', textAlign: 'left', minHeight: '64px' }}
                >
                  <Avatar size={36} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '16px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.titulo || 'Nueva conversación'}
                    </span>
                    <span className='nf-caption' style={{ display: 'block' }}>
                      {new Date(s.creado_en).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <IconChevronRight size={18} color='var(--label-4)' />
                </button>
                <button
                  onClick={() => onEliminar(s)}
                  className='nf-icon-btn'
                  aria-label={`Eliminar conversación ${s.titulo || ''}`}
                  style={{ color: 'var(--label-3)' }}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Conversación ──────────────────────────────────────────────────────────
function Conversacion({ sesionId, onVolver, tecladoAbierto }) {
  const [mensajes,  setMensajes]  = useState([])
  const [input,     setInput]     = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [cargando,  setCargando]  = useState(true)
  const [pose,      setPose]      = useState('normal')
  const listaRef   = useRef(null)
  const inputRef   = useRef(null)
  const primerScroll = useRef(true)

  const esNoche = esDeNoche()
  const imagenBruce = esNoche ? POSES.batman : POSES[pose]

  useEffect(() => {
    setCargando(true)
    primerScroll.current = true
    getSesionChat(sesionId)
      .then(data => setMensajes(data.mensajes ?? []))
      .catch(() => toast.error('No se pudo abrir la conversación'))
      .finally(() => setCargando(false))
  }, [sesionId])

  // Al abrir: saltar al final sin animación. Mensajes nuevos: desplazamiento suave.
  useEffect(() => {
    const el = listaRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: primerScroll.current ? 'auto' : 'smooth' })
    if (!cargando) primerScroll.current = false
  }, [mensajes, enviando, cargando])

  const ajustarAltura = (el) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 132) + 'px'
  }

  const enviar = async () => {
    if (!input.trim() || enviando) return
    const texto = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setEnviando(true)

    // Mensaje optimista
    // _nuevo: solo los mensajes de esta sesión entran con animación
    const msgTemp = { id: `tmp-${Date.now()}`, rol: 'user', contenido: texto, creado_en: new Date().toISOString(), _nuevo: true }
    setMensajes(prev => [...prev, msgTemp])

    try {
      const data = await enviarMensajeBruce(sesionId, texto)
      setMensajes(prev => [
        ...prev.filter(m => m.id !== msgTemp.id),
        { ...data.mensaje_usuario, _key: msgTemp.id, _nuevo: true },   // misma key: la burbuja no se vuelve a animar
        { ...data.mensaje_bruce, _nuevo: true },
      ])
      setPose(getPose(data.mensaje_bruce.contenido))
    } catch {
      setMensajes(prev => prev.filter(m => m.id !== msgTemp.id))
      setInput(texto)   // no perder lo que el usuario escribió
      toast.error('No se pudo enviar. Intenta de nuevo.')
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  const puedeEnviar = input.trim() && !enviando

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Barra superior translúcida: los mensajes pasan por debajo */}
      <header className='nf-glass' style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
        padding: 'calc(var(--safe-top) + 6px) 8px 8px',
        display: 'flex', alignItems: 'center', gap: '6px',
        borderRadius: 0, boxShadow: 'inset 0 -0.5px 0 var(--separator)',
      }}>
        <button onClick={onVolver} className='nf-btn nf-btn--plain' style={{ padding: '0 6px 0 0', gap: '2px' }} aria-label='Volver a las conversaciones'>
          <IconChevronLeft size={26} strokeWidth={2.2} /> Chats
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginRight: '64px' }}>
          <Avatar size={30} />
          <div>
            <p className='nf-headline' style={{ lineHeight: 1.1 }}>Bruce</p>
            <p className='nf-caption'>
              {enviando ? 'escribiendo…' : esNoche ? 'Modo noche' : esDiaDescanso() ? 'Día de descanso' : 'Tu coach'}
            </p>
          </div>
        </div>
      </header>

      {/* Mensajes */}
      <div
        ref={listaRef}
        style={{
          flex: 1, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: 'calc(var(--safe-top) + 72px) 12px 12px',
        }}
      >
        {cargando && <Escribiendo />}

        {!cargando && mensajes.length === 0 && (
          <div className='nf-enter' style={{ textAlign: 'center', padding: '24px 12px 8px' }}>
            <img
              src={imagenBruce} alt='' className='nf-float'
              style={{ width: esNoche ? '180px' : '130px', margin: '0 auto 12px', filter: 'drop-shadow(0 8px 24px rgba(74,222,128,0.22))' }}
            />
            <div style={{
              display: 'inline-block', textAlign: 'left',
              background: BURBUJA_BRUCE, borderRadius: '20px', padding: '12px 16px', maxWidth: '300px',
            }}>
              <p style={{ fontSize: '16px', lineHeight: 1.45 }}>
                Qué más parcero, soy Bruce. Pregúntame lo que quieras: nutrición, gym, calorías de algún alimento, o cómo vas hoy.
              </p>
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <Mensaje key={m._key ?? m.id} msg={m} agrupado={i > 0 && mensajes[i - 1].rol === m.rol} animar={!!m._nuevo} />
        ))}
        {enviando && <Escribiendo />}
      </div>

      {/* Entrada */}
      <div style={{
        padding: `8px 12px ${tecladoAbierto ? '8px' : 'calc(var(--tabbar-h) + var(--tabbar-gap) + 10px)'}`,
        boxShadow: 'inset 0 0.5px 0 var(--separator)',
        background: 'var(--bg)',
        flexShrink: 0,
        transition: 'padding-bottom 280ms var(--ease-out)',
      }}>
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end',
          background: 'var(--surface-2)', borderRadius: '22px',
          boxShadow: 'inset 0 0 0 0.5px var(--separator)',
          padding: '4px 4px 4px 16px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); ajustarAltura(e.target) }}
            onKeyDown={e => {
              // En teclado físico Enter envía; Shift+Enter hace salto de línea
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() }
            }}
            placeholder='Pregúntale algo a Bruce…'
            aria-label='Mensaje para Bruce'
            enterKeyHint='send'
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', lineHeight: 1.4, padding: '8px 0',
              maxHeight: '132px', overflowY: 'auto',
            }}
          />
          <button
            onClick={enviar}
            disabled={!puedeEnviar}
            aria-label='Enviar mensaje'
            style={{
              width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
              background: puedeEnviar ? 'var(--green)' : 'rgba(255,255,255,0.1)',
              color: puedeEnviar ? '#000' : 'var(--label-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconArrowUp size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BruceChatScreen ───────────────────────────────────────────────────────
export default function BruceChatScreen({ screen, tecladoAbierto }) {
  const [sesiones,     setSesiones]     = useState([])
  const [sesionActiva, setSesionActiva] = useState(null)
  const [cargando,     setCargando]     = useState(true)
  const [creando,      setCreando]      = useState(false)
  const pendientes = useRef(new Map())

  useEffect(() => {
    if (screen !== 'chat') return
    getSesionesChatBruce()
      .then(data => setSesiones(data.filter(s => !pendientes.current.has(s.id))))
      .catch(() => toast.error('No se pudieron cargar las conversaciones'))
      .finally(() => setCargando(false))
  }, [screen])

  // Si la app se cierra con un borrado pendiente, ejecútalo
  useEffect(() => () => {
    pendientes.current.forEach((timer, id) => { clearTimeout(timer); eliminarSesionChat(id).catch(() => {}) })
  }, [])

  const handleNueva = async () => {
    setCreando(true)
    try {
      const nueva = await crearSesionChat()
      setSesiones(prev => [nueva, ...prev])
      setSesionActiva(nueva.id)
    } catch {
      toast.error('No se pudo crear la conversación')
    } finally {
      setCreando(false)
    }
  }

  // Borrado con "Deshacer": se quita de la lista ya, y se borra en el servidor
  // solo si no se deshace en unos segundos.
  const handleEliminar = (sesion) => {
    const indice = sesiones.findIndex(s => s.id === sesion.id)
    setSesiones(prev => prev.filter(s => s.id !== sesion.id))
    if (sesionActiva === sesion.id) setSesionActiva(null)
    const timer = setTimeout(() => {
      pendientes.current.delete(sesion.id)
      eliminarSesionChat(sesion.id).catch(() => {
        toast.error('No se pudo eliminar la conversación')
        setSesiones(prev => [sesion, ...prev])
      })
    }, 6000)
    pendientes.current.set(sesion.id, timer)
    toast('Conversación eliminada', {
      action: {
        label: 'Deshacer',
        onClick: () => {
          clearTimeout(pendientes.current.get(sesion.id))
          pendientes.current.delete(sesion.id)
          setSesiones(prev => {
            const copia = [...prev]
            copia.splice(Math.min(indice, copia.length), 0, sesion)
            return copia
          })
        },
      },
    })
  }

  if (sesionActiva) {
    return (
      <Conversacion
        key={sesionActiva}
        sesionId={sesionActiva}
        onVolver={() => setSesionActiva(null)}
        tecladoAbierto={tecladoAbierto}
      />
    )
  }

  return (
    <ListaSesiones
      sesiones={sesiones}
      cargando={cargando}
      creando={creando}
      onSeleccionar={s => setSesionActiva(s.id)}
      onNueva={handleNueva}
      onEliminar={handleEliminar}
    />
  )
}
