import { useState, useEffect, useRef } from 'react'
import {
  IconFlame, IconMeat, IconWheat, IconDroplet,
  IconTrophy, IconCalendar, IconScale, IconEdit,
  IconCheck, IconX, IconLogout, IconCamera, IconArrowLeft,
} from '@tabler/icons-react'
import { getMiPerfil, actualizarPerfil, actualizarMetas, logout as apiLogout } from '../api'

export default function ProfileScreen({ usuario: usuarioProp, setUsuario, onLogout, onClose, t }) {
  const [perfil, setPerfil]       = useState(null)
  const [stats, setStats]         = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [editando, setEditando]   = useState(false)
  const [editMetas, setEditMetas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState(null)

  const [form, setForm]   = useState({ first_name: '', last_name: '', bio: '' })
  const [metas, setMetas] = useState({ meta_calorias: 1900, meta_proteina: 140, meta_carbos: 200, meta_grasas: 55 })

  const fileRef = useRef(null)

  useEffect(() => { cargarPerfil() }, [])

  const cargarPerfil = async () => {
    setCargando(true)
    try {
      const data = await getMiPerfil()
      setPerfil(data.usuario)
      setStats(data.stats)
      setForm({ first_name: data.usuario.first_name || '', last_name: data.usuario.last_name || '', bio: data.usuario.bio || '' })
      setMetas({ meta_calorias: data.usuario.meta_calorias, meta_proteina: data.usuario.meta_proteina, meta_carbos: data.usuario.meta_carbos, meta_grasas: data.usuario.meta_grasas })
    } catch { setError('No se pudo cargar el perfil') }
    finally { setCargando(false) }
  }

  const guardarPerfil = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarPerfil(form)
      setPerfil(updated); setUsuario?.(updated); setEditando(false)
    } catch { setError('Error al guardar') }
    finally { setGuardando(false) }
  }

  const guardarMetas = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarMetas(metas)
      setPerfil(prev => ({ ...prev, ...updated })); setEditMetas(false)
    } catch { setError('Error al guardar metas') }
    finally { setGuardando(false) }
  }

  const cambiarAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setGuardando(true)
    try {
      const updated = await actualizarPerfil({ avatar: file })
      setPerfil(updated); setUsuario?.(updated)
    } catch { setError('Error al subir imagen') }
    finally { setGuardando(false) }
  }

  const handleLogout = async () => { await apiLogout(); onLogout?.() }

  if (cargando) return (
    <div style={{ padding: '100px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
      <div style={{ fontSize: '14px' }}>Cargando perfil…</div>
    </div>
  )

  const nombre   = perfil ? `${perfil.first_name} ${perfil.last_name}`.trim() || perfil.email : ''
  const iniciales = nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div style={{ padding: '0 16px 100px', color: '#fff', fontFamily: "inherit" }}>

      {/* ── Top bar con botón cerrar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '54px 0 16px',
        marginBottom: '4px',
      }}>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', fontSize: '15px',
          fontFamily: 'inherit', padding: 0,
        }}>
          <IconArrowLeft size={20} />
          Volver
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
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-1px', marginBottom: '4px' }}>Perfil</h2>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>Tu cuenta y metas</p>
      </div>

      {/* ── Avatar + nombre ── */}
      <div style={{ background: '#131313', borderRadius: '22px', border: '0.5px solid rgba(255,255,255,0.06)', padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: editando ? '20px' : '0' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {perfil?.avatar_display ? (
              <img src={perfil.avatar_display} alt="avatar" style={{ width: '68px', height: '68px', borderRadius: '20px', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '68px', height: '68px', borderRadius: '20px', background: 'linear-gradient(135deg, #064e3b, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700', color: '#fff' }}>
                {iniciales}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '24px', height: '24px', borderRadius: '8px', background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <IconCamera size={12} color='rgba(255,255,255,0.6)' />
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={cambiarAvatar} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!editando && (
              <>
                <p style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px', marginBottom: '3px' }}>{nombre || 'Sin nombre'}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: perfil?.bio ? '4px' : '0' }}>{perfil?.email}</p>
                {perfil?.bio && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>{perfil.bio}</p>}
              </>
            )}
          </div>

          {!editando && (
            <button onClick={() => setEditando(true)} style={{ width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <IconEdit size={14} color='rgba(255,255,255,0.5)' />
            </button>
          )}
        </div>

        {editando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <InputField placeholder="Nombre"   value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
              <InputField placeholder="Apellido" value={form.last_name}  onChange={v => setForm(f => ({ ...f, last_name: v }))}  />
            </div>
            <InputField placeholder="Bio (opcional)" value={form.bio} onChange={v => setForm(f => ({ ...f, bio: v }))} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <ActionBtn color='#4ade80' onClick={guardarPerfil} disabled={guardando}>
                <IconCheck size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
              </ActionBtn>
              <ActionBtn color='rgba(255,255,255,0.3)' onClick={() => setEditando(false)}>
                <IconX size={14} /> Cancelar
              </ActionBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Estadísticas ── */}
      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: '600', marginBottom: '12px' }}>Estadísticas</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
        <StatCard icon={<IconTrophy size={16} color='#fb923c' />}  label="Racha"    value={stats?.racha_gym ?? 0}       unit="días" color='#fb923c' />
        <StatCard icon={<IconCalendar size={16} color='#60a5fa' />} label="Sesiones" value={stats?.sesiones_totales ?? 0} unit="total" color='#60a5fa' />
        <StatCard icon={<IconScale size={16} color='#4ade80' />}    label="Peso"     value={stats?.peso_actual ?? '—'}    unit={stats?.peso_actual ? 'kg' : ''} color='#4ade80' />
      </div>

      {/* ── Metas nutricionales ── */}
      <div style={{ background: '#131313', borderRadius: '22px', border: '0.5px solid rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>Metas diarias</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Calorías y macronutrientes</p>
          </div>
          {!editMetas ? (
            <button onClick={() => setEditMetas(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: '10px', padding: '7px 12px', cursor: 'pointer', color: '#4ade80', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}>
              <IconEdit size={12} /> Editar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={guardarMetas} disabled={guardando} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(74,222,128,0.15)', border: '0.5px solid rgba(74,222,128,0.3)', borderRadius: '10px', padding: '7px 12px', cursor: 'pointer', color: '#4ade80', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}>
                <IconCheck size={12} /> {guardando ? '…' : 'OK'}
              </button>
              <button onClick={() => setEditMetas(false)} style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <IconX size={14} color='rgba(255,255,255,0.4)' />
              </button>
            </div>
          )}
        </div>

        {[
          { key: 'meta_calorias', label: 'Calorías', unit: 'kcal', color: '#fb923c', icon: IconFlame,   min: 1200, max: 4000 },
          { key: 'meta_proteina', label: 'Proteína',  unit: 'g',    color: '#4ade80', icon: IconMeat,    min: 50,   max: 300  },
          { key: 'meta_carbos',   label: 'Carbos',    unit: 'g',    color: '#60a5fa', icon: IconWheat,   min: 50,   max: 500  },
          { key: 'meta_grasas',   label: 'Grasas',    unit: 'g',    color: '#a78bfa', icon: IconDroplet, min: 20,   max: 200  },
        ].map(({ key, label, unit, color, icon: Icon, min, max }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={15} color={color} strokeWidth={2} />
            </div>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{label}</span>
            {editMetas ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number" value={metas[key]} min={min} max={max}
                  onChange={e => setMetas(m => ({ ...m, [key]: parseInt(e.target.value) || 0 }))}
                  style={{ width: '72px', background: 'rgba(255,255,255,0.06)', border: `0.5px solid ${color}40`, borderRadius: '8px', color, fontSize: '14px', fontWeight: '700', padding: '6px 8px', textAlign: 'right', outline: 'none', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', minWidth: '24px' }}>{unit}</span>
              </div>
            ) : (
              <span style={{ fontSize: '16px', fontWeight: '700', color }}>
                {metas[key]} <span style={{ fontSize: '11px', fontWeight: '400', color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: '#f87171', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}><IconX size={14} /></button>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, unit, color }) {
  return (
    <div style={{ background: '#131313', borderRadius: '18px', border: '0.5px solid rgba(255,255,255,0.06)', padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '22px', fontWeight: '700', color, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</p>
        {unit && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{unit}</p>}
      </div>
      <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{label}</p>
    </div>
  )
}

function InputField({ placeholder, value, onChange }) {
  return (
    <input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '13px', padding: '10px 12px', outline: 'none', fontFamily: 'inherit' }} />
  )
}

function ActionBtn({ color, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: `${color}15`, border: `0.5px solid ${color}40`, borderRadius: '10px', color, fontSize: '13px', fontWeight: '600', padding: '10px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}