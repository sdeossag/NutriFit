import { useState, useEffect, useRef } from 'react'
import {
  IconFlame, IconMeat, IconWheat, IconDroplet,
  IconTrophy, IconCalendar, IconScale, IconEdit,
  IconCheck, IconX, IconLogout, IconCamera, IconArrowLeft,
  IconTarget, IconRuler, IconWeight, IconChevronRight,
  IconBell, IconBellOff,
} from '@tabler/icons-react'
import { getMiPerfil, actualizarPerfil, actualizarMetas, actualizarObjetivo, logout as apiLogout } from '../api'
import { soportaNotificaciones, permisoActual, estasSuscrito, suscribir, desuscribir } from '../utils/notificaciones'

// ── helpers UI ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: '11px', color: 'rgba(255,255,255,0.25)',
      textTransform: 'uppercase', letterSpacing: '0.09em',
      fontWeight: '600', marginBottom: '10px', marginTop: '24px',
    }}>
      {children}
    </p>
  )
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#131313',
      borderRadius: '22px',
      border: '0.5px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardRow({ icon, label, value, color = '#fff', last = false, onClick, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 20px',
        borderBottom: last ? 'none' : '0.5px solid rgba(255,255,255,0.03)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {icon && (
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{label}</span>
      {children ?? (
        <span style={{ fontSize: '14px', fontWeight: '700', color }}>
          {value}
        </span>
      )}
    </div>
  )
}

