import { useState, useEffect, useRef } from 'react'
import { IconArrowUp, IconPlus, IconChevronLeft, IconTrash } from '@tabler/icons-react'
import {
  getSesionesChatBruce, crearSesionChat, getSesionChat,
  eliminarSesionChat, enviarMensajeBruce,
} from '../api'
import bruceFace       from '../assets/bruce-face.png'
import bruceTuxedo     from '../assets/bruce-tuxedo.png'
import bruceMuyfeliz   from '../assets/bruce-tuxedo-muyfeliz.png'
import brucePensando   from '../assets/bruce-tuxedo-pensando.png'
import bruceDeterminado from '../assets/bruce-tuxedo-determinado.png'
import bruceBatman     from '../assets/bruce-batman.png'

const esDiaDescanso = () => { const d = new Date().getDay(); return d === 0 || d === 6 }

// Pose según última respuesta de Bruce
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

// ── Avatar pequeño ────────────────────────────────────────────────────────
function BruceAvatarSmall() {
  return (
    <div style={{
      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #064e3b, #16a34a)',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(74,222,128,0.3)',
    }}>
      <img src={bruceFace} alt='Bruce' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

// ── Bubble mensaje ────────────────────────────────────────────────────────
function Mensaje({ msg }) {
  const esBruce = msg.rol === 'bruce'
  return (
    <div style={{
      display: 'flex',
      flexDirection: esBruce ? 'row' : 'row-reverse',
      alignItems: 'flex-end',
      gap: '8px',
      marginBottom: '12px',
      paddingLeft: esBruce ? '0' : '48px',
      paddingRight: esBruce ? '48px' : '0',
    }}>
      {esBruce && <BruceAvatarSmall />}
      <div style={{
        background: esBruce ? 'linear-gradient(135deg, #0d2418, #112d1e)' : '#fff',
        border: esBruce ? '0.5px solid rgba(74,222,128,0.2)' : 'none',
        borderRadius: esBruce ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
        padding: '10px 14px',
        maxWidth: '100%',
      }}>
        <p style={{
          fontSize: '14px',
          color: esBruce ? 'rgba(255,255,255,0.85)' : '#000',
          lineHeight: '1.55',
          margin: 0,
          fontStyle: esBruce ? 'italic' : 'normal',
        }}>
          {msg.contenido}
        </p>
        <p style={{
          fontSize: '10px',
          color: esBruce ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
          marginTop: '4px',
          marginBottom: 0,
          textAlign: esBruce ? 'left' : 'right',
        }}>
          {new Date(msg.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────
function BruceTyping() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '12px', paddingRight: '48px' }}>
      <BruceAvatarSmall />
      <div style={{
        background: 'linear-gradient(135deg, #0d2418, #112d1e)',
        border: '0.5px solid rgba(74,222,128,0.2)',
        borderRadius: '4px 16px 16px 16px',
        padding: '12px 16px',
        display: 'flex', gap: '5px', alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#4ade80', opacity: 0.6,
            animation: `bruceDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Lista de sesiones ─────────────────────────────────────────────────────
function ListaSesiones({ sesiones, onSeleccionar, onNueva, onEliminar, cargando }) {
  const hora = new Date().getHours()
  const esNoche = hora >= 20 || hora < 6

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '60px 20px 20px',
        background: 'linear-gradient(180deg, #0c1a10 0%, #0a0a0a 100%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #064e3b, #16a34a)',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(74,222,128,0.3)',
            }}>
              <img src={bruceFace} alt='Bruce' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px', margin: 0 }}>Chat con Bruce</h2>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                {esNoche ? 'Modo noche activado 🦇' : 'Tu coach personal'}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={onNueva}
          style={{
            background: '#4ade80', border: 'none', borderRadius: '12px',
            padding: '10px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <IconPlus size={16} color='#000' strokeWidth={2.5} />
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#000' }}>Nueva</span>
        </button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {cargando && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px', animation: 'brucePulse 1.5s ease-in-out infinite' }}>🐾</div>
          </div>
        )}

        {!cargando && sesiones.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <img src={esNoche ? bruceBatman : bruceTuxedo} alt='Bruce' style={{ width: '120px', marginBottom: '16px', filter: 'drop-shadow(0 4px 16px rgba(74,222,128,0.2))' }} />
            <p style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Sin conversaciones aún</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', lineHeight: 1.6 }}>
              Toca "Nueva" para hablar con Bruce
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sesiones.map(s => (
            <div key={s.id} style={{
              background: '#131313', borderRadius: '16px',
              border: '0.5px solid rgba(255,255,255,0.06)',
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: '12px',
              cursor: 'pointer',
            }}
              onClick={() => onSeleccionar(s)}
            >
              <BruceAvatarSmall />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.titulo || 'Nueva conversación'}
                </p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                  {new Date(s.creado_en).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onEliminar(s.id) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: '4px' }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Conversación ──────────────────────────────────────────────────────────
function Conversacion({ sesionId, onVolver }) {
  const [mensajes,  setMensajes]  = useState([])
  const [input,     setInput]     = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [cargando,  setCargando]  = useState(true)
  const [pose,      setPose]      = useState('normal')
  const [clicked,   setClicked]   = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const hora     = new Date().getHours()
  const esNoche  = hora >= 20 || hora < 6
  const imagenBruce = esNoche ? POSES.batman : POSES[pose]

  useEffect(() => {
    setCargando(true)
    getSesionChat(sesionId)
      .then(data => setMensajes(data.mensajes ?? []))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [sesionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, enviando])

  const enviar = async () => {
    if (!input.trim() || enviando) return
    const texto = input.trim()
    setInput('')
    setEnviando(true)

    // Mensaje optimista
    const msgTemp = { id: Date.now(), rol: 'user', contenido: texto, creado_en: new Date().toISOString() }
    setMensajes(prev => [...prev, msgTemp])

    try {
      const data = await enviarMensajeBruce(sesionId, texto)
      setMensajes(prev => [
        ...prev.filter(m => m.id !== msgTemp.id),
        data.mensaje_usuario,
        data.mensaje_bruce,
      ])
      setPose(getPose(data.mensaje_bruce.contenido))
    } catch {
      setMensajes(prev => prev.filter(m => m.id !== msgTemp.id))
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  const handleBruceClick = () => {
    setClicked(true)
    setTimeout(() => setClicked(false), 600)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '56px 16px 12px',
        background: 'linear-gradient(180deg, #0c1a10 0%, #0a0a0a 100%)',
        display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '4px' }}>
          <IconChevronLeft size={22} />
        </button>
        <div style={{
          width: '36px', height: '36px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #064e3b, #16a34a)',
          overflow: 'hidden', flexShrink: 0,
        }}>
          <img src={bruceFace} alt='Bruce' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: '#4ade80' }}>Bruce</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
            {esNoche ? 'Modo noche' : esDiaDescanso() ? 'Día de descanso' : 'Tu coach'}
          </p>
        </div>
      </div>

      {/* Bruce flotando */}
      <div style={{
        position: 'relative', flexShrink: 0,
        height: '140px',
        background: 'linear-gradient(180deg, #0a0a0a 0%, transparent 100%)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        overflow: 'visible',
      }}>
        <div
          onClick={handleBruceClick}
          style={{
            width: esNoche ? '160px' : '110px',
            height: '130px',
            cursor: 'pointer',
            animation: clicked
              ? 'bruceClick 0.5s ease'
              : 'bruceFloat 3s ease-in-out infinite',
            filter: 'drop-shadow(0 8px 24px rgba(74,222,128,0.25))',
            transition: 'width 0.3s ease',
          }}
        >
          <img
            src={imagenBruce}
            alt='Bruce'
            style={{
              width: '100%', height: '100%',
              objectFit: esNoche ? 'cover' : 'contain',
              objectPosition: 'center',
            }}
          />
        </div>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
        {cargando && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <BruceTyping />
          </div>
        )}

        {!cargando && mensajes.length === 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #091810, #0d2418)',
            border: '0.5px solid rgba(74,222,128,0.15)',
            borderRadius: '4px 16px 16px 16px',
            padding: '14px 16px', marginBottom: '16px',
            display: 'flex', gap: '10px', alignItems: 'flex-start',
          }}>
            <BruceAvatarSmall />
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>
              Qué más parcero, soy Bruce. Pregúntame lo que quieras — nutrición, gym, calorías de algún alimento, o cómo vas hoy. Aquí estoy.
            </p>
          </div>
        )}

        {mensajes.map(m => <Mensaje key={m.id} msg={m} />)}
        {enviando && <BruceTyping />}
        <div ref={bottomRef} style={{ height: '8px' }} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px 24px',
        background: '#0a0a0a',
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              placeholder='Pregúntale algo a Bruce…'
              rows={1}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.06)',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: '20px', color: '#fff', fontSize: '14px',
                padding: '12px 16px', outline: 'none', fontFamily: 'inherit',
                resize: 'none', lineHeight: '1.5', boxSizing: 'border-box',
                maxHeight: '120px', overflowY: 'auto',
              }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
            />
          </div>
          <button
            onClick={enviar}
            disabled={!input.trim() || enviando}
            style={{
              width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
              background: input.trim() && !enviando ? '#4ade80' : 'rgba(255,255,255,0.08)',
              border: 'none', cursor: input.trim() && !enviando ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            <IconArrowUp size={18} color={input.trim() && !enviando ? '#000' : 'rgba(255,255,255,0.3)'} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bruceFloat {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-8px) rotate(1.5deg); }
        }
        @keyframes bruceClick {
          0%   { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(1.2) rotate(-7deg); }
          55%  { transform: scale(1.1) rotate(5deg); }
          80%  { transform: scale(1.03) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes bruceDot {
          0%,80%,100% { transform: scale(0.6); opacity: 0.3; }
          40%         { transform: scale(1.1); opacity: 1; }
        }
        @keyframes brucePulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%     { opacity: 0.5; transform: scale(0.92); }
        }
      `}</style>
    </div>
  )
}

// ── BruceChatScreen ───────────────────────────────────────────────────────
export default function BruceChatScreen({ screen }) {
  const [sesiones,       setSesiones]       = useState([])
  const [sesionActiva,   setSesionActiva]   = useState(null)
  const [cargando,       setCargando]       = useState(true)

  useEffect(() => {
    if (screen !== 'chat') return
    setCargando(true)
    getSesionesChatBruce()
      .then(data => setSesiones(data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [screen])

  const handleNueva = async () => {
    try {
      const nueva = await crearSesionChat()
      setSesiones(prev => [nueva, ...prev])
      setSesionActiva(nueva.id)
    } catch {}
  }

  const handleEliminar = async (id) => {
    try {
      await eliminarSesionChat(id)
      setSesiones(prev => prev.filter(s => s.id !== id))
      if (sesionActiva === id) setSesionActiva(null)
    } catch {}
  }

  if (sesionActiva) {
    return (
      <div style={{ height: '100%' }}>
        <Conversacion
          sesionId={sesionActiva}
          onVolver={() => setSesionActiva(null)}
        />
      </div>
    )
  }

  return (
    <ListaSesiones
      sesiones={sesiones}
      cargando={cargando}
      onSeleccionar={s => setSesionActiva(s.id)}
      onNueva={handleNueva}
      onEliminar={handleEliminar}
    />
  )
}