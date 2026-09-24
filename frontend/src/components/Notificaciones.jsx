// Ajustes → Notificaciones. Misma navegación que Alimentación: una página que
// entra desde la derecha. Cada tipo tiene su interruptor y su hora; al activarlo
// aparecen sus horas (progresión: lo que no usas no estorba). Todo se guarda al
// instante y, si el servidor falla, vuelve lo anterior.
import { useEffect, useState } from 'react'
import {
  IconBell, IconChevronLeft, IconChevronRight, IconToolsKitchen2, IconBarbell, IconDroplet,
  IconFlame, IconChartBar, IconMoon, IconMinus, IconPlus, IconX, IconSend,
} from '@tabler/icons-react'
import { getAjustesNotif, guardarAjustesNotif, probarNotificacion } from '../api'
import { desuscribir, esIOSSinInstalar, estasSuscrito, permisoActual, soportaNotificaciones, suscribir } from '../utils/notificaciones'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'

const MOMENTOS = [['desayuno', 'Desayuno'], ['almuerzo', 'Almuerzo'], ['merienda', 'Merienda'], ['cena', 'Cena']]
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Fila de Ajustes que abre la página
export function FilaNotificaciones({ onAbrir }) {
  return (
    <button onClick={onAbrir} className='nf-row nf-press-soft' style={{ '--row-inset': '60px', width: '100%', textAlign: 'left' }}>
      <span className='nf-row-icon' style={{ '--tint': 'var(--green)' }}><IconBell size={18} /></span>
      <span style={{ flex: 1, fontSize: '15px' }}>Notificaciones</span>
      <IconChevronRight size={18} color='var(--label-4)' aria-hidden='true' />
    </button>
  )
}

function Hora({ valor, onCambiar, etiqueta }) {
  return (
    <input
      type='time'
      className='nf-input nf-num'
      value={valor}
      aria-label={etiqueta}
      onChange={e => e.target.value && onCambiar(e.target.value)}
      style={{ width: '136px', minHeight: '38px', padding: '0 10px', fontSize: '16px' }}
    />
  )
}

