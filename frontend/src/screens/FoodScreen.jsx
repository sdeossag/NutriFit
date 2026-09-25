import { useState, useEffect, useRef } from 'react'
import {
  IconCamera, IconTrash, IconX, IconCheck, IconChevronLeft,
  IconSearch, IconFlame, IconPencil, IconPackage, IconWorld, IconRefresh,
  IconDroplet, IconBottle, IconArrowBackUp, IconToolsKitchen2, IconChevronRight,
} from '@tabler/icons-react'
import {
  getComidas, agregarComida, eliminarComida, analizarFoto,
  getAlacena, agregarAAlacena, editarAlacena, eliminarAlacena,
  usarAlacena, analizarEtiqueta, getAgua, registrarAgua, eliminarAgua,
} from '../api'
import { toast } from '../lib/toast'
import Sheet, { SheetHeader } from '../components/Sheet'
import PlanBruce from '../components/PlanBruce'
import { haptic, useEntrada } from '../lib/motion'
import { fotoABase64 } from '../lib/imagen'
import bruceFace from '../assets/bruce-face.webp'

const hoyISO = () => new Date().toLocaleDateString('en-CA')
const colorConfianza = { alta: 'var(--green)', media: 'var(--orange)', baja: 'var(--red)' }
// Si el servidor no la manda (versión vieja), la meta de antes
const META_AGUA_POR_DEFECTO = 2500
const RAPIDOS = [200, 350, 500, 750]

const ALACENA_INICIAL = [
  { nombre: 'Huevos con jamón',           descripcion: '2 huevos + 2 lonchas', calorias: 280, proteina: 24, carbos: 2,  grasas: 18 },
  { nombre: 'Pollo + plátano + fríjoles', descripcion: 'Almuerzo clásico',      calorias: 620, proteina: 48, carbos: 62, grasas: 12 },
  { nombre: 'Salmón air fryer',           descripcion: '180g salmón + limón',   calorias: 370, proteina: 40, carbos: 0,  grasas: 22 },
  { nombre: 'Omelette',                   descripcion: '3 huevos + queso',      calorias: 320, proteina: 26, carbos: 3,  grasas: 22 },
  { nombre: 'Sanduche integral',          descripcion: 'Pan + pavo + queso',    calorias: 380, proteina: 28, carbos: 36, grasas: 10 },
  { nombre: 'Yogur griego + arándanos',   descripcion: 'Snack proteico',        calorias: 180, proteina: 15, carbos: 20, grasas: 3  },
  { nombre: 'Banano + crema de maní',     descripcion: '1 banano + 1.5 cdas',   calorias: 250, proteina: 7,  carbos: 32, grasas: 11 },
  { nombre: 'Pasta pesto',                descripcion: '150g pasta + pesto',    calorias: 480, proteina: 16, carbos: 68, grasas: 18 },
]

const soloMacros = (x) => ({
  nombre: x.nombre, descripcion: x.descripcion || '',
  calorias: x.calorias, proteina: x.proteina, carbos: x.carbos, grasas: x.grasas,
})

// ── Piezas ────────────────────────────────────────────────────────────────
function BruceAvatar({ size = 36, pulsing = false }) {
  return (
    <img
      src={bruceFace} alt='' width={size} height={size}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
        background: 'linear-gradient(135deg, #064e3b, #16a34a)',
        animation: pulsing ? 'nf-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    />
  )
}

function MacrosInline({ p, c, g, size = 13 }) {
  return (
    <span className='nf-num' style={{ display: 'inline-flex', gap: '10px', fontSize: `${size}px`, fontWeight: 600 }}>
      <span style={{ color: 'var(--green)' }}>P {p}g</span>
      <span style={{ color: 'var(--blue)' }}>C {c}g</span>
      <span style={{ color: 'var(--orange)' }}>G {g}g</span>
    </span>
  )
}

