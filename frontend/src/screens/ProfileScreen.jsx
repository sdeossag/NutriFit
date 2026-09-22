import { useState, useEffect, useRef } from 'react'
import {
  IconFlame, IconMeat, IconWheat, IconDroplet,
  IconTrophy, IconCalendar, IconScale, IconEdit,
  IconCheck, IconLogout, IconCamera, IconLoader2,
  IconTarget, IconRuler, IconWeight, IconBell, IconLanguage,
} from '@tabler/icons-react'
import { getMiPerfil, actualizarPerfil, actualizarMetas, actualizarObjetivo, logout as apiLogout } from '../api'
import { soportaNotificaciones, permisoActual, estasSuscrito, suscribir, desuscribir } from '../utils/notificaciones'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'
import Segmented from '../components/Segmented'
import UserAvatar from '../components/UserAvatar'
import { fotoAJpeg } from '../lib/imagen'

// ── helpers UI ────────────────────────────────────────────────────────────

function Section({ label, footer, children }) {
  return (
    <section>
      <h3 className='nf-section-label'>{label}</h3>
      <div className='nf-card' style={{ overflow: 'hidden' }}>{children}</div>
      {footer && <p className='nf-caption' style={{ margin: '8px 16px 0' }}>{footer}</p>}
    </section>
  )
}

function Row({ icon, tint, label, children }) {
  return (
    <div className='nf-row' style={{ '--row-inset': icon ? '60px' : '16px' }}>
      {icon && <span className='nf-row-icon' style={{ '--tint': tint }}>{icon}</span>}
      <span style={{ flex: 1, fontSize: '15px' }}>{label}</span>
      {children}
    </div>
  )
}