function Tipo({ icono: Icono, tint, titulo, desc, activo, onActivo, children }) {
  return (
    <div className='nf-row' style={{ display: 'block', '--row-inset': '60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className='nf-row-icon' style={{ '--tint': tint }}><Icono size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '15px' }}>{titulo}</span>
          <span className='nf-caption' style={{ display: 'block' }}>{desc}</span>
        </span>
        <button role='switch' aria-checked={activo} aria-label={titulo} className='nf-switch' onClick={() => onActivo(!activo)} style={{ flexShrink: 0 }} />
      </div>
      <div className='nf-collapse' data-open={activo}>
        <div>
          <div style={{ padding: '10px 0 2px 48px' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

function FilaHora({ etiqueta, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '3px 0' }}>
      <span className='nf-footnote'>{etiqueta}</span>
      {children}
    </div>
  )
}

export function PaginaNotificaciones({ onVolver }) {
  const [ajustes, setAjustes]     = useState(null)
  const [activas, setActivas]     = useState(false)
  const [cambiando, setCambiando] = useState(false)
  const [probando, setProbando]   = useState(false)
  const soporta = soportaNotificaciones()

  useEffect(() => {
    getAjustesNotif().then(setAjustes).catch(() => toast.error('No se pudieron cargar tus notificaciones.'))
    estasSuscrito().then(setActivas)
  }, [])

  // Guarda un cambio (solo lo que cambió) y lo muestra al instante
  const guardar = async (parcial) => {
    const anterior = ajustes
    setAjustes(prev => {
      const n = { ...prev }
      for (const [k, v] of Object.entries(parcial)) n[k] = typeof v === 'object' && !Array.isArray(v) ? { ...prev[k], ...v } : v
      return n
    })
    try {
      setAjustes(await guardarAjustesNotif(parcial))
    } catch (e) {
      setAjustes(anterior)
      toast.error(e.mensaje || 'No se pudo guardar.')
    }
  }

  const alternarDispositivo = async () => {
    if (!soporta) return
    if (permisoActual() === 'denied') {
      toast.error('Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono para NutriFit.')
      return
    }
    setCambiando(true)
    try {
      if (activas) { await desuscribir(); setActivas(false) }
      else         { await suscribir();   setActivas(true); haptic(20) }
    } catch {
      toast.error('No se pudieron cambiar las notificaciones en este dispositivo.')
    } finally {
      setCambiando(false)
    }
  }

  const probar = async () => {
    setProbando(true)
    try {
      await probarNotificacion()
      toast.success('Enviada. Debería llegarte en unos segundos.')
    } catch (e) {
      toast.error(e.mensaje || 'No se pudo enviar la prueba.')
    } finally {
      setProbando(false)
    }
  }

  const a = ajustes
  return (
    <div className='nf-pagina-push'>
      <button onClick={onVolver} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--green)', padding: '0 4px', marginLeft: '-6px' }}>
        <IconChevronLeft size={22} /> Ajustes
      </button>
      <h2 className='nf-title-2' style={{ margin: '6px 4px 4px' }}>Notificaciones</h2>
      <p className='nf-footnote' style={{ margin: '0 4px 16px' }}>
        Bruce solo te escribe cuando sirve: si ya comiste, fuiste al gym o tomaste agua, no suena.
      </p>

      {/* Este dispositivo */}
      <div className='nf-card' style={{ overflow: 'hidden', marginBottom: '8px' }}>
        <div className='nf-row' style={{ alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '15px' }}>En este teléfono</span>
            <span className='nf-caption' style={{ display: 'block' }}>
              {!soporta
                ? (esIOSSinInstalar() ? 'En iPhone, primero agrega NutriFit a la pantalla de inicio.' : 'Este navegador no admite notificaciones.')
                : activas ? 'Activas' : 'Apagadas'}
            </span>
          </span>
          <button
            role='switch' aria-checked={activas} aria-label='Notificaciones en este teléfono'
            className='nf-switch' onClick={alternarDispositivo} disabled={!soporta || cambiando}
            style={{ opacity: !soporta || cambiando ? 0.5 : 1, flexShrink: 0 }}
          />
        </div>
        {activas && (
          <button onClick={probar} disabled={probando} className='nf-row nf-press-soft' style={{ width: '100%', color: 'var(--green)', fontSize: '15px', justifyContent: 'flex-start', gap: '8px' }}>
            <IconSend size={17} className={probando ? 'nf-spinner' : undefined} /> Enviarme una de prueba
          </button>
        )}
      </div>
      <p className='nf-caption' style={{ margin: '0 16px 20px' }}>Apagarlas aquí no las apaga en tus otros dispositivos.</p>

      {!a ? (
        <div className='nf-skeleton' style={{ height: '320px', borderRadius: 'var(--r-lg)' }} />
      ) : (<>
        <h3 className='nf-section-label'>Qué te avisa Bruce</h3>
        <div className='nf-card' style={{ overflow: 'hidden', marginBottom: '20px', opacity: activas ? 1 : 0.6, transition: 'opacity 200ms ease' }}>
          <Tipo icono={IconToolsKitchen2} tint='var(--orange)' titulo='Comidas' desc='Con el plato de tu plan, si no lo has comido'
            activo={a.comidas.activo} onActivo={v => guardar({ comidas: { activo: v } })}>
            {MOMENTOS.map(([id, nombre]) => (
              <FilaHora key={id} etiqueta={nombre}>
                <Hora valor={a.comidas.horas[id]} etiqueta={`Hora del ${nombre.toLowerCase()}`}
                  onCambiar={h => guardar({ comidas: { horas: { ...a.comidas.horas, [id]: h } } })} />
              </FilaHora>
            ))}
          </Tipo>

          <Tipo icono={IconBarbell} tint='var(--blue)' titulo='Gym' desc='La rutina de hoy; nunca en días de descanso'
            activo={a.gym.activo} onActivo={v => guardar({ gym: { activo: v } })}>
            <FilaHora etiqueta='Hora'>
              <Hora valor={a.gym.hora} etiqueta='Hora del gym' onCambiar={h => guardar({ gym: { hora: h } })} />
            </FilaHora>
          </Tipo>

          <Tipo icono={IconDroplet} tint='var(--cyan)' titulo='Agua' desc='Solo si vas atrasado a esa hora'
            activo={a.agua.activo} onActivo={v => guardar({ agua: { activo: v } })}>
            {a.agua.horas.map((h, i) => (
              <FilaHora key={`${h}-${i}`} etiqueta={`Aviso ${i + 1}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Hora valor={h} etiqueta={`Recordatorio de agua ${i + 1}`}
                    onCambiar={nueva => guardar({ agua: { horas: a.agua.horas.map((x, j) => j === i ? nueva : x) } })} />
                  <button className='nf-icon-btn nf-icon-btn--sm' aria-label={`Quitar recordatorio ${i + 1}`}
                    disabled={a.agua.horas.length <= 1}
                    onClick={() => guardar({ agua: { horas: a.agua.horas.filter((_, j) => j !== i) } })}>
                    <IconX size={16} />
                  </button>
                </span>
              </FilaHora>
            ))}
            {a.agua.horas.length < 8 && (
              <button className='nf-btn nf-btn--plain nf-btn--sm' style={{ '--tint': 'var(--cyan)', paddingLeft: 0 }}
                onClick={() => guardar({ agua: { horas: [...a.agua.horas, '17:30'] } })}>
                <IconPlus size={15} /> Agregar hora
              </button>
            )}
          </Tipo>

          <Tipo icono={IconFlame} tint='var(--red)' titulo='Racha en riesgo' desc='En la noche, solo si hoy aún no cumples'
            activo={a.racha.activo} onActivo={v => guardar({ racha: { activo: v } })}>
            <FilaHora etiqueta='Hora'>
              <Hora valor={a.racha.hora} etiqueta='Hora del aviso de racha' onCambiar={h => guardar({ racha: { hora: h } })} />
            </FilaHora>
          </Tipo>

          <Tipo icono={IconChartBar} tint='var(--purple)' titulo='Resumen semanal' desc='Cómo te fue en la semana y qué mejorar'
            activo={a.resumen.activo} onActivo={v => guardar({ resumen: { activo: v } })}>
            <FilaHora etiqueta='Día'>
              <select className='nf-input' value={a.resumen.dia} aria-label='Día del resumen'
                onChange={e => guardar({ resumen: { dia: Number(e.target.value) } })}
                style={{ width: '132px', minHeight: '38px', padding: '0 10px', fontSize: '16px' }}>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </FilaHora>
            <FilaHora etiqueta='Hora'>
              <Hora valor={a.resumen.hora} etiqueta='Hora del resumen' onCambiar={h => guardar({ resumen: { hora: h } })} />
            </FilaHora>
          </Tipo>
        </div>

        <h3 className='nf-section-label'>Sin molestar</h3>
        <div className='nf-card' style={{ overflow: 'hidden' }}>
          <div className='nf-row' style={{ '--row-inset': '60px', alignItems: 'center' }}>
            <span className='nf-row-icon' style={{ '--tint': 'var(--purple)' }}><IconMoon size={18} /></span>
            <span style={{ flex: 1, fontSize: '15px' }}>Silencio</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Hora valor={a.silencio.desde} etiqueta='Silencio desde' onCambiar={h => guardar({ silencio: { desde: h } })} />
              <span className='nf-caption'>a</span>
              <Hora valor={a.silencio.hasta} etiqueta='Silencio hasta' onCambiar={h => guardar({ silencio: { hasta: h } })} />
            </span>
          </div>
          <div className='nf-row' style={{ '--row-inset': '60px', alignItems: 'center' }}>
            <span className='nf-row-icon' style={{ '--tint': 'var(--label-2)' }}><IconBell size={18} /></span>
            <span style={{ flex: 1, fontSize: '15px' }}>Máximo por día</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button className='nf-icon-btn nf-icon-btn--sm' aria-label='Menos' disabled={a.maximo_dia <= 1}
                onClick={() => guardar({ maximo_dia: a.maximo_dia - 1 })}><IconMinus size={16} /></button>
              <span className='nf-num' style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700 }} aria-live='polite'>{a.maximo_dia}</span>
              <button className='nf-icon-btn nf-icon-btn--sm' aria-label='Más' disabled={a.maximo_dia >= 12}
                onClick={() => guardar({ maximo_dia: a.maximo_dia + 1 })}><IconPlus size={16} /></button>
            </span>
          </div>
        </div>
        <p className='nf-caption' style={{ margin: '8px 16px 0' }}>
          En iPhone las notificaciones no tienen botones; tócala y te lleva directo a lo que toca.
        </p>
      </>)}
    </div>
  )
}