function MacroResumen({ kcal, p, c, g, grande = false }) {
  const items = [
    { v: kcal, u: 'kcal', color: 'var(--label)' },
    { v: `${p}g`, u: 'proteína', color: 'var(--green)' },
    { v: `${c}g`, u: 'carbos', color: 'var(--blue)' },
    { v: `${g}g`, u: 'grasas', color: 'var(--orange)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
      {items.map(({ v, u, color }) => (
        <div key={u}>
          <p className='nf-num' style={{ fontSize: grande ? '22px' : '17px', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{v}</p>
          <p className='nf-caption'>{u}</p>
        </div>
      ))}
    </div>
  )
}

// ── Resultado de la IA ────────────────────────────────────────────────────
function ResultadoIA({ resultado, onConfirmar, onDescartar, modo, guardando }) {
  const [corrigiendo,    setCorrigiendo]    = useState(false)
  const [correccion,     setCorreccion]     = useState('')
  const [reanalizado,    setReanalizado]    = useState(false)
  const [cargando,       setCargando]       = useState(false)
  const [resultadoLocal, setResultadoLocal] = useState(resultado)
  const b64Ref = useRef(resultado._b64)

  useEffect(() => {
    setResultadoLocal(resultado)
    setReanalizado(false)
    setCorrigiendo(false)
    setCorreccion('')
    b64Ref.current = resultado._b64
  }, [resultado])

  const handleReanalizar = async () => {
    if (!correccion.trim()) return
    setCargando(true)
    try {
      const fn = modo === 'etiqueta' ? analizarEtiqueta : analizarFoto
      const nuevo = await fn({
        imagen:          b64Ref.current,
        correccion:      correccion.trim(),
        nombre_anterior: resultadoLocal.nombre,
      })
      setResultadoLocal({ ...nuevo, _b64: b64Ref.current, modo })
      setReanalizado(true)
      setCorrigiendo(false)
      setCorreccion('')
    } catch (e) {
      toast.error(e.mensaje || 'Bruce no pudo re-analizar la foto. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  const col = colorConfianza[resultadoLocal.confianza] ?? 'var(--green)'

  return (
    <section className='nf-card nf-reveal' style={{ padding: '16px', marginBottom: '20px', boxShadow: 'inset 0 0 0 0.5px rgba(74,222,128,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <BruceAvatar size={30} pulsing={cargando} />
        <p className='nf-footnote' style={{ flex: 1 }}>{cargando ? 'Bruce está re-analizando…' : 'Esto es lo que veo:'}</p>
        <button onClick={onDescartar} className='nf-icon-btn nf-icon-btn--sm' aria-label='Descartar resultado'>
          <IconX size={18} />
        </button>
      </div>

      {cargando ? (
        <div>
          <div className='nf-skeleton' style={{ height: '24px', width: '70%', marginBottom: '10px' }} />
          <div className='nf-skeleton' style={{ height: '52px' }} />
        </div>
      ) : (
        <>
          <input
            value={resultadoLocal.nombre}
            onChange={e => setResultadoLocal(p => ({ ...p, nombre: e.target.value }))}
            aria-label='Nombre del alimento'
            style={{
              width: '100%', background: 'transparent', border: 'none',
              borderBottom: '0.5px solid var(--separator)',
              fontSize: '19px', fontWeight: 700, letterSpacing: '-0.01em',
              padding: '2px 0 8px', marginBottom: '8px', outline: 'none',
            }}
          />
          {resultadoLocal.descripcion && (
            <p className='nf-footnote' style={{ marginBottom: '10px' }}>{resultadoLocal.descripcion}</p>
          )}

          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className='nf-badge' style={{ '--tint': col }}>Confianza {resultadoLocal.confianza}</span>
            {resultadoLocal.fuente === 'internet' && (
              <span className='nf-badge' style={{ '--tint': 'var(--blue)' }}><IconWorld size={12} /> Datos de internet</span>
            )}
            {reanalizado && <span className='nf-badge' style={{ '--tint': 'var(--orange)' }}><IconCheck size={12} /> Corregido</span>}
          </div>

          <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '14px', padding: '12px 8px', marginBottom: '12px' }}>
            <MacroResumen kcal={resultadoLocal.calorias} p={resultadoLocal.proteina} c={resultadoLocal.carbos} g={resultadoLocal.grasas} />
          </div>

          {!corrigiendo ? (
            <button onClick={() => setCorrigiendo(true)} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--label-2)', padding: 0, minHeight: '36px', fontSize: '14px', fontWeight: 500 }}>
              <IconRefresh size={16} /> ¿Algo está mal? Corrígeme
            </button>
          ) : (
            <div className='nf-reveal' style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                autoFocus
                className='nf-input'
                placeholder='Ej: son frisnacks, pollo apanado'
                value={correccion}
                enterKeyHint='send'
                onChange={e => setCorreccion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReanalizar()}
              />
              <button onClick={handleReanalizar} disabled={!correccion.trim()} className='nf-btn nf-btn--primary' style={{ padding: '0 14px' }}>
                Enviar
              </button>
              <button onClick={() => { setCorrigiendo(false); setCorreccion('') }} className='nf-icon-btn nf-icon-btn--sm' aria-label='Cancelar corrección'>
                <IconX size={18} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {modo === 'etiqueta' ? (
              <>
                <button onClick={() => onConfirmar('alacena', resultadoLocal)} disabled={guardando} className='nf-btn nf-btn--tinted' style={{ flex: 1, '--tint': 'var(--blue)' }}>
                  Solo alacena
                </button>
                <button onClick={() => onConfirmar('ambos', resultadoLocal)} disabled={guardando} className='nf-btn nf-btn--primary' style={{ flex: 1.4 }}>
                  <IconCheck size={18} /> Alacena + hoy
                </button>
              </>
            ) : (
              <>
                <button onClick={() => onConfirmar('dia', resultadoLocal)} disabled={guardando} className='nf-btn nf-btn--tinted' style={{ flex: 1 }}>
                  Solo hoy
                </button>
                <button onClick={() => onConfirmar('ambos', resultadoLocal)} disabled={guardando} className='nf-btn nf-btn--primary' style={{ flex: 1.4 }}>
                  <IconCheck size={18} /> Hoy + alacena
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ── Selector de porciones ─────────────────────────────────────────────────
function SelectorPorciones({ alimento, onConfirmar, guardando }) {
  const [porciones, setPorciones] = useState(1)
  const opciones = [0.5, 1, 1.5, 2, 2.5, 3]

  const cal = Math.round(alimento.calorias * porciones)
  const pro = +(alimento.proteina * porciones).toFixed(1)
  const car = +(alimento.carbos   * porciones).toFixed(1)
  const gra = +(alimento.grasas   * porciones).toFixed(1)

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <p className='nf-title-2' style={{ marginBottom: '2px' }}>{alimento.nombre}</p>
      {alimento.descripcion && <p className='nf-subhead' style={{ marginBottom: '20px' }}>{alimento.descripcion}</p>}

      <h3 className='nf-section-label' style={{ marginTop: '8px' }}>Porciones</h3>
      <div role='radiogroup' aria-label='Porciones' style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '20px' }}>
        {opciones.map(op => (
          <button
            key={op}
            role='radio'
            aria-checked={porciones === op}
            className='nf-chip nf-num'
            onClick={() => setPorciones(op)}
            style={{ justifyContent: 'center', padding: 0, minHeight: '44px', borderRadius: '12px' }}
          >
            {op}×
          </button>
        ))}
      </div>

      <div className='nf-card' style={{ padding: '16px 8px', marginBottom: '16px', background: 'rgba(74,222,128,0.06)' }}>
        <MacroResumen kcal={cal} p={pro} c={car} g={gra} grande />
      </div>

      <button onClick={() => onConfirmar(porciones)} disabled={guardando} className='nf-btn nf-btn--primary nf-btn--lg nf-btn--block'>
        <IconCheck size={19} /> {guardando ? 'Agregando…' : 'Agregar al día'}
      </button>
    </div>
  )
}

// ── Editar alimento ───────────────────────────────────────────────────────
function EditarAlimento({ form, setForm, onGuardar, guardando }) {
  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <input className='nf-input' placeholder='Nombre' aria-label='Nombre' value={form.nombre}
        onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
      <input className='nf-input' placeholder='Descripción (ej: 3 galletas 34g)' aria-label='Descripción' value={form.descripcion}
        onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { key: 'calorias', label: 'Calorías', unit: 'kcal', mode: 'numeric' },
          { key: 'proteina', label: 'Proteína', unit: 'g',    mode: 'decimal' },
          { key: 'carbos',   label: 'Carbos',   unit: 'g',    mode: 'decimal' },
          { key: 'grasas',   label: 'Grasas',   unit: 'g',    mode: 'decimal' },
        ].map(f => (
          <label key={f.key} style={{ position: 'relative', display: 'block' }}>
            <span className='nf-caption' style={{ display: 'block', margin: '0 0 4px 4px', fontWeight: 600 }}>{f.label}</span>
            <input
              type='number' inputMode={f.mode}
              className='nf-input nf-num'
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ paddingRight: '44px' }}
            />
            <span className='nf-caption' style={{ position: 'absolute', right: '14px', bottom: '14px', pointerEvents: 'none' }}>{f.unit}</span>
          </label>
        ))}
      </div>
      <button onClick={onGuardar} disabled={guardando || !form.nombre} className='nf-btn nf-btn--primary nf-btn--lg nf-btn--block' style={{ marginTop: '6px' }}>
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}

// ── FoodScreen ────────────────────────────────────────────────────────────
export default function FoodScreen({ screen }) {
  const [comidas,    setComidas]    = useState([])
  const [alacena,    setAlacena]    = useState([])
  const [busqueda,   setBusqueda]   = useState('')
  const [cargando,   setCargando]   = useState(true)
  const [analizando, setAnalizando] = useState(false)
  const [resultado,  setResultado]  = useState(null)
  const [guardando,  setGuardando]  = useState(false)
  const [modal,      setModal]      = useState('closed')   // closed | alacena | porciones | editar
  const [seleccionado, setSeleccionado] = useState(null)
  const [formEditar,   setFormEditar]   = useState(null)

  // Agua
  const [aguaMl,        setAguaMl]        = useState(0)
  const [metaAgua,      setMetaAgua]      = useState(META_AGUA_POR_DEFECTO)   // según tu peso
  const [aguaLogs,      setAguaLogs]      = useState([])   // [{ id, cantidad_ml }]
  const [termoMl,       setTermoMl]       = useState(() => parseInt(localStorage.getItem('nutrifit_termo_ml') || '0'))
  const [editandoTermo, setEditandoTermo] = useState(false)
  const [termoInput,    setTermoInput]    = useState('')

  const fileInputPlato    = useRef(null)
  const fileInputEtiqueta = useRef(null)
  const entrar = useEntrada(screen === 'food')

  const cargarComidas = () => {
    getComidas(hoyISO())
      .then(data => setComidas(data))
      .catch(() => toast.error('No se pudieron cargar tus comidas'))
      .finally(() => setCargando(false))
  }

  const cargarAgua = () => {
    getAgua(hoyISO()).then(data => {
      setAguaMl(data.total_ml ?? 0)
      if (data.meta_ml) setMetaAgua(data.meta_ml)
      setAguaLogs(data.registros ?? [])
    }).catch(() => {})
  }

  useEffect(() => {
    if (screen !== 'food') return
    cargarComidas()
    cargarAgua()
    getAlacena().then(data => {
      if (data.length === 0) {
        Promise.all(ALACENA_INICIAL.map(a => agregarAAlacena(a).catch(() => {}))).then(() => {
          getAlacena().then(setAlacena).catch(() => {})
        })
      } else {
        setAlacena(data)
      }
    }).catch(() => {})
  }, [screen])

  const total = comidas.reduce(
    (acc, c) => ({ kcal: acc.kcal + c.calorias, pro: acc.pro + c.proteina, car: acc.car + c.carbos, gra: acc.gra + c.grasas }),
    { kcal: 0, pro: 0, car: 0, gra: 0 }
  )

  const procesarFoto = async (file, modo) => {
    if (!file) return
    if (fileInputPlato.current) fileInputPlato.current.value = ''
    if (fileInputEtiqueta.current) fileInputEtiqueta.current.value = ''
    setAnalizando(modo)
    setResultado(null)
    try {
      // Las etiquetas necesitan más resolución para leer la tabla nutricional
      const b64  = await fotoABase64(file, modo === 'etiqueta' ? 1600 : 1280)
      const fn   = modo === 'etiqueta' ? analizarEtiqueta : analizarFoto
      const data = await fn({ imagen: b64 })
      if (data.es_comida === false) {
        toast('Bruce no ve comida en esta foto. Intenta con otra.')
        return
      }
      setResultado({ ...data, modo, _b64: b64 })
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo analizar la imagen.')
    } finally {
      setAnalizando(false)
    }
  }

  const confirmarResultado = async (accion, datos) => {
    if (!datos) return
    setGuardando(true)
    try {
      if (accion === 'alacena' || accion === 'ambos') {
        const nuevo = await agregarAAlacena(soloMacros(datos))
        setAlacena(prev => [nuevo, ...prev])
      }
      if (accion === 'dia' || accion === 'ambos') {
        await agregarComida({ ...datos, fecha: hoyISO() })
        cargarComidas()
      }
      setResultado(null)
      haptic()
      toast.success(accion === 'alacena' ? 'Guardado en tu alacena' : 'Agregado a hoy')
    } catch { toast.error('Error al guardar.') }
    finally { setGuardando(false) }
  }

  const confirmarPorciones = async (porciones) => {
    if (!seleccionado) return
    setGuardando(true)
    try {
      await usarAlacena(seleccionado.id, { porciones, fecha: hoyISO() })
      cargarComidas()
      setModal('closed')
      setSeleccionado(null)
      haptic()
      toast.success(`${seleccionado.nombre} agregado`)
    } catch { toast.error('Error al agregar.') }
    finally { setGuardando(false) }
  }

  const guardarEdicion = async () => {
    if (!formEditar) return
    setGuardando(true)
    try {
      const actualizado = await editarAlacena(formEditar.id, {
        nombre:      formEditar.nombre,
        descripcion: formEditar.descripcion,
        calorias:    parseInt(formEditar.calorias)   || 0,
        proteina:    parseFloat(formEditar.proteina) || 0,
        carbos:      parseFloat(formEditar.carbos)   || 0,
        grasas:      parseFloat(formEditar.grasas)   || 0,
      })
      setAlacena(prev => prev.map(a => a.id === actualizado.id ? actualizado : a))
      setModal('alacena')
      setFormEditar(null)
    } catch { toast.error('Error al editar.') }
    finally { setGuardando(false) }
  }

  // Borrar con "Deshacer": la fila desaparece y el aviso sale al instante; el
  // borrado corre en segundo plano y deshacer vuelve a crear el registro.
  const borrarDeAlacena = (item) => {
    setAlacena(prev => prev.filter(a => a.id !== item.id))
    const borrado = eliminarAlacena(item.id)
    borrado.catch(() => {
      setAlacena(prev => [item, ...prev])
      toast.error('Error al eliminar.')
    })
    toast(`"${item.nombre}" eliminado`, {
      action: {
        label: 'Deshacer',
        onClick: () => borrado
          .then(() => agregarAAlacena(soloMacros(item)))
          .then(nuevo => setAlacena(prev => [nuevo, ...prev]))
          .catch(() => toast.error('No se pudo restaurar')),
      },
    })
  }

  const borrarComida = (comida) => {
    setComidas(prev => prev.filter(c => c.id !== comida.id))
    const borrado = eliminarComida(comida.id)
    borrado.catch(() => {
      cargarComidas()
      toast.error('Error al eliminar.')
    })
    toast(`${comida.nombre} eliminada`, {
      action: {
        label: 'Deshacer',
        onClick: () => borrado
          .then(() => agregarComida({ ...soloMacros(comida), fecha: comida.fecha ?? hoyISO() }))
          .then(cargarComidas)
          .catch(() => toast.error('No se pudo restaurar')),
      },
    })
  }

  const agregarAgua = async (ml) => {
    haptic(6)
    setAguaMl(prev => prev + ml)   // optimista: la barra responde al instante
    try {
      const data = await registrarAgua({ cantidad_ml: ml, fecha: hoyISO() })
      setAguaMl(data.total_ml)
      setAguaLogs(prev => [{ id: data.id, cantidad_ml: ml }, ...prev])
    } catch {
      setAguaMl(prev => Math.max(0, prev - ml))
      toast.error('Error al registrar agua.')
    }
  }

  const deshacerUltimoAgua = async () => {
    if (aguaLogs.length === 0) return
    const ultimo = aguaLogs[0]
    try {
      await eliminarAgua(ultimo.id)
      setAguaLogs(prev => prev.slice(1))
      setAguaMl(prev => Math.max(0, prev - ultimo.cantidad_ml))
    } catch { toast.error('Error al eliminar el registro.') }
  }

  const guardarTermo = (ml) => {
    const v = parseInt(ml)
    if (!v || v <= 0) return
    localStorage.setItem('nutrifit_termo_ml', String(v))
    setTermoMl(v)
    setEditandoTermo(false)
  }

  const alacenaFiltrada = alacena.filter(a =>
    a.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (a.descripcion ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const cerrarModal = () => { setModal('closed'); setSeleccionado(null); setFormEditar(null) }
  const volverAAlacena = () => { setModal('alacena'); setSeleccionado(null); setFormEditar(null) }

  const pctAgua = Math.min(aguaMl / metaAgua, 1)
  const aguaCompleta = pctAgua >= 1

  const tituloModal = { alacena: 'Mi alacena', porciones: 'Agregar', editar: 'Editar alimento' }[modal] ?? ''

  return (
    <div style={{ padding: 'calc(var(--safe-top) + 20px) 16px 0' }}>

      {/* ── Header ── */}
      <header className={entrar ? 'nf-enter' : undefined} style={{ padding: '0 4px', marginBottom: '20px' }}>
        <h1 className='nf-large-title'>Comidas</h1>
        <p className='nf-subhead'>Registra lo que comes hoy</p>
      </header>

      {/* ── Cámara ── */}
      <div className={entrar ? 'nf-enter' : undefined} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px', animationDelay: '60ms' }}>
        {[
          { modo: 'plato',    ref: fileInputPlato,    Icon: IconCamera,  tint: 'var(--green)', titulo: 'Foto del plato',    sub: 'Bruce estima los macros', cargandoTxt: 'Bruce analizando…' },
          { modo: 'etiqueta', ref: fileInputEtiqueta, Icon: IconPackage, tint: 'var(--blue)',  titulo: 'Foto de etiqueta',  sub: 'Se guarda en tu alacena',  cargandoTxt: 'Bruce leyendo…' },
        ].map(b => (
          <button
            key={b.modo}
            onClick={() => b.ref.current?.click()}
            disabled={!!analizando}
            className='nf-card nf-press-soft'
            style={{
              padding: '16px 14px', textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: '10px',
              background: `color-mix(in srgb, ${b.tint} 9%, var(--surface-1))`,
              opacity: analizando && analizando !== b.modo ? 0.5 : 1,
            }}
          >
            <span style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: `color-mix(in srgb, ${b.tint} 18%, transparent)`, color: b.tint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {analizando === b.modo ? <BruceAvatar size={28} pulsing /> : <b.Icon size={22} strokeWidth={1.8} />}
            </span>
            <span>
              <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: b.tint }}>
                {analizando === b.modo ? b.cargandoTxt : b.titulo}
              </span>
              <span className='nf-caption' style={{ display: 'block', marginTop: '2px' }}>{b.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <input ref={fileInputPlato}    type='file' accept='image/*' capture='environment' hidden onChange={e => procesarFoto(e.target.files[0], 'plato')} />
      <input ref={fileInputEtiqueta} type='file' accept='image/*' capture='environment' hidden onChange={e => procesarFoto(e.target.files[0], 'etiqueta')} />

      {resultado && (
        <ResultadoIA
          resultado={resultado}
          modo={resultado.modo}
          guardando={guardando}
          onConfirmar={confirmarResultado}
          onDescartar={() => setResultado(null)}
        />
      )}

      <PlanBruce visible={screen === 'food'} onRegistrada={cargarComidas} />

      {/* ── Hoy ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 10px' }}>
        <h2 className='nf-title-3'>Hoy</h2>
        <p className='nf-num' style={{ color: 'var(--green)', fontSize: '16px', fontWeight: 700 }}>{Math.round(total.kcal).toLocaleString('es-CO')} kcal</p>
      </div>

      {cargando ? (
        <div className='nf-card' style={{ overflow: 'hidden', marginBottom: '16px' }} aria-busy='true'>
          {[0, 1].map(i => (
            <div key={i} className='nf-row'>
              <div style={{ flex: 1 }}>
                <div className='nf-skeleton' style={{ width: '55%', height: 15, marginBottom: 8 }} />
                <div className='nf-skeleton' style={{ width: '40%', height: 12 }} />
              </div>
              <div className='nf-skeleton' style={{ width: 44, height: 20 }} />
            </div>
          ))}
        </div>
      ) : comidas.length === 0 && !resultado ? (
        <div className='nf-card' style={{ padding: '28px 20px', textAlign: 'center', marginBottom: '16px' }}>
          <IconToolsKitchen2 size={28} color='var(--label-3)' style={{ margin: '0 auto 8px', display: 'block' }} />
          <p className='nf-headline' style={{ marginBottom: '4px' }}>Aún no registras comidas</p>
          <p className='nf-footnote'>Toma una foto o elige algo de tu alacena.</p>
        </div>
      ) : comidas.length > 0 && (
        <div className='nf-card' style={{ overflow: 'hidden', marginBottom: '16px' }}>
          {comidas.map(c => (
            <div key={c.id} className='nf-row' style={{ alignItems: 'center', paddingRight: '4px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '16px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</p>
                {c.descripcion && (
                  <p className='nf-caption' style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                    {c.descripcion}
                  </p>
                )}
                <MacrosInline p={c.proteina} c={c.carbos} g={c.grasas} size={12} />
              </div>
              <p className='nf-num' style={{ textAlign: 'right', fontSize: '17px', fontWeight: 700, lineHeight: 1.1 }}>
                {c.calorias}<span className='nf-caption' style={{ display: 'block', fontWeight: 500 }}>kcal</span>
              </p>
              <button onClick={() => borrarComida(c)} className='nf-icon-btn' aria-label={`Eliminar ${c.nombre}`} style={{ color: 'var(--label-3)' }}>
                <IconTrash size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Alacena ── */}
      <button
        onClick={() => { setModal('alacena'); setBusqueda('') }}
        className='nf-card nf-row nf-press-soft'
        style={{ marginBottom: '16px', minHeight: '60px' }}
      >
        <span className='nf-row-icon'><IconToolsKitchen2 size={18} /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '16px', fontWeight: 600 }}>Mi alacena</span>
          <span className='nf-caption'>{alacena.length} alimentos guardados</span>
        </span>
        <IconChevronRight size={20} color='var(--label-4)' />
      </button>

      {/* ── Agua ── */}
      <section className='nf-card' style={{ padding: '16px' }} aria-label='Agua'>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconDroplet size={20} color='var(--cyan)' />
            <span className='nf-headline'>Agua</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className='nf-num' style={{ fontSize: '15px', fontWeight: 700, color: aguaCompleta ? 'var(--green)' : 'var(--cyan)' }}>
              {+(aguaMl / 1000).toFixed(2)} / {metaAgua / 1000} L
            </span>
            {aguaLogs.length > 0 && (
              <button onClick={deshacerUltimoAgua} className='nf-icon-btn nf-icon-btn--sm' aria-label='Deshacer último registro de agua'>
                <IconArrowBackUp size={18} />
              </button>
            )}
          </div>
        </div>

        <div style={{ height: '8px', background: 'rgba(34,211,238,0.12)', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{
            height: '100%', width: '100%', borderRadius: '4px',
            background: aguaCompleta ? 'var(--green)' : 'var(--cyan)',
            transform: `scaleX(${pctAgua})`, transformOrigin: 'left',
            transition: 'transform 500ms var(--ease-out), background-color 300ms ease',
          }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {RAPIDOS.map(ml => (
            <button key={ml} onClick={() => agregarAgua(ml)} className='nf-btn nf-btn--tinted nf-num' style={{ '--tint': 'var(--cyan)', padding: 0, fontSize: '14px' }}>
              +{ml}
            </button>
          ))}
        </div>

        {!editandoTermo && termoMl > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => agregarAgua(termoMl)} className='nf-btn nf-btn--tinted' style={{ '--tint': 'var(--cyan)', flex: 1 }}>
              <IconBottle size={18} /> Mi termo · {termoMl} ml
            </button>
            <button onClick={() => { setEditandoTermo(true); setTermoInput(String(termoMl)) }} className='nf-btn nf-btn--gray'>
              Editar
            </button>
          </div>
        )}

        {!editandoTermo && termoMl === 0 && (
          <button onClick={() => { setEditandoTermo(true); setTermoInput('') }} className='nf-btn nf-btn--plain nf-btn--block' style={{ '--tint': 'var(--cyan)', marginTop: '6px', fontSize: '14px' }}>
            <IconBottle size={17} /> Guardar mi termo o botella
          </button>
        )}

        {editandoTermo && (
          <div className='nf-reveal' style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <input
              autoFocus
              type='number'
              inputMode='numeric'
              enterKeyHint='done'
              className='nf-input'
              placeholder='Capacidad en ml (ej: 600)'
              aria-label='Capacidad del termo en mililitros'
              value={termoInput}
              onChange={e => setTermoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && guardarTermo(termoInput)}
              style={{ '--tint': 'var(--cyan)' }}
            />
            <button
              onClick={() => guardarTermo(termoInput)}
              disabled={!termoInput || parseInt(termoInput) <= 0}
              className='nf-btn nf-btn--primary'
              style={{ '--tint': 'var(--cyan)' }}
            >
              Guardar
            </button>
            <button onClick={() => setEditandoTermo(false)} className='nf-icon-btn nf-icon-btn--sm' aria-label='Cancelar'>
              <IconX size={18} />
            </button>
          </div>
        )}
      </section>

      {/* ════════ Hoja de alacena ════════ */}
      <Sheet
        open={modal !== 'closed'}
        onClose={cerrarModal}
        large
        label={tituloModal}
        header={
          <SheetHeader
            title={tituloModal}
            left={modal !== 'alacena' && (
              <button className='nf-btn nf-btn--plain' onClick={volverAAlacena} style={{ padding: '0 4px', gap: '0' }}>
                <IconChevronLeft size={24} strokeWidth={2.2} /> Alacena
              </button>
            )}
            right={<button className='nf-btn nf-btn--plain' onClick={cerrarModal}>Listo</button>}
          />
        }
      >
        {modal === 'alacena' && (
          <div style={{ padding: '0 16px calc(var(--safe-bottom) + 24px)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-2)', padding: '4px 0 12px' }}>
              <label style={{ position: 'relative', display: 'block' }}>
                <IconSearch size={18} color='var(--label-3)' style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type='search'
                  enterKeyHint='search'
                  className='nf-input'
                  placeholder='Buscar alimento'
                  aria-label='Buscar alimento'
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={{ paddingLeft: '38px', background: 'rgba(118,118,128,0.24)', border: 'none' }}
                />
              </label>
            </div>

            {alacenaFiltrada.length === 0 ? (
              <p className='nf-subhead' style={{ textAlign: 'center', padding: '32px 0' }}>
                {busqueda ? `Nada coincide con "${busqueda}"` : 'Tu alacena está vacía'}
              </p>
            ) : (
              <div className='nf-card' style={{ overflow: 'hidden', background: 'var(--surface-3)' }}>
                {alacenaFiltrada.map(a => (
                  <div key={a.id} className='nf-row' style={{ padding: 0 }}>
                    <button
                      onClick={() => { setSeleccionado(a); setModal('porciones') }}
                      className='nf-press-soft'
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '12px 0 12px 16px' }}
                    >
                      <span style={{ display: 'block', fontSize: '16px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
                      {a.descripcion && <span className='nf-caption' style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descripcion}</span>}
                      <span style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                        <span className='nf-num' style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '13px', fontWeight: 700 }}>
                          <IconFlame size={13} color='var(--orange)' /> {a.calorias}
                        </span>
                        <MacrosInline p={a.proteina} c={a.carbos} g={a.grasas} size={12} />
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setFormEditar({ ...a, calorias: String(a.calorias), proteina: String(a.proteina), carbos: String(a.carbos), grasas: String(a.grasas) })
                        setModal('editar')
                      }}
                      className='nf-icon-btn'
                      aria-label={`Editar ${a.nombre}`}
                    >
                      <IconPencil size={18} />
                    </button>
                    <button onClick={() => borrarDeAlacena(a)} className='nf-icon-btn' aria-label={`Eliminar ${a.nombre}`} style={{ color: 'var(--label-3)', marginRight: '4px' }}>
                      <IconTrash size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {modal === 'porciones' && seleccionado && (
          <SelectorPorciones alimento={seleccionado} onConfirmar={confirmarPorciones} guardando={guardando} />
        )}

        {modal === 'editar' && formEditar && (
          <EditarAlimento form={formEditar} setForm={setFormEditar} onGuardar={guardarEdicion} guardando={guardando} />
        )}
      </Sheet>
    </div>
  )
}
