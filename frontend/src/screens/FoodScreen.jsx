import { useState, useEffect, useRef } from 'react'
import {
  IconCamera, IconPlus, IconTrash, IconX, IconCheck,
  IconSearch, IconFlame, IconPencil, IconPackage, IconWorld, IconRefresh,
  IconDroplet, IconBottle,
} from '@tabler/icons-react'
import {
  getComidas, agregarComida, eliminarComida, analizarFoto,
  getAlacena, agregarAAlacena, editarAlacena, eliminarAlacena,
  usarAlacena, analizarEtiqueta, getAgua, registrarAgua, eliminarAgua,
} from '../api'
import bruceFace from '../assets/bruce-face.png'

const hoyISO = () => new Date().toLocaleDateString('en-CA')
const colorConfianza = { alta: '#4ade80', media: '#fb923c', baja: '#f87171' }

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

// ── Avatar Bruce ──────────────────────────────────────────────────────────
function BruceAvatar({ size = 36, pulsing = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #064e3b, #16a34a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(74,222,128,0.25)',
      animation: pulsing ? 'brucePulse 1.5s ease-in-out infinite' : 'none',
    }}>
      <img src={bruceFace} alt='Bruce' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

// ── Bubble de Bruce ───────────────────────────────────────────────────────
function BruceBubble({ children, loading = false }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
      <BruceAvatar size={34} pulsing={loading} />
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #091810, #0d2418)',
        border: '0.5px solid rgba(74,222,128,0.15)',
        borderRadius: '4px 16px 16px 16px',
        padding: '12px 14px',
      }}>
        {loading ? (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '2px 0' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#4ade80', opacity: 0.5,
                animation: `bruceDot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ── Preview resultado IA ──────────────────────────────────────────────────
function ResultadoIA({ resultado, onConfirmar, onDescartar, modo, guardando }) {
  const [corrigiendo,  setCorrigiendo]  = useState(false)
  const [correccion,   setCorreccion]   = useState('')
  const [reanalizado,  setReanalizado]  = useState(false)
  const [cargando,     setCargando]     = useState(false)
  const [resultadoLocal, setResultadoLocal] = useState(resultado)
  const b64Ref = useRef(resultado._b64)

  // Sincronizar si llega un resultado nuevo desde afuera
  useEffect(() => {
    setResultadoLocal(resultado)
    setReanalizado(false)
    setCorrigiendo(false)
    setCorreccion('')
  }, [resultado])

  const handleReanalizar = async () => {
    if (!correccion.trim()) return
    setCargando(true)
    try {
      const fn = modo === 'etiqueta' ? analizarEtiqueta : analizarFoto
      const nuevo = await fn({
        imagen:           b64Ref.current,
        correccion:       correccion.trim(),
        nombre_anterior:  resultadoLocal.nombre,
      })
      setResultadoLocal({ ...nuevo, _b64: b64Ref.current, modo })
      setReanalizado(true)
      setCorrigiendo(false)
      setCorreccion('')
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setCargando(false)
    }
  }

  const col = colorConfianza[resultadoLocal.confianza] ?? '#4ade80'
  const esDesdInternet = resultadoLocal.fuente === 'internet'

  return (
    <div style={{ marginBottom: '16px' }}>
      <BruceBubble loading={cargando}>
        {!cargando && (
          <>
            {/* Nombre editable */}
            <input
              value={resultadoLocal.nombre}
              onChange={e => setResultadoLocal(p => ({ ...p, nombre: e.target.value }))}
              style={{
                width: '100%', background: 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '15px', fontWeight: '700',
                padding: '2px 0 6px', marginBottom: '8px',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />

            {resultadoLocal.descripcion && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                {resultadoLocal.descripcion}
              </p>
            )}

            {/* Badges */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                background: `${col}18`, color: col,
              }}>
                Confianza: {resultadoLocal.confianza}
              </span>
              {esDesdInternet && (
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                  background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <IconWorld size={10} /> Datos de internet
                </span>
              )}
              {reanalizado && (
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                  background: 'rgba(251,146,60,0.12)', color: '#fb923c',
                }}>
                  ✓ Corregido
                </span>
              )}
            </div>

            {/* Macros */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.2)', borderRadius: '10px',
              padding: '10px 12px', marginBottom: '12px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#4ade80', lineHeight: 1 }}>{resultadoLocal.calorias}</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>kcal</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#4ade80' }}>{resultadoLocal.proteina}g</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>prot</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#60a5fa' }}>{resultadoLocal.carbos}g</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>carb</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#fb923c' }}>{resultadoLocal.grasas}g</p>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>gras</p>
              </div>
            </div>

            {/* Corrección */}
            {!corrigiendo ? (
              <button
                onClick={() => setCorrigiendo(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', fontSize: '11px',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '0', marginBottom: '2px',
                  textDecoration: 'underline',
                }}
              >
                <IconRefresh size={11} /> ¿Algo está mal? Corrígeme
              </button>
            ) : (
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    autoFocus
                    placeholder='Ej: son frisnacks, pollo apanado con papitas'
                    value={correccion}
                    onChange={e => setCorreccion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleReanalizar()}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.06)',
                      border: '0.5px solid rgba(255,255,255,0.15)',
                      borderRadius: '10px', color: '#fff', fontSize: '13px',
                      padding: '10px 12px', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleReanalizar}
                    disabled={!correccion.trim()}
                    style={{
                      background: correccion.trim() ? '#4ade80' : 'rgba(255,255,255,0.08)',
                      color: correccion.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                      border: 'none', borderRadius: '10px', padding: '10px 14px',
                      fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Re-analizar
                  </button>
                  <button
                    onClick={() => { setCorrigiendo(false); setCorreccion('') }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.3)', padding: '8px',
                    }}
                  >
                    <IconX size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </BruceBubble>

      {/* Botones de acción */}
      {!cargando && (
        <div style={{ display: 'flex', gap: '8px', paddingLeft: '44px' }}>
          {modo === 'etiqueta' ? (
            <>
              <button onClick={() => onConfirmar('ambos', resultadoLocal)} disabled={guardando} style={{
                flex: 2, background: '#4ade80', color: '#000', border: 'none',
                borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: '700',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <IconCheck size={14} /> Guardar en alacena + hoy
              </button>
              <button onClick={() => onConfirmar('alacena', resultadoLocal)} disabled={guardando} style={{
                flex: 1, background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
                border: '0.5px solid rgba(96,165,250,0.2)', borderRadius: '12px',
                padding: '12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                Solo alacena
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onConfirmar('ambos', resultadoLocal)} disabled={guardando} style={{
                flex: 2, background: '#4ade80', color: '#000', border: 'none',
                borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: '700',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <IconCheck size={14} /> Agregar hoy + alacena
              </button>
              <button onClick={() => onConfirmar('dia', resultadoLocal)} disabled={guardando} style={{
                flex: 1, background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: '12px',
                padding: '12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                Solo hoy
              </button>
            </>
          )}
          <button onClick={onDescartar} style={{
            width: '42px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
            border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '12px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Selector de porciones ─────────────────────────────────────────────────
function SelectorPorciones({ alimento, onConfirmar, onCancelar }) {
  const [porciones, setPorciones] = useState(1)
  const opciones = [0.5, 1, 1.5, 2, 2.5, 3]

  const cal = Math.round(alimento.calorias * porciones)
  const pro = (alimento.proteina * porciones).toFixed(1)
  const car = (alimento.carbos   * porciones).toFixed(1)
  const gra = (alimento.grasas   * porciones).toFixed(1)

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <p style={{ fontWeight: '700', fontSize: '17px', marginBottom: '3px' }}>{alimento.nombre}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{alimento.descripcion}</p>
        </div>
        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px' }}>
          <IconX size={18} />
        </button>
      </div>

      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600', marginBottom: '10px' }}>
        Porciones
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {opciones.map(op => (
          <button key={op} onClick={() => setPorciones(op)} style={{
            padding: '8px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', border: 'none', transition: 'all 0.15s',
            background: porciones === op ? '#4ade80' : 'rgba(255,255,255,0.07)',
            color: porciones === op ? '#000' : 'rgba(255,255,255,0.6)',
          }}>{op}x</button>
        ))}
      </div>

      <div style={{
        background: 'rgba(74,222,128,0.05)', border: '0.5px solid rgba(74,222,128,0.15)',
        borderRadius: '14px', padding: '14px', marginBottom: '16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#4ade80', lineHeight: 1 }}>{cal}</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>kcal</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#4ade80' }}>{pro}g</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>proteína</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#60a5fa' }}>{car}g</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>carbos</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#fb923c' }}>{gra}g</p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>grasas</p>
        </div>
      </div>

      <button onClick={() => onConfirmar(porciones)} style={{
        width: '100%', background: '#4ade80', color: '#000', border: 'none',
        borderRadius: '14px', padding: '15px', fontSize: '15px', fontWeight: '700',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        <IconCheck size={17} /> Agregar al día
      </button>
    </div>
  )
}

// ── FoodScreen ────────────────────────────────────────────────────────────
export default function FoodScreen({ t, screen }) {
  const [comidas,    setComidas]    = useState([])
  const [alacena,    setAlacena]    = useState([])
  const [busqueda,   setBusqueda]   = useState('')
  const [cargando,   setCargando]   = useState(true)
  const [analizando, setAnalizando] = useState(false)
  const [resultado,  setResultado]  = useState(null)
  const [error,      setError]      = useState(null)
  const [guardando,  setGuardando]  = useState(false)
  const [modal,      setModal]      = useState('closed')
  const [seleccionado,  setSeleccionado]  = useState(null)
  const [formEditar,    setFormEditar]    = useState(null)

  // ── Agua ──
  const [aguaMl,       setAguaMl]       = useState(0)
  const [aguaLogs,     setAguaLogs]     = useState([])   // [{ id, cantidad_ml }]
  const [termoMl,      setTermoMl]      = useState(() => parseInt(localStorage.getItem('nutrifit_termo_ml') || '0'))
  const [editandoTermo, setEditandoTermo] = useState(false)
  const [termoInput,   setTermoInput]   = useState('')
  const META_AGUA_ML = 2500

  const fileInputPlato    = useRef(null)
  const fileInputEtiqueta = useRef(null)

  const cargarComidas = () => {
    setCargando(true)
    getComidas(hoyISO())
      .then(data => { setComidas(data); setError(null) })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false))
  }

  const cargarAgua = () => {
    getAgua(hoyISO()).then(data => {
      setAguaMl(data.total_ml ?? 0)
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

  const procesarFoto = (file, modo) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const b64 = ev.target.result.split(',')[1]
      setAnalizando(modo)
      setError(null)
      setResultado(null)
      try {
        const fn   = modo === 'etiqueta' ? analizarEtiqueta : analizarFoto
        const data = await fn({ imagen: b64 })
        setResultado({ ...data, modo, _b64: b64 })
      } catch { setError('No se pudo analizar la imagen.') }
      finally { setAnalizando(false) }
    }
    reader.readAsDataURL(file)
    fileInputPlato.current && (fileInputPlato.current.value = '')
    fileInputEtiqueta.current && (fileInputEtiqueta.current.value = '')
  }

  const confirmarResultado = async (accion, datos) => {
    if (!datos) return
    setGuardando(true)
    try {
      if (accion === 'alacena' || accion === 'ambos') {
        const nuevo = await agregarAAlacena({
          nombre:      datos.nombre,
          descripcion: datos.descripcion || '',
          calorias:    datos.calorias,
          proteina:    datos.proteina,
          carbos:      datos.carbos,
          grasas:      datos.grasas,
        })
        setAlacena(prev => [nuevo, ...prev])
      }
      if (accion === 'dia' || accion === 'ambos') {
        await agregarComida({ ...datos, fecha: hoyISO() })
        cargarComidas()
      }
      setResultado(null)
    } catch { setError('Error al guardar.') }
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
    } catch { setError('Error al agregar.') }
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
      setModal('closed')
      setFormEditar(null)
    } catch { setError('Error al editar.') }
    finally { setGuardando(false) }
  }

  const borrarDeAlacena = async (id) => {
    try { await eliminarAlacena(id); setAlacena(prev => prev.filter(a => a.id !== id)) }
    catch { setError('Error al eliminar.') }
  }

  const borrarComida = async (id) => {
    try { await eliminarComida(id); setComidas(prev => prev.filter(c => c.id !== id)) }
    catch { setError('Error al eliminar.') }
  }

  const agregarAgua = async (ml) => {
    try {
      const data = await registrarAgua({ cantidad_ml: ml, fecha: hoyISO() })
      setAguaMl(data.total_ml)
      setAguaLogs(prev => [{ id: data.id, cantidad_ml: ml }, ...prev])
    } catch { setError('Error al registrar agua.') }
  }

  const deshacerUltimoAgua = async () => {
    if (aguaLogs.length === 0) return
    const ultimo = aguaLogs[0]
    try {
      await eliminarAgua(ultimo.id)
      setAguaLogs(prev => prev.slice(1))
      setAguaMl(prev => Math.max(0, prev - ultimo.cantidad_ml))
    } catch { setError('Error al eliminar registro.') }
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
    a.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  )

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '12px',
    color: '#fff', fontSize: '15px', padding: '13px 14px',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '56px 16px 0' }}>

      <style>{`
        @keyframes brucePulse {
          0%,100% { box-shadow: 0 2px 12px rgba(74,222,128,0.25); }
          50%      { box-shadow: 0 2px 20px rgba(74,222,128,0.6); }
        }
        @keyframes bruceDot {
          0%,80%,100% { transform: scale(0.6); opacity: 0.3; }
          40%         { transform: scale(1.1); opacity: 1; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '700', letterSpacing: '-1px' }}>Comidas</h2>
        <BruceAvatar size={38} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '24px' }}>
        Registra lo que comes hoy
      </p>

      {/* ── Botones de cámara ── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => fileInputPlato.current?.click()}
          disabled={!!analizando}
          style={{
            flex: 1, padding: '16px 12px',
            background: 'rgba(74,222,128,0.06)',
            border: '1px dashed rgba(74,222,128,0.3)',
            borderRadius: '18px', cursor: analizando ? 'not-allowed' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          }}
        >
          {analizando === 'plato'
            ? <BruceAvatar size={28} pulsing />
            : <IconCamera size={24} color='#4ade80' strokeWidth={1.5} />
          }
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#4ade80' }}>
            {analizando === 'plato' ? 'Bruce analizando…' : 'Foto de plato'}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.4 }}>
            Bruce estima los macros
          </span>
        </button>

        <button
          onClick={() => fileInputEtiqueta.current?.click()}
          disabled={!!analizando}
          style={{
            flex: 1, padding: '16px 12px',
            background: 'rgba(96,165,250,0.06)',
            border: '1px dashed rgba(96,165,250,0.3)',
            borderRadius: '18px', cursor: analizando ? 'not-allowed' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          }}
        >
          {analizando === 'etiqueta'
            ? <BruceAvatar size={28} pulsing />
            : <IconPackage size={24} color='#60a5fa' strokeWidth={1.5} />
          }
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#60a5fa' }}>
            {analizando === 'etiqueta' ? 'Bruce leyendo…' : 'Foto de etiqueta'}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.4 }}>
            Guarda en alacena
          </span>
        </button>
      </div>

      <input ref={fileInputPlato}    type='file' accept='image/*' capture='environment' style={{ display: 'none' }} onChange={e => procesarFoto(e.target.files[0], 'plato')} />
      <input ref={fileInputEtiqueta} type='file' accept='image/*' capture='environment' style={{ display: 'none' }} onChange={e => procesarFoto(e.target.files[0], 'etiqueta')} />

      {/* ── Resultado IA ── */}
      {resultado && (
        <ResultadoIA
          resultado={resultado}
          modo={resultado.modo}
          guardando={guardando}
          onConfirmar={confirmarResultado}
          onDescartar={() => setResultado(null)}
        />
      )}

      {/* ── Lista comidas ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ fontWeight: '600', fontSize: '16px' }}>Hoy</p>
        <p style={{ color: '#4ade80', fontSize: '14px', fontWeight: '700' }}>{Math.round(total.kcal)} kcal</p>
      </div>

      {cargando && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <BruceAvatar size={32} pulsing />
        </div>
      )}
      {!cargando && comidas.length === 0 && !resultado && (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <p style={{ fontSize: '30px', marginBottom: '8px' }}>🍽</p>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>Sin comidas registradas hoy</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {comidas.map(c => (
          <div key={c.id} style={{
            background: '#131313', borderRadius: '18px',
            border: '0.5px solid rgba(255,255,255,0.06)',
            padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '3px' }}>{c.nombre}</p>
              {c.descripcion && (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.descripcion}
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '600' }}>P {c.proteina}g</span>
                <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '600' }}>C {c.carbos}g</span>
                <span style={{ fontSize: '11px', color: '#fb923c', fontWeight: '600' }}>F {c.grasas}g</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', marginLeft: '12px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: '700', fontSize: '16px', lineHeight: 1 }}>{c.calorias}</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>kcal</p>
              </div>
              <button onClick={() => borrarComida(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,255,255,0.18)' }}>
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Agua ── */}
      {(() => {
        const pct     = Math.min(aguaMl / META_AGUA_ML, 1)
        const litros  = (aguaMl / 1000).toFixed(1)
        const metaL   = (META_AGUA_ML / 1000).toFixed(1)
        const RAPIDOS = [200, 350, 500, 750]
        return (
          <div style={{
            background: '#131313', borderRadius: '20px',
            border: '0.5px solid rgba(34,211,238,0.15)',
            padding: '16px', marginBottom: '12px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconDroplet size={18} color='#22d3ee' />
                <span style={{ fontWeight: '700', fontSize: '15px' }}>Agua</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: pct >= 1 ? '#4ade80' : '#22d3ee' }}>
                  {litros} / {metaL} L
                </span>
                {aguaLogs.length > 0 && (
                  <button
                    onClick={deshacerUltimoAgua}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: '11px', padding: '2px 6px' }}
                  >
                    ↩ deshacer
                  </button>
                )}
              </div>
            </div>

            {/* Barra de progreso */}
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                background: pct >= 1 ? '#4ade80' : '#22d3ee',
                width: `${pct * 100}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>

            {/* Botones rápidos */}
            <div style={{ display: 'flex', gap: '7px', marginBottom: termoMl > 0 || editandoTermo ? '10px' : '0' }}>
              {RAPIDOS.map(ml => (
                <button key={ml} onClick={() => agregarAgua(ml)} style={{
                  flex: 1, padding: '10px 4px', borderRadius: '12px', border: 'none',
                  background: 'rgba(34,211,238,0.1)', color: '#22d3ee',
                  fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                }}>
                  {ml < 1000 ? `${ml}ml` : `${ml / 1000}L`}
                </button>
              ))}
            </div>

            {/* Termo / botella guardada */}
            {!editandoTermo && termoMl > 0 && (
              <div style={{ display: 'flex', gap: '7px', marginTop: '8px' }}>
                <button
                  onClick={() => agregarAgua(termoMl)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(34,211,238,0.25)',
                    background: 'rgba(34,211,238,0.07)', color: '#22d3ee',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <IconBottle size={15} /> Mi termo ({termoMl}ml)
                </button>
                <button
                  onClick={() => { setEditandoTermo(true); setTermoInput(String(termoMl)) }}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '12px', padding: '10px 12px', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}
                >
                  editar
                </button>
              </div>
            )}

            {/* Sin termo guardado — botón para configurar */}
            {!editandoTermo && termoMl === 0 && (
              <button
                onClick={() => { setEditandoTermo(true); setTermoInput('') }}
                style={{
                  marginTop: '8px', width: '100%', padding: '9px', borderRadius: '12px',
                  border: '1px dashed rgba(34,211,238,0.2)', background: 'none',
                  color: 'rgba(34,211,238,0.5)', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                <IconBottle size={13} /> Guardar mi termo o botella
              </button>
            )}

            {/* Formulario de termo */}
            {editandoTermo && (
              <div style={{ display: 'flex', gap: '7px', marginTop: '8px' }}>
                <input
                  autoFocus
                  type='number'
                  placeholder='Capacidad en ml (ej: 600)'
                  value={termoInput}
                  onChange={e => setTermoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && guardarTermo(termoInput)}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.07)',
                    border: '0.5px solid rgba(34,211,238,0.3)', borderRadius: '12px',
                    color: '#fff', fontSize: '14px', padding: '10px 12px',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => guardarTermo(termoInput)}
                  disabled={!termoInput || parseInt(termoInput) <= 0}
                  style={{
                    background: termoInput ? '#22d3ee' : 'rgba(255,255,255,0.06)',
                    color: termoInput ? '#000' : 'rgba(255,255,255,0.3)',
                    border: 'none', borderRadius: '12px', padding: '10px 14px',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  }}
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditandoTermo(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '8px' }}
                >
                  <IconX size={14} />
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Botón alacena ── */}
      <button
        onClick={() => { setModal('alacena'); setBusqueda('') }}
        style={{
          width: '100%', background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.18)', borderRadius: '16px',
          color: '#4ade80', fontSize: '15px', fontWeight: '700', padding: '15px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginBottom: '24px',
        }}
      >
        <IconPlus size={18} /> Mi alacena
      </button>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
          borderRadius: '12px', padding: '10px 14px', marginBottom: '12px',
          fontSize: '13px', color: '#f87171',
        }}>⚠ {error}</div>
      )}

      {/* ════════ MODAL ALACENA ════════ */}
      {(modal === 'alacena' || modal === 'porciones' || modal === 'editar') && (
        <div
          onClick={() => { setModal('closed'); setSeleccionado(null); setFormEditar(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '430px', margin: '0 auto',
              background: '#161616', borderRadius: '28px 28px 0 0',
              border: '0.5px solid rgba(255,255,255,0.1)',
              padding: '10px 20px 48px',
              maxHeight: '88vh', overflowY: 'auto',
            }}
          >
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '12px auto 20px' }} />

            {modal === 'alacena' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <BruceAvatar size={30} />
                    <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Mi alacena</h3>
                  </div>
                  <button onClick={() => setModal('closed')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                    <IconX size={20} />
                  </button>
                </div>

                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <IconSearch size={15} color='rgba(255,255,255,0.25)' style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    placeholder='Buscar alimento…'
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '36px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {alacenaFiltrada.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px', padding: '24px 0' }}>
                      {busqueda ? 'Sin resultados' : 'Tu alacena está vacía'}
                    </p>
                  )}
                  {alacenaFiltrada.map(a => (
                    <div key={a.id} style={{
                      background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
                      borderRadius: '16px', padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: '12px',
                    }}>
                      <button
                        onClick={() => { setSeleccionado(a); setModal('porciones') }}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      >
                        <p style={{ fontWeight: '600', fontSize: '14px', color: '#fff', marginBottom: '3px' }}>{a.nombre}</p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '5px' }}>{a.descripcion}</p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <IconFlame size={10} color='#4ade80' />
                            <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: '700' }}>{a.calorias}</span>
                          </span>
                          <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '600' }}>P {a.proteina}g</span>
                          <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '600' }}>C {a.carbos}g</span>
                          <span style={{ fontSize: '11px', color: '#fb923c', fontWeight: '600' }}>F {a.grasas}g</span>
                        </div>
                      </button>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            setFormEditar({ ...a, calorias: String(a.calorias), proteina: String(a.proteina), carbos: String(a.carbos), grasas: String(a.grasas) })
                            setModal('editar')
                          }}
                          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '9px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}
                        >
                          <IconPencil size={13} />
                        </button>
                        <button
                          onClick={() => borrarDeAlacena(a.id)}
                          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '9px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)' }}
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {modal === 'porciones' && seleccionado && (
              <SelectorPorciones
                alimento={seleccionado}
                onConfirmar={confirmarPorciones}
                onCancelar={() => { setModal('alacena'); setSeleccionado(null) }}
              />
            )}

            {modal === 'editar' && formEditar && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Editar alimento</h3>
                  <button onClick={() => { setModal('alacena'); setFormEditar(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}>
                    <IconX size={20} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input placeholder='Nombre *' value={formEditar.nombre} onChange={e => setFormEditar(p => ({ ...p, nombre: e.target.value }))} style={inputStyle} />
                  <input placeholder='Descripción (ej: 3 galletas 34g)' value={formEditar.descripcion} onChange={e => setFormEditar(p => ({ ...p, descripcion: e.target.value }))} style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { key: 'calorias', label: 'Calorías', unit: 'kcal' },
                      { key: 'proteina', label: 'Proteína',  unit: 'g' },
                      { key: 'carbos',   label: 'Carbos',    unit: 'g' },
                      { key: 'grasas',   label: 'Grasas',    unit: 'g' },
                    ].map(f => (
                      <div key={f.key} style={{ position: 'relative' }}>
                        <input
                          type='number'
                          placeholder={f.label}
                          value={formEditar[f.key]}
                          onChange={e => setFormEditar(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ ...inputStyle, paddingRight: '36px' }}
                        />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }}>
                          {f.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={guardarEdicion}
                    disabled={guardando || !formEditar.nombre}
                    style={{
                      background: formEditar.nombre ? '#4ade80' : 'rgba(255,255,255,0.08)',
                      color: formEditar.nombre ? '#000' : 'rgba(255,255,255,0.3)',
                      border: 'none', borderRadius: '14px', padding: '15px',
                      fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginTop: '4px',
                    }}
                  >
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
