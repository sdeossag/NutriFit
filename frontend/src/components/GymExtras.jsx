// Hojas de Gym: la biblioteca de ejercicios y "Bruce arma tu semana".
import { useState } from 'react'
import { IconCheck, IconSearch, IconSparkles, IconTrash, IconChevronRight } from '@tabler/icons-react'
import { editarEjercicio, eliminarEjercicio, generarRutina } from '../api'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'
import Sheet, { SheetHeader } from './Sheet'
import Segmented from './Segmented'
import bruceFace from '../assets/bruce-face.webp'

const MUSCULOS = ['Piernas', 'Pecho', 'Hombros', 'Espalda', 'Brazos', 'Core', 'Cardio']
const DIAS_ABR = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function Campo({ etiqueta, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>{etiqueta}</span>
      {children}
    </label>
  )
}

// Edición en el mismo lugar: la fila se abre y muestra el formulario
function FormEjercicio({ ej, onGuardado, onEliminado, onCerrar }) {
  const [f, setF] = useState({ nombre: ej.nombre, musculo: ej.musculo, series: String(ej.series), reps: ej.reps, peso: ej.peso })
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const cambio = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))
  const usado = ej.usado_en ?? []

  const guardar = async () => {
    if (!f.nombre.trim()) return
    setGuardando(true)
    try {
      const r = await editarEjercicio(ej.id, { ...f, nombre: f.nombre.trim(), series: Number(f.series) || 1 })
      haptic(10)
      toast.success(r.rutinas_actualizadas?.length ? `Guardado y actualizado en ${r.rutinas_actualizadas.join(', ')}` : 'Ejercicio guardado')
      onGuardado(r)
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!confirmar) {
      setConfirmar(true)
      setTimeout(() => setConfirmar(false), 3000)
      return
    }
    try {
      await eliminarEjercicio(ej.id)
      toast(usado.length ? `Eliminado. ${usado.join(', ')} lo conserva${usado.length > 1 ? 'n' : ''}.` : `Eliminaste ${ej.nombre}`)
      onEliminado(ej.id)
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo eliminar.')
    }
  }

  return (
    <div className='nf-reveal' style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Campo etiqueta='Nombre'><input className='nf-input' value={f.nombre} onChange={cambio('nombre')} maxLength={200} /></Campo>
      <Campo etiqueta='Músculo'>
        <select className='nf-input' value={MUSCULOS.includes(f.musculo) ? f.musculo : '__otro'} onChange={e => setF(p => ({ ...p, musculo: e.target.value === '__otro' ? '' : e.target.value }))}>
          {MUSCULOS.map(m => <option key={m} value={m}>{m}</option>)}
          <option value='__otro'>Otro…</option>
        </select>
      </Campo>
      {!MUSCULOS.includes(f.musculo) && (
        <Campo etiqueta='¿Cuál?'><input className='nf-input' value={f.musculo} onChange={cambio('musculo')} placeholder='Ej. Glúteos' maxLength={100} /></Campo>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <Campo etiqueta='Series'><input className='nf-input nf-num' type='number' inputMode='numeric' min='1' max='50' value={f.series} onChange={cambio('series')} /></Campo>
        <Campo etiqueta='Reps'><input className='nf-input' value={f.reps} onChange={cambio('reps')} maxLength={50} /></Campo>
        <Campo etiqueta='Peso'><input className='nf-input' value={f.peso} onChange={cambio('peso')} maxLength={50} /></Campo>
      </div>
      {usado.length > 0 && (
        <p className='nf-caption'>Se usa en {usado.join(', ')}. Los cambios también se aplican ahí.</p>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={guardar} disabled={guardando || !f.nombre.trim()} className='nf-btn nf-btn--tinted' style={{ flex: 1 }}>
          <IconCheck size={17} /> Guardar
        </button>
        <button onClick={eliminar} className='nf-btn nf-btn--destructive' aria-live='polite' style={{ padding: confirmar ? '0 14px' : '0 14px' }}>
          <IconTrash size={17} /> {confirmar ? 'Confirmar' : ''}
        </button>
        <button onClick={onCerrar} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--label-2)' }}>Cerrar</button>
      </div>
    </div>
  )
}

export function BibliotecaSheet({ open, onClose, pool, setPool, colorMusculo, onCambioRutinas }) {
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)
  const filtrados = pool.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const grupos = [...new Set(filtrados.map(e => e.musculo))].map(m => [m, filtrados.filter(e => e.musculo === m)])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      large
      label='Mis ejercicios'
      header={
        <>
          <SheetHeader title='Mis ejercicios' right={<button className='nf-btn nf-btn--plain' onClick={onClose}>Listo</button>} />
          <div style={{ padding: '0 16px 12px' }}>
            <label style={{ position: 'relative', display: 'block' }}>
              <IconSearch size={18} color='var(--label-3)' style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type='search' className='nf-input' value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder='Buscar ejercicio'
                aria-label='Buscar ejercicio' style={{ paddingLeft: '38px', background: 'rgba(118,118,128,0.24)', border: 'none' }} />
            </label>
          </div>
        </>
      }
    >
      <div style={{ padding: '0 16px calc(var(--safe-bottom) + 32px)' }}>
        <p className='nf-footnote' style={{ margin: '0 4px 14px' }}>
          Toca un ejercicio para editarlo o eliminarlo. Para crear uno nuevo, hazlo al editar una rutina.
        </p>
        {grupos.length === 0 && <p className='nf-footnote' style={{ textAlign: 'center', padding: '24px 0' }}>No hay ejercicios que coincidan.</p>}
        {grupos.map(([musculo, lista]) => (
          <section key={musculo} style={{ marginBottom: '18px' }}>
            <h3 className='nf-section-label' style={{ color: colorMusculo(musculo) }}>{musculo}</h3>
            <div className='nf-card' style={{ overflow: 'hidden' }}>
              {lista.map(ej => (
                <div key={ej.id} className='nf-row' style={{ display: 'block', padding: 0 }}>
                  <button
                    onClick={() => setEditando(editando === ej.id ? null : ej.id)}
                    aria-expanded={editando === ej.id}
                    className='nf-press-soft'
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px 12px 16px' }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '15px', fontWeight: 500 }}>{ej.nombre}</span>
                      <span className='nf-caption nf-num'>
                        {ej.series}×{ej.reps}{ej.peso && ej.peso !== '—' ? ` · ${ej.peso}` : ''}
                        {ej.usado_en?.length ? ` · en ${ej.usado_en.length} rutina${ej.usado_en.length > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                    <IconChevronRight size={18} color='var(--label-4)' aria-hidden='true'
                      style={{ transform: editando === ej.id ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
                  </button>
                  {editando === ej.id && (
                    <FormEjercicio
                      ej={ej}
                      onCerrar={() => setEditando(null)}
                      onGuardado={(r) => {
                        setPool(prev => prev.map(x => x.id === r.id ? r : x))
                        setEditando(null)
                        if (r.rutinas_actualizadas?.length) onCambioRutinas()
                      }}
                      onEliminado={(id) => { setPool(prev => prev.filter(x => x.id !== id)); setEditando(null) }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

const PASOS = ['Revisando tu objetivo…', 'Eligiendo la división de la semana…', 'Escogiendo ejercicios de tu biblioteca…', 'Cuadrando series y descansos…']

export function GenerarSheet({ open, onClose, tieneSemana, onListo }) {
  const [dias, setDias]       = useState([0, 2, 4])
  const [minutos, setMinutos] = useState(60)
  const [lugar, setLugar]     = useState('gym')
  const [nivel, setNivel]     = useState('principiante')
  const [armando, setArmando] = useState(false)
  const [paso, setPaso]       = useState(0)

  const alternarDia = (d) => { haptic(6); setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()) }

  const armar = async () => {
    setArmando(true)
    setPaso(0)
    const id = setInterval(() => setPaso(p => Math.min(p + 1, PASOS.length - 1)), 2600)
    try {
      const datos = await generarRutina({ dias, minutos, lugar, nivel })
      haptic(30)
      onListo(datos)
    } catch (e) {
      toast.error(e.mensaje || 'Bruce no pudo armar la rutina. Intenta de nuevo.')
    } finally {
      clearInterval(id)
      setArmando(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { if (!armando) onClose() }}
      label='Bruce arma tu semana'
      header={<SheetHeader title='Bruce arma tu semana' left={<button className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--label-2)' }} onClick={onClose} disabled={armando}>Cancelar</button>} />}
    >
      <div style={{ padding: '0 16px calc(var(--safe-bottom) + 24px)' }}>
        {armando ? (
          <div aria-busy='true' aria-live='polite' style={{ textAlign: 'center', padding: '36px 0' }}>
            <img src={bruceFace} alt='' width={64} height={64} style={{ borderRadius: '50%', margin: '0 auto 14px', display: 'block', animation: 'nf-pulse 1.4s ease-in-out infinite' }} />
            <p key={paso} className='nf-headline nf-fade'>{PASOS[paso]}</p>
          </div>
        ) : (<>
          <h3 className='nf-section-label'>¿Qué días entrenas?</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '18px' }}>
            {DIAS_ABR.map((d, i) => (
              <button key={d} onClick={() => alternarDia(i)} aria-pressed={dias.includes(i)} aria-label={NOMBRE_DIA[i]}
                className='nf-chip' style={{ '--tint': 'var(--green)', justifyContent: 'center', padding: 0, minHeight: '44px' }}>
                {d}
              </button>
            ))}
          </div>
          <h3 className='nf-section-label'>Tiempo por sesión</h3>
          <Segmented label='Tiempo por sesión' value={minutos} onChange={setMinutos} style={{ marginBottom: '18px' }}
            options={[30, 45, 60, 90].map(m => ({ id: m, label: `${m} min` }))} />
          <h3 className='nf-section-label'>Dónde</h3>
          <Segmented label='Dónde entrenas' value={lugar} onChange={setLugar} style={{ marginBottom: '18px' }}
            options={[{ id: 'gym', label: 'Gimnasio' }, { id: 'casa', label: 'En casa' }]} />
          <h3 className='nf-section-label'>Tu nivel</h3>
          <Segmented label='Nivel' value={nivel} onChange={setNivel} style={{ marginBottom: '22px' }}
            options={[{ id: 'principiante', label: 'Empiezo' }, { id: 'intermedio', label: 'Intermedio' }, { id: 'avanzado', label: 'Avanzado' }]} />
          {tieneSemana && (
            <p className='nf-caption' style={{ margin: '0 4px 12px' }}>Esto reemplaza tu semana actual. Tus rutinas de ahora quedan guardadas por si las quieres volver a usar.</p>
          )}
          <button onClick={armar} disabled={!dias.length} className='nf-btn nf-btn--primary nf-btn--block nf-btn--lg'>
            <IconSparkles size={18} /> Armar mi semana ({dias.length} {dias.length === 1 ? 'día' : 'días'})
          </button>
        </>)}
      </div>
    </Sheet>
  )
}