function PillGroup({ options, value, onChange, color = 'var(--green)' }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          className='nf-chip nf-chip--soft'
          aria-pressed={value === key}
          style={{ '--tint': color }}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function NumInput({ value, onChange, min, max, unit, color = 'var(--label)', label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type='number' inputMode='decimal' value={value ?? ''} min={min} max={max}
        aria-label={label}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className='nf-input nf-num'
        style={{
          '--tint': color,
          width: '84px', minHeight: '38px', padding: '6px 10px',
          color, fontWeight: 600, textAlign: 'right',
          background: 'rgba(255,255,255,0.06)',
        }}
      />
      <span className='nf-caption' style={{ width: '28px' }}>{unit}</span>
    </label>
  )
}

function StatCard({ icon, label, value, unit, color }) {
  return (
    <div className='nf-card' style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <span style={{ color }}>{icon}</span>
      <p className='nf-num' style={{ fontSize: '24px', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--label-3)', marginLeft: '3px' }}>{unit}</span>}
      </p>
      <p className='nf-caption' style={{ fontWeight: 600 }}>{label}</p>
    </div>
  )
}

// ── ProfileScreen ─────────────────────────────────────────────────────────

const OBJETIVO_OPTS = [
  { key: 'perder',   label: 'Perder grasa'  },
  { key: 'mantener', label: 'Mantener'      },
  { key: 'ganar',    label: 'Ganar músculo' },
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
const OBJETIVO_COLOR = { perder: 'var(--blue)', mantener: 'var(--green)', ganar: 'var(--orange)' }

export default function ProfileScreen({ setUsuario, onLogout, lang, setLang }) {
  const [perfil,       setPerfil]       = useState(null)
  const [stats,        setStats]        = useState(null)
  const [cargando,     setCargando]     = useState(true)
  const [guardando,    setGuardando]    = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const [editPerfil,   setEditPerfil]   = useState(false)
  const [editMetas,    setEditMetas]    = useState(false)
  const [editObjetivo, setEditObjetivo] = useState(false)

  const [form,     setForm]     = useState({ first_name: '', last_name: '', bio: '' })
  const [metas,    setMetas]    = useState({ meta_calorias: 1900, meta_proteina: 140, meta_carbos: 200, meta_grasas: 55 })
  const [objetivo, setObjetivo] = useState({
    objetivo: 'mantener', velocidad_objetivo: 'moderado', nivel_actividad: 'moderado',
    estatura_cm: null, peso_inicial_kg: null, peso_objetivo_kg: null,
  })

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
        objetivo:           u.objetivo           || 'mantener',
        velocidad_objetivo: u.velocidad_objetivo || 'moderado',
        nivel_actividad:    u.nivel_actividad    || 'moderado',
        estatura_cm:        u.estatura_cm        || '',
        peso_inicial_kg:    u.peso_inicial_kg    || '',
        peso_objetivo_kg:   u.peso_objetivo_kg   || '',
      })
    } catch { toast.error('No se pudo cargar el perfil') }
    finally { setCargando(false) }
  }

  const guardarPerfil = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarPerfil(form)
      setPerfil(updated); setUsuario?.(prev => ({ ...prev, ...updated })); setEditPerfil(false)
      toast.success('Perfil actualizado')
    } catch { toast.error('Error al guardar el perfil') }
    finally { setGuardando(false) }
  }

  const guardarMetas = async () => {
    setGuardando(true)
    try {
      const updated = await actualizarMetas(metas)
      setPerfil(prev => ({ ...prev, ...updated }))
      setUsuario?.(prev => ({ ...prev, ...updated }))
      setEditMetas(false)
      toast.success('Metas guardadas')
    } catch { toast.error('Error al guardar las metas') }
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
      setMetas({
        meta_calorias: updated.meta_calorias,
        meta_proteina: updated.meta_proteina,
        meta_carbos:   updated.meta_carbos,
        meta_grasas:   updated.meta_grasas,
      })
      setEditObjetivo(false)
      toast.success('Metas recalculadas')
    } catch { toast.error('Error al guardar el objetivo') }
    finally { setGuardando(false) }
  }

  // La foto nueva se ve al instante; si el servidor la rechaza, vuelve la anterior
  const cambiarAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const anterior = perfil?.avatar_display
    const foto = await fotoAJpeg(file, 768)
    const vistaPrevia = URL.createObjectURL(foto)
    setPerfil(prev => ({ ...prev, avatar_display: vistaPrevia }))
    setSubiendoFoto(true)
    try {
      const updated = await actualizarPerfil({ avatar: foto })
      setPerfil(updated); setUsuario?.(prev => ({ ...prev, ...updated }))
      haptic()
    } catch (err) {
      setPerfil(prev => ({ ...prev, avatar_display: anterior }))
      toast.error(err.mensaje || 'No se pudo cambiar la foto. Intenta con otra.')
    } finally {
      setSubiendoFoto(false)
      setTimeout(() => URL.revokeObjectURL(vistaPrevia), 1000)
    }
  }

  const toggleNotificaciones = async () => {
    if (!soportaNotificaciones()) { toast.error('Tu navegador no soporta notificaciones push.'); return }
    if (permisoActual() === 'denied') { toast.error('Las notificaciones están bloqueadas en la configuración del navegador.'); return }
    setCargandoBell(true)
    try {
      if (suscrito) { await desuscribir(); setSuscrito(false) }
      else          { await suscribir();   setSuscrito(true)  }
    } catch (e) { console.error(e); toast.error('No se pudieron cambiar las notificaciones.') }
    finally { setCargandoBell(false) }
  }

  const handleLogout = async () => { await apiLogout(); onLogout?.() }

  if (cargando) return (
    <div style={{ padding: '8px 16px' }} aria-busy='true'>
      <div className='nf-skeleton' style={{ height: '96px', borderRadius: 'var(--r-lg)', marginTop: '28px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '16px' }}>
        {[0, 1, 2].map(i => <div key={i} className='nf-skeleton' style={{ height: '100px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
      <div className='nf-skeleton' style={{ height: '160px', borderRadius: 'var(--r-lg)', marginTop: '16px' }} />
    </div>
  )

  const nombre    = perfil ? `${perfil.first_name} ${perfil.last_name}`.trim() || perfil.email : ''
  const objColor  = OBJETIVO_COLOR[objetivo.objetivo] ?? 'var(--green)'

  return (
    <div style={{ padding: '0 16px calc(var(--safe-bottom) + 32px)' }}>

      {/* ── Cuenta ── */}
      <Section label='Cuenta'>
        <div style={{ padding: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <UserAvatar src={perfil?.avatar_display} nombre={nombre} size={64}
              style={{ opacity: subiendoFoto ? 0.55 : 1, transition: 'opacity 200ms ease' }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={subiendoFoto}
              aria-label='Cambiar foto de perfil'
              style={{
                position: 'absolute', bottom: '-6px', right: '-6px',
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--surface-3)', boxShadow: '0 0 0 3px var(--surface-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {subiendoFoto
                ? <IconLoader2 size={15} color='var(--label-2)' className='nf-spinner' />
                : <IconCamera size={15} color='var(--label-2)' />}
            </button>
            <input ref={fileRef} type='file' accept='image/*' hidden onChange={cambiarAvatar} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p className='nf-title-3' style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre || 'Sin nombre'}</p>
            <p className='nf-footnote' style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perfil?.email}</p>
            {perfil?.bio && <p className='nf-caption' style={{ marginTop: '2px' }}>{perfil.bio}</p>}
          </div>

          {!editPerfil && (
            <button onClick={() => setEditPerfil(true)} className='nf-icon-btn nf-icon-btn--sm nf-icon-btn--filled' aria-label='Editar perfil'>
              <IconEdit size={17} />
            </button>
          )}
        </div>

        {editPerfil && (
          <div className='nf-reveal' style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className='nf-input' placeholder='Nombre' autoComplete='given-name'
                value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              <input className='nf-input' placeholder='Apellido' autoComplete='family-name'
                value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
            <input className='nf-input' placeholder='Bio (opcional)' maxLength={160}
              value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button className='nf-btn nf-btn--gray' style={{ flex: 1 }} onClick={() => setEditPerfil(false)}>Cancelar</button>
              <button className='nf-btn nf-btn--primary' style={{ flex: 1 }} onClick={guardarPerfil} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Estadísticas ── */}
      <h3 className='nf-section-label'>Estadísticas</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <StatCard icon={<IconTrophy size={20} />}   label='Racha'    value={stats?.racha_gym ?? 0}        unit='días' color='var(--orange)' />
        <StatCard icon={<IconCalendar size={20} />} label='Sesiones' value={stats?.sesiones_totales ?? 0}               color='var(--blue)' />
        <StatCard icon={<IconScale size={20} />}    label='Peso'     value={stats?.peso_actual ?? '—'}    unit={stats?.peso_actual ? 'kg' : ''} color='var(--green)' />
      </div>

      {/* ── Objetivo ── */}
      <Section
        label='Objetivo y ritmo'
        footer={editObjetivo ? 'Al guardar, las metas de calorías y macros se recalculan con estos datos.' : null}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <p className='nf-headline' style={{ color: objColor }}>
              {OBJETIVO_OPTS.find(o => o.key === objetivo.objetivo)?.label ?? '—'}
            </p>
            <p className='nf-footnote'>
              {VELOCIDAD_OPTS.find(o => o.key === objetivo.velocidad_objetivo)?.label ?? '—'} ·{' '}
              {ACTIVIDAD_OPTS.find(o => o.key === objetivo.nivel_actividad)?.label ?? '—'}
            </p>
          </div>
          {!editObjetivo ? (
            <button onClick={() => setEditObjetivo(true)} className='nf-btn nf-btn--sm nf-btn--tinted' style={{ '--tint': objColor }}>
              <IconEdit size={15} /> Editar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setEditObjetivo(false)} className='nf-btn nf-btn--sm nf-btn--gray'>Cancelar</button>
              <button onClick={guardarObjetivo} disabled={guardando} className='nf-btn nf-btn--sm nf-btn--primary'>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
        </div>

        {editObjetivo && (
          <div className='nf-reveal' style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <p className='nf-caption' style={{ marginBottom: '8px', fontWeight: 600 }}>Objetivo</p>
              <PillGroup options={OBJETIVO_OPTS} value={objetivo.objetivo} color={objColor}
                onChange={v => setObjetivo(o => ({ ...o, objetivo: v }))} />
            </div>
            <div>
              <p className='nf-caption' style={{ marginBottom: '8px', fontWeight: 600 }}>Velocidad</p>
              <PillGroup options={VELOCIDAD_OPTS} value={objetivo.velocidad_objetivo} color='var(--purple)'
                onChange={v => setObjetivo(o => ({ ...o, velocidad_objetivo: v }))} />
            </div>
            <div>
              <p className='nf-caption' style={{ marginBottom: '8px', fontWeight: 600 }}>Nivel de actividad</p>
              <PillGroup options={ACTIVIDAD_OPTS} value={objetivo.nivel_actividad} color='var(--cyan)'
                onChange={v => setObjetivo(o => ({ ...o, nivel_actividad: v }))} />
            </div>
          </div>
        )}
      </Section>

      {/* ── Datos físicos ── */}
      <Section label='Datos físicos'>
        {[
          { key: 'estatura_cm',      label: 'Estatura',      unit: 'cm', color: 'var(--blue)',   icon: <IconRuler  size={18} />, min: 100, max: 250 },
          { key: 'peso_inicial_kg',  label: 'Peso actual',   unit: 'kg', color: 'var(--green)',  icon: <IconWeight size={18} />, min: 30,  max: 300 },
          { key: 'peso_objetivo_kg', label: 'Peso objetivo', unit: 'kg', color: 'var(--orange)', icon: <IconTarget size={18} />, min: 30,  max: 300 },
        ].map(({ key, label, unit, color, icon, min, max }) => (
          <Row key={key} icon={icon} tint={color} label={label}>
            <NumInput
              value={objetivo[key]} color={color} unit={unit} min={min} max={max} label={label}
              onChange={v => setObjetivo(o => ({ ...o, [key]: v }))}
            />
          </Row>
        ))}
        <div style={{ padding: '10px 16px 14px' }}>
          <button className='nf-btn nf-btn--tinted nf-btn--block' onClick={guardarObjetivo} disabled={guardando}>
            <IconCheck size={17} /> {guardando ? 'Guardando…' : 'Guardar y recalcular metas'}
          </button>
        </div>
      </Section>

      {/* ── Metas diarias ── */}
      <h3 className='nf-section-label' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Metas diarias
        {!editMetas ? (
          <button onClick={() => setEditMetas(true)} className='nf-btn nf-btn--plain' style={{ minHeight: '32px', textTransform: 'none', letterSpacing: 0, fontSize: '15px' }}>
            Editar
          </button>
        ) : (
          <span style={{ display: 'flex', gap: '4px', textTransform: 'none', letterSpacing: 0 }}>
            <button onClick={() => setEditMetas(false)} className='nf-btn nf-btn--plain' style={{ minHeight: '32px', fontSize: '15px', color: 'var(--label-2)' }}>
              Cancelar
            </button>
            <button onClick={guardarMetas} disabled={guardando} className='nf-btn nf-btn--plain' style={{ minHeight: '32px', fontSize: '15px' }}>
              {guardando ? '…' : 'Guardar'}
            </button>
          </span>
        )}
      </h3>
      <div className='nf-card' style={{ overflow: 'hidden' }}>
        {[
          { key: 'meta_calorias', label: 'Calorías', unit: 'kcal', color: 'var(--orange)', icon: <IconFlame   size={18} />, min: 1200, max: 4000 },
          { key: 'meta_proteina', label: 'Proteína', unit: 'g',    color: 'var(--green)',  icon: <IconMeat    size={18} />, min: 50,   max: 300  },
          { key: 'meta_carbos',   label: 'Carbos',   unit: 'g',    color: 'var(--blue)',   icon: <IconWheat   size={18} />, min: 50,   max: 500  },
          { key: 'meta_grasas',   label: 'Grasas',   unit: 'g',    color: 'var(--purple)', icon: <IconDroplet size={18} />, min: 20,   max: 200  },
        ].map(({ key, label, unit, color, icon, min, max }) => (
          <Row key={key} icon={icon} tint={color} label={label}>
            {editMetas ? (
              <NumInput
                value={metas[key]} color={color} unit={unit} min={min} max={max} label={label}
                onChange={v => setMetas(m => ({ ...m, [key]: v }))}
              />
            ) : (
              <span className='nf-num' style={{ fontSize: '16px', fontWeight: 600, color }}>
                {metas[key]} <span className='nf-caption' style={{ fontWeight: 400 }}>{unit}</span>
              </span>
            )}
          </Row>
        ))}
      </div>

      {/* ── Preferencias ── */}
      <Section
        label='Preferencias'
        footer={suscrito ? 'Bruce te enviará un mensaje motivacional cada día.' : 'Activa para que Bruce te escriba cada día.'}
      >
        <Row icon={<IconBell size={18} />} tint='var(--green)' label='Mensajes de Bruce'>
          <button
            role='switch'
            aria-checked={suscrito}
            aria-label='Mensajes de Bruce'
            className='nf-switch'
            onClick={toggleNotificaciones}
            disabled={cargandoBell}
            style={{ opacity: cargandoBell ? 0.6 : 1 }}
          />
        </Row>
        <Row icon={<IconLanguage size={18} />} tint='var(--blue)' label='Idioma'>
          <Segmented
            label='Idioma'
            value={lang}
            onChange={setLang}
            options={[{ id: 'es', label: 'ES' }, { id: 'en', label: 'EN' }]}
            style={{ width: '112px' }}
          />
        </Row>
      </Section>

      {/* ── Sesión ── */}
      <div className='nf-card' style={{ marginTop: '28px', overflow: 'hidden' }}>
        <button className='nf-row nf-press-soft' onClick={handleLogout} style={{ justifyContent: 'center', color: 'var(--red)', fontWeight: 600, fontSize: '16px' }}>
          <IconLogout size={18} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