function PillGroup({ options, value, onChange, color = '#4ade80' }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {options.map(({ key, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '7px 14px', borderRadius: '10px', fontSize: '12px',
              fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
              background: active ? `${color}20` : 'rgba(255,255,255,0.04)',
              border: active ? `0.5px solid ${color}60` : '0.5px solid rgba(255,255,255,0.08)',
              color: active ? color : 'rgba(255,255,255,0.45)',
              transition: 'all 0.18s ease',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function NumInput({ value, onChange, min, max, unit, color = '#fff' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="number" value={value ?? ''} min={min} max={max}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{
          width: '80px', background: 'rgba(255,255,255,0.06)',
          border: `0.5px solid ${color}40`, borderRadius: '8px',
          color, fontSize: '14px', fontWeight: '700',
          padding: '6px 8px', textAlign: 'right',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
    </div>
  )
}

function InputField({ placeholder, value, onChange }) {
  return (
    <input
      placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, background: 'rgba(255,255,255,0.05)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', color: '#fff', fontSize: '13px',
        padding: '10px 12px', outline: 'none', fontFamily: 'inherit',
      }}
    />
  )
}

function ActionBtn({ color, onClick, disabled, children, full = false }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        flex: full ? '1 1 100%' : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        background: `${color}15`, border: `0.5px solid ${color}40`,
        borderRadius: '10px', color, fontSize: '13px', fontWeight: '600',
        padding: '10px', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1, fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function StatCard({ icon, label, value, unit, color }) {
  return (
    <div style={{
      background: '#131313', borderRadius: '18px',
      border: '0.5px solid rgba(255,255,255,0.06)',
      padding: '16px 14px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '8px',
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '10px',
        background: `${color}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '22px', fontWeight: '700', color, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</p>
        {unit && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{unit}</p>}
      </div>
      <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{label}</p>
    </div>
  )
}

// ── ProfileScreen ─────────────────────────────────────────────────────────

const OBJETIVO_OPTS = [
  { key: 'perder',   label: 'Perder grasa'   },
  { key: 'mantener', label: 'Mantener'        },
  { key: 'ganar',    label: 'Ganar músculo'   },
]
const VELOCIDAD_OPTS = [
  { key: 'suave',    label: 'Suave'    },
  { key: 'moderado', label: 'Moderado' },
  { key: 'agresivo', label: 'Agresivo' },
]
const ACTIVIDAD_OPTS = [
  { key: 'sedentario', label: 'Sedentario' },
  { key: 'ligero',     label: 'Ligero'     },
  { key: 'moderado',   label: 'Moderado'   },
  { key: 'activo',     label: 'Activo'     },
  { key: 'muy_activo', label: 'Muy activo' },
]

export default function ProfileScreen({ usuario: usuarioProp, setUsuario, onLogout, onClose, t }) {
  const [perfil,       setPerfil]       = useState(null)
  const [stats,        setStats]        = useState(null)
  const [cargando,     setCargando]     = useState(true)
  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState(null)

  // secciones de edición
  const [editPerfil,   setEditPerfil]   = useState(false)
  const [editMetas,    setEditMetas]    = useState(false)
  const [editObjetivo, setEditObjetivo] = useState(false)

  // forms
  const [form,     setForm]     = useState({ first_name: '', last_name: '', bio: '' })
  const [metas,    setMetas]    = useState({ meta_calorias: 1900, meta_proteina: 140, meta_carbos: 200, meta_grasas: 55 })
  const [objetivo, setObjetivo] = useState({
    objetivo: 'mantener', velocidad_objetivo: 'moderado', nivel_actividad: 'moderado',
    estatura_cm: null, peso_inicial_kg: null, peso_objetivo_kg: null,
  })

  // notificaciones
  const [suscrito,     setSuscrito]     = useState(false)
  const [cargandoBell, setCargandoBell] = useState(false)

  const fileRef = useRef(null)

  useEffect(() => {
    cargarPerfil()
    estasSuscrito().then(setSuscrito)
  }, [])

  const cargarPerfil = async () => {
    setCargando(true)
    try {
      const data = await getMiPerfil()
      const u = data.usuario
      setPerfil(u)
      setStats(data.stats)
      setForm({ first_name: u.first_name || '', last_name: u.last_name || '', bio: u.bio || '' })
      setMetas({ meta_calorias: u.meta_calorias, meta_proteina: u.meta_proteina, meta_carbos: u.meta_carbos, meta_grasas: u.meta_grasas })
      setObjetivo({
        objetivo:          u.objetivo          || 'mantener',
        velocidad_objetivo: u.velocidad_objetivo || 'moderado',
        nivel_actividad:   u.nivel_actividad   || 'moderado',
        estatura_cm:       u.estatura_cm       || '',
        peso_inicial_kg:   u.peso_inicial_kg   || '',
        peso_objetivo_kg:  u.peso_objetivo_kg  || '',
      })
    } catch { setError('No se pudo cargar el perfil') }
    finally { setCargando(false) }
  }

  const guardarPerfil = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarPerfil(form)
      setPerfil(updated); setUsuario?.(prev => ({ ...prev, ...updated })); setEditPerfil(false)
    } catch { setError('Error al guardar') }
    finally { setGuardando(false) }
  }

  const guardarMetas = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarMetas(metas)
      setPerfil(prev => ({ ...prev, ...updated }))
      setUsuario?.(prev => ({ ...prev, ...updated }))
      setEditMetas(false)
    } catch { setError('Error al guardar metas') }
    finally { setGuardando(false) }
  }

  const guardarObjetivo = async () => {
    setGuardando(true)
    try {
      const payload = {
        ...objetivo,
        estatura_cm:      objetivo.estatura_cm      ? Number(objetivo.estatura_cm)      : null,
        peso_inicial_kg:  objetivo.peso_inicial_kg  ? Number(objetivo.peso_inicial_kg)  : null,
        peso_objetivo_kg: objetivo.peso_objetivo_kg ? Number(objetivo.peso_objetivo_kg) : null,
      }
      const updated = await actualizarObjetivo(payload)
      setPerfil(updated)
      setUsuario?.(prev => ({ ...prev, ...updated }))
      // actualizar metas locales con las recalculadas
      setMetas({
        meta_calorias: updated.meta_calorias,
        meta_proteina: updated.meta_proteina,
        meta_carbos:   updated.meta_carbos,
        meta_grasas:   updated.meta_grasas,
      })
      setEditObjetivo(false)
    } catch { setError('Error al guardar objetivo') }
    finally { setGuardando(false) }
  }

  const cambiarAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setGuardando(true)
    try {
      const updated = await actualizarPerfil({ avatar: file })
      setPerfil(updated); setUsuario?.(prev => ({ ...prev, ...updated }))
    } catch { setError('Error al subir imagen') }
    finally { setGuardando(false) }
  }

  const toggleNotificaciones = async () => {
    if (!soportaNotificaciones()) { alert('Tu navegador no soporta notificaciones push.'); return }
    if (permisoActual() === 'denied') { alert('Las notificaciones están bloqueadas en la configuración de tu navegador.'); return }
    setCargandoBell(true)
    try {
      if (suscrito) { await desuscribir(); setSuscrito(false) }
      else          { await suscribir();   setSuscrito(true)  }
    } catch (e) { console.error(e) }
    finally { setCargandoBell(false) }
  }

  const handleLogout = async () => { await apiLogout(); onLogout?.() }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ padding: '100px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
      <div style={{ fontSize: '14px' }}>Cargando perfil…</div>
    </div>
  )

  const nombre    = perfil ? `${perfil.first_name} ${perfil.last_name}`.trim() || perfil.email : ''
  const iniciales = nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  const OBJETIVO_COLOR = { perder: '#60a5fa', mantener: '#4ade80', ganar: '#fb923c' }
  const objColor = OBJETIVO_COLOR[objetivo.objetivo] ?? '#4ade80'

  return (
    <div style={{ padding: '0 16px 100px', color: '#fff', fontFamily: 'inherit' }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '54px 0 16px',
      }}>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', fontSize: '15px',
          fontFamily: 'inherit', padding: 0,
        }}>
          <IconArrowLeft size={20} /> Volver
        </button>
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
          borderRadius: '10px', padding: '8px 12px', cursor: 'pointer',
          color: '#f87171', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit',
        }}>
          <IconLogout size={14} /> Salir
        </button>
      </div>

      {/* ── Título ── */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-1px', marginBottom: '4px' }}>Ajustes</h2>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>Perfil, metas y preferencias</p>
      </div>

      {/* ── Avatar + nombre ── */}
      <SectionLabel>Cuenta</SectionLabel>
      <Card>
        <div style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {perfil?.avatar_display ? (
              <img src={perfil.avatar_display} alt="avatar"
                style={{ width: '68px', height: '68px', borderRadius: '20px', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '68px', height: '68px', borderRadius: '20px',
                background: 'linear-gradient(135deg, #064e3b, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', fontWeight: '700', color: '#fff',
              }}>
                {iniciales}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} style={{
              position: 'absolute', bottom: '-4px', right: '-4px',
              width: '24px', height: '24px', borderRadius: '8px',
              background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <IconCamera size={12} color='rgba(255,255,255,0.6)' />
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={cambiarAvatar} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px', marginBottom: '3px' }}>{nombre || 'Sin nombre'}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{perfil?.email}</p>
            {perfil?.bio && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginTop: '3px' }}>{perfil.bio}</p>}
          </div>

          {!editPerfil && (
            <button onClick={() => setEditPerfil(true)} style={{
              width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <IconEdit size={14} color='rgba(255,255,255,0.5)' />
            </button>
          )}
        </div>

        {editPerfil && (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <InputField placeholder="Nombre"   value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
              <InputField placeholder="Apellido" value={form.last_name}  onChange={v => setForm(f => ({ ...f, last_name: v }))}  />
            </div>
            <InputField placeholder="Bio (opcional)" value={form.bio} onChange={v => setForm(f => ({ ...f, bio: v }))} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <ActionBtn color='#4ade80' onClick={guardarPerfil} disabled={guardando}>
                <IconCheck size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
              </ActionBtn>
              <ActionBtn color='rgba(255,255,255,0.3)' onClick={() => setEditPerfil(false)}>
                <IconX size={14} /> Cancelar
              </ActionBtn>
            </div>
          </div>
        )}
      </Card>

      {/* ── Estadísticas ── */}
      <SectionLabel>Estadísticas</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '4px' }}>
        <StatCard icon={<IconTrophy size={16} color='#fb923c' />}  label="Racha"    value={stats?.racha_gym ?? 0}       unit="días"  color='#fb923c' />
        <StatCard icon={<IconCalendar size={16} color='#60a5fa' />} label="Sesiones" value={stats?.sesiones_totales ?? 0} unit="total" color='#60a5fa' />
        <StatCard icon={<IconScale size={16} color='#4ade80' />}    label="Peso"     value={stats?.peso_actual ?? '—'}    unit={stats?.peso_actual ? 'kg' : ''} color='#4ade80' />
      </div>

      {/* ── Objetivo ── */}
      <SectionLabel>Objetivo y ritmo</SectionLabel>
      <Card>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px',
          borderBottom: editObjetivo ? '0.5px solid rgba(255,255,255,0.04)' : 'none',
        }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>
              {OBJETIVO_OPTS.find(o => o.key === objetivo.objetivo)?.label ?? '—'}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
              {VELOCIDAD_OPTS.find(o => o.key === objetivo.velocidad_objetivo)?.label ?? '—'} ·{' '}
              {ACTIVIDAD_OPTS.find(o => o.key === objetivo.nivel_actividad)?.label ?? '—'}
            </p>
          </div>
          {!editObjetivo ? (
            <button onClick={() => setEditObjetivo(true)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: `${objColor}12`, border: `0.5px solid ${objColor}30`,
              borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
              color: objColor, fontSize: '12px', fontWeight: '600', fontFamily: 'inherit',
            }}>
              <IconEdit size={12} /> Editar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={guardarObjetivo} disabled={guardando} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(74,222,128,0.15)', border: '0.5px solid rgba(74,222,128,0.3)',
                borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
                color: '#4ade80', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit',
              }}>
                <IconCheck size={12} /> {guardando ? '…' : 'Guardar'}
              </button>
              <button onClick={() => setEditObjetivo(false)} style={{
                width: '32px', height: '32px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <IconX size={14} color='rgba(255,255,255,0.4)' />
              </button>
            </div>
          )}
        </div>

        {editObjetivo && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Objetivo</p>
              <PillGroup options={OBJETIVO_OPTS} value={objetivo.objetivo} color={objColor}
                onChange={v => setObjetivo(o => ({ ...o, objetivo: v }))} />
            </div>

            <div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Velocidad</p>
              <PillGroup options={VELOCIDAD_OPTS} value={objetivo.velocidad_objetivo} color='#a78bfa'
                onChange={v => setObjetivo(o => ({ ...o, velocidad_objetivo: v }))} />
            </div>

            <div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nivel de actividad</p>
              <PillGroup options={ACTIVIDAD_OPTS} value={objetivo.nivel_actividad} color='#22d3ee'
                onChange={v => setObjetivo(o => ({ ...o, nivel_actividad: v }))} />
            </div>

            <div style={{
              background: 'rgba(74,222,128,0.05)', border: '0.5px solid rgba(74,222,128,0.15)',
              borderRadius: '12px', padding: '10px 14px',
            }}>
              <p style={{ fontSize: '11px', color: 'rgba(74,222,128,0.7)', fontWeight: '600' }}>
                Al guardar, las metas de calorías y macros se recalculan automáticamente según estos datos.
              </p>
            </div>

          </div>
        )}
      </Card>

      {/* ── Datos físicos ── */}
      <SectionLabel>Datos físicos</SectionLabel>
      <Card>
        {[
          { key: 'estatura_cm',      label: 'Estatura',      unit: 'cm',  color: '#60a5fa', icon: <IconRuler  size={15} color='#60a5fa' strokeWidth={2} />, min: 100, max: 250 },
          { key: 'peso_inicial_kg',  label: 'Peso actual',   unit: 'kg',  color: '#4ade80', icon: <IconWeight size={15} color='#4ade80' strokeWidth={2} />, min: 30,  max: 300 },
          { key: 'peso_objetivo_kg', label: 'Peso objetivo', unit: 'kg',  color: '#fb923c', icon: <IconTarget size={15} color='#fb923c' strokeWidth={2} />, min: 30,  max: 300 },
        ].map(({ key, label, unit, color, icon, min, max }, i, arr) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 20px',
            borderBottom: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
          }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{label}</span>
            <NumInput
              value={objetivo[key]} color={color} unit={unit} min={min} max={max}
              onChange={v => setObjetivo(o => ({ ...o, [key]: v }))}
            />
          </div>
        ))}
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid rgba(255,255,255,0.03)' }}>
          <ActionBtn color='#4ade80' onClick={guardarObjetivo} disabled={guardando} full>
            <IconCheck size={14} /> {guardando ? 'Guardando…' : 'Guardar datos y recalcular metas'}
          </ActionBtn>
        </div>
      </Card>

      {/* ── Metas diarias ── */}
      <SectionLabel>Metas diarias</SectionLabel>
      <Card>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '0.5px solid rgba(255,255,255,0.04)',
        }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>Calorías y macros</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Ajuste manual</p>
          </div>
          {!editMetas ? (
            <button onClick={() => setEditMetas(true)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)',
              borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
              color: '#4ade80', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit',
            }}>
              <IconEdit size={12} /> Editar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={guardarMetas} disabled={guardando} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(74,222,128,0.15)', border: '0.5px solid rgba(74,222,128,0.3)',
                borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
                color: '#4ade80', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit',
              }}>
                <IconCheck size={12} /> {guardando ? '…' : 'OK'}
              </button>
              <button onClick={() => setEditMetas(false)} style={{
                width: '32px', height: '32px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <IconX size={14} color='rgba(255,255,255,0.4)' />
              </button>
            </div>
          )}
        </div>

        {[
          { key: 'meta_calorias', label: 'Calorías', unit: 'kcal', color: '#fb923c', icon: <IconFlame   size={15} color='#fb923c' strokeWidth={2} />, min: 1200, max: 4000 },
          { key: 'meta_proteina', label: 'Proteína',  unit: 'g',    color: '#4ade80', icon: <IconMeat    size={15} color='#4ade80' strokeWidth={2} />, min: 50,   max: 300  },
          { key: 'meta_carbos',   label: 'Carbos',    unit: 'g',    color: '#60a5fa', icon: <IconWheat   size={15} color='#60a5fa' strokeWidth={2} />, min: 50,   max: 500  },
          { key: 'meta_grasas',   label: 'Grasas',    unit: 'g',    color: '#a78bfa', icon: <IconDroplet size={15} color='#a78bfa' strokeWidth={2} />, min: 20,   max: 200  },
        ].map(({ key, label, unit, color, icon, min, max }, i, arr) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 20px',
            borderBottom: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
          }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{label}</span>
            {editMetas ? (
              <NumInput
                value={metas[key]} color={color} unit={unit} min={min} max={max}
                onChange={v => setMetas(m => ({ ...m, [key]: v }))}
              />
            ) : (
              <span style={{ fontSize: '16px', fontWeight: '700', color }}>
                {metas[key]} <span style={{ fontSize: '11px', fontWeight: '400', color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
              </span>
            )}
          </div>
        ))}
      </Card>

      {/* ── Notificaciones ── */}
      <SectionLabel>Notificaciones</SectionLabel>
      <Card>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: suscrito ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {suscrito
              ? <IconBell    size={18} color='#4ade80' />
              : <IconBellOff size={18} color='rgba(255,255,255,0.35)' />
            }
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>Mensajes de Bruce</p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
              {suscrito ? 'Recibirás una frase motivacional al abrir la app cada día.' : 'Activa para que Bruce te hable cada día.'}
            </p>
          </div>
          <button
            onClick={toggleNotificaciones}
            disabled={cargandoBell}
            style={{
              width: '44px', height: '26px', borderRadius: '13px',
              background: suscrito ? '#4ade80' : 'rgba(255,255,255,0.12)',
              border: 'none', cursor: cargandoBell ? 'default' : 'pointer',
              position: 'relative', transition: 'background 0.25s ease',
              opacity: cargandoBell ? 0.6 : 1, flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: '3px',
              left: suscrito ? '21px' : '3px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.25s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </Card>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
          borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: '#f87171',
          marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
