import { useState, useEffect, useRef } from 'react'
import { IconChevronLeft, IconCheck } from '@tabler/icons-react'
import { completarOnboarding, generarPlanGroq, agregarAAlacena } from '../api'
import { haptic, prefersReducedMotion } from '../lib/motion'
import { ALIMENTOS_OPCIONES, NO_GUSTADOS_OPCIONES, RESTRICCIONES_OPCIONES } from '../constants/alimentacion'
import bruceTuxedo from '../assets/bruce-tuxedo.webp'
import bruceMuyfeliz from '../assets/bruce-tuxedo-muyfeliz.webp'

// ── Opciones ──────────────────────────────────────────────────────────────────

// En el onboarding "Ninguna" es una opción más para poder avanzar sin elegir
const RESTRICCIONES_ONBOARDING = [{ id: 'ninguna', label: 'Ninguna', emoji: '✅' }, ...RESTRICCIONES_OPCIONES]

const TOTAL_PASOS = 10
const PASO_VELOCIDAD = 6

// ── Piezas ────────────────────────────────────────────────────────────────────

function ProgressBar({ paso, total }) {
  return (
    <div
      role='progressbar' aria-valuemin={1} aria-valuemax={total} aria-valuenow={paso + 1}
      aria-label={`Paso ${paso + 1} de ${total}`}
      style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', flex: 1 }}
    >
      <div style={{
        height: '100%', width: '100%', background: 'var(--green)', borderRadius: '2px',
        transform: `scaleX(${(paso + 1) / total})`, transformOrigin: 'left',
        transition: 'transform 400ms var(--ease-out)',
      }} />
    </div>
  )
}

function Titulo({ children, sub }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h2 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.12, marginBottom: '8px' }}>{children}</h2>
      {sub && <p className='nf-subhead'>{sub}</p>}
    </div>
  )
}

// Tarjeta de opción: tocar selecciona (y en preguntas de una sola respuesta, avanza)
function Opcion({ activa, emoji, label, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activa}
      className='nf-card nf-press-soft'
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
        padding: '16px 18px', marginBottom: '10px', textAlign: 'left', minHeight: '64px',
        background: activa ? 'rgba(74,222,128,0.1)' : 'var(--surface-1)',
        boxShadow: activa ? 'inset 0 0 0 1.5px var(--green)' : 'inset 0 0 0 0.5px var(--hairline)',
        transition: 'background-color 160ms ease, box-shadow 160ms ease, transform 160ms var(--ease-out)',
      }}
    >
      <span style={{ fontSize: '26px', width: '32px', textAlign: 'center', flexShrink: 0 }} aria-hidden='true'>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '17px', fontWeight: 600 }}>{label}</span>
        {desc && <span className='nf-footnote' style={{ display: 'block' }}>{desc}</span>}
      </span>
      <span style={{
        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
        background: activa ? 'var(--green)' : 'transparent',
        boxShadow: activa ? 'none' : 'inset 0 0 0 1.5px var(--label-4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 160ms ease',
      }}>
        {activa && <IconCheck size={15} color='#000' strokeWidth={3} />}
      </span>
    </button>
  )
}

function Chip({ activo, onClick, children, tint = 'var(--green)' }) {
  return (
    <button onClick={onClick} aria-pressed={activo} className='nf-chip' style={{ '--tint': tint, minHeight: '40px', fontSize: '15px' }}>
      {activo && <IconCheck size={15} strokeWidth={2.6} />}
      {children}
    </button>
  )
}

function CampoNumero({ value, onChange, placeholder, unidad, inputMode, min, max, step, label }) {
  return (
    <label style={{ position: 'relative', display: 'block' }}>
      <input
        type='number' inputMode={inputMode} enterKeyHint='next'
        value={value} onChange={onChange} placeholder={placeholder}
        min={min} max={max} step={step} aria-label={label}
        autoFocus
        className='nf-input nf-num'
        style={{ fontSize: '40px', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', minHeight: '88px', borderRadius: '20px', paddingRight: '56px', paddingLeft: '56px' }}
      />
      <span className='nf-headline' style={{ position: 'absolute', right: '22px', top: '50%', transform: 'translateY(-50%)', color: 'var(--label-3)' }}>
        {unidad}
      </span>
    </label>
  )
}

// Botón principal abajo, en la zona del pulgar
function Continuar({ disabled, onClick, children = 'Continuar' }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
      <button onClick={onClick} disabled={disabled} className='nf-btn nf-btn--primary nf-btn--lg nf-btn--block'>{children}</button>
    </div>
  )
}

// ── Pantalla de "generando plan" ─────────────────────────────────────────────

function PantallaGenerando({ nombre }) {
  const [msg, setMsg] = useState(0)
  const msgs = [
    'Calculando tu gasto calórico…',
    'Analizando tus preferencias…',
    'Diseñando tu plan de comidas…',
    'Ajustando macros a tu objetivo…',
    'Casi listo…',
  ]

  useEffect(() => {
    const id = setInterval(() => setMsg(m => Math.min(m + 1, msgs.length - 1)), 1800)
    return () => clearInterval(id)
  }, [msgs.length])

  return (
    <div style={{
      minHeight: 'var(--app-h)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '24px',
    }} aria-busy='true'>
      <img src={bruceTuxedo} alt='' className='nf-float' style={{ width: '170px', marginBottom: '20px', filter: 'drop-shadow(0 10px 30px rgba(74,222,128,0.25))' }} />
      <p className='nf-title-2' style={{ marginBottom: '10px' }}>Hola, {nombre?.split(' ')[0]}</p>
      <p key={msg} className='nf-fade nf-headline' aria-live='polite' style={{ color: 'var(--green)', minHeight: '24px' }}>
        {msgs[msg]}
      </p>
      <p className='nf-footnote' style={{ marginTop: '6px' }}>Bruce está armando tu plan personalizado</p>
      <div style={{ marginTop: '32px', display: 'flex', gap: '8px' }}>
        {[0, 1, 2].map(i => <span key={i} className='nf-dot' style={{ width: '8px', height: '8px', animationDelay: `${i * 0.18}s` }} />)}
      </div>
    </div>
  )
}

// ── Pantalla del plan listo ──────────────────────────────────────────────────

function PantallaPlan({ plan, calorias, proteina, carbos, grasas, onEntrar }) {
  return (
    <div style={{ minHeight: 'var(--app-h)', padding: 'calc(var(--safe-top) + 32px) 20px calc(var(--safe-bottom) + 24px)', display: 'flex', flexDirection: 'column' }}>
      <div className='nf-enter' style={{ textAlign: 'center', marginBottom: '24px' }}>
        <img src={bruceMuyfeliz} alt='' style={{ width: '120px', margin: '0 auto 12px', filter: 'drop-shadow(0 8px 24px rgba(74,222,128,0.25))' }} />
        <h2 className='nf-large-title' style={{ marginBottom: '8px' }}>Tu plan está listo</h2>
        {plan?.plan_descripcion && <p className='nf-subhead'>{plan.plan_descripcion}</p>}
      </div>

      <div className='nf-card nf-enter' style={{
        padding: '18px', marginBottom: '8px', animationDelay: '60ms',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center',
      }}>
        {[
          { label: 'Calorías', val: calorias, unit: 'kcal', color: 'var(--label)' },
          { label: 'Proteína', val: proteina, unit: 'g',    color: 'var(--green)' },
          { label: 'Carbos',   val: carbos,   unit: 'g',    color: 'var(--blue)' },
          { label: 'Grasas',   val: grasas,   unit: 'g',    color: 'var(--orange)' },
        ].map(({ label, val, unit, color }) => (
          <div key={label}>
            <p className='nf-num' style={{ fontSize: '22px', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{val}</p>
            <p className='nf-caption'>{unit === 'kcal' ? 'kcal' : `${unit} ${label.toLowerCase()}`}</p>
          </div>
        ))}
      </div>
      <p className='nf-caption' style={{ textAlign: 'center', marginBottom: '8px' }}>Tu meta diaria</p>

      {plan?.alimentos?.length > 0 && (
        <>
          <h3 className='nf-section-label'>{plan.alimentos.length} alimentos guardados en tu alacena</h3>
          <div className='nf-card' style={{ overflow: 'hidden' }}>
            {plan.alimentos.slice(0, 6).map((a, i) => (
              <div key={i} className='nf-row'>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '15px', fontWeight: 500 }}>{a.nombre}</p>
                  {a.descripcion && <p className='nf-caption'>{a.descripcion}</p>}
                </div>
                <p className='nf-num' style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>{a.calorias} kcal</p>
              </div>
            ))}
          </div>
          {plan.alimentos.length > 6 && (
            <p className='nf-caption' style={{ textAlign: 'center', padding: '8px' }}>+{plan.alimentos.length - 6} más en tu alacena</p>
          )}
        </>
      )}

      {plan?.dia_ejemplo && (
        <>
          <h3 className='nf-section-label'>Ejemplo de un día</h3>
          <div className='nf-card' style={{ overflow: 'hidden', marginBottom: '24px' }}>
            {[
              { key: 'desayuno', label: 'Desayuno' },
              { key: 'almuerzo', label: 'Almuerzo' },
              { key: 'cena',     label: 'Cena'     },
              { key: 'snack',    label: 'Snack'    },
            ].map(({ key, label }) => {
              const comida = plan.dia_ejemplo[key]
              if (!comida) return null
              return (
                <div key={key} className='nf-row' style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className='nf-caption' style={{ fontWeight: 600 }}>{label}</p>
                    <p style={{ fontSize: '15px', fontWeight: 500 }}>{comida.nombre}</p>
                    {comida.descripcion && <p className='nf-caption'>{comida.descripcion}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p className='nf-num' style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>{comida.calorias} kcal</p>
                    <p className='nf-caption nf-num'>{comida.proteina}g prot</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
        <button onClick={onEntrar} className='nf-btn nf-btn--primary nf-btn--lg nf-btn--block'>Entrar a NutriFit</button>
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ usuario, onComplete }) {
  const [paso,      setPaso]      = useState(0)
  const [direccion, setDireccion] = useState(1)    // 1 = adelante, -1 = atrás
  const [datos,     setDatos]     = useState({
    sexo: '',
    fecha_nacimiento: '',
    estatura_cm: '',
    peso_inicial_kg: '',
    peso_objetivo_kg: '',
    objetivo: '',
    velocidad_objetivo: '',
    nivel_actividad: '',
    alimentos_gustados: [],
    alimentos_no_gustados: [],
    restricciones_dieta: [],
  })
  const [fase,  setFase]  = useState('pasos')   // 'pasos' | 'generando' | 'plan'
  const [plan,  setPlan]  = useState(null)
  const [usuarioActualizado, setUsuarioActualizado] = useState(null)
  const [error, setError] = useState(null)

  // "Mantener peso" no necesita velocidad: el paso se salta en ambos sentidos
  const saltarVelocidad = datos.objetivo === 'mantener'

  const irAPaso = (n, dir) => {
    setDireccion(dir)
    setPaso(n)
    window.scrollTo({ top: 0 })
  }

  const siguiente = (desde = paso, objetivo = datos.objetivo) => {
    let n = desde + 1
    if (n === PASO_VELOCIDAD && objetivo === 'mantener') n++
    irAPaso(n, 1)
  }
  const anterior = () => {
    let n = paso - 1
    if (n === PASO_VELOCIDAD && saltarVelocidad) n--
    irAPaso(n, -1)
  }

  const set = (campo, valor) => setDatos(d => ({ ...d, [campo]: valor }))

  // Selección única: marca, da feedback, y avanza tras un instante para que se vea la elección
  const avanzando = useRef(false)
  const elegir = (campo, valor) => {
    if (avanzando.current) return   // un doble toque no debe saltar dos pasos
    avanzando.current = true
    haptic(6)
    setDatos(d => ({ ...d, [campo]: valor }))
    const desde = paso
    setTimeout(() => {
      avanzando.current = false
      siguiente(desde, campo === 'objetivo' ? valor : datos.objetivo)
    }, 220)
  }

  const toggleChip = (campo, valor) => {
    setDatos(d => {
      const arr = d[campo]
      return { ...d, [campo]: arr.includes(valor) ? arr.filter(x => x !== valor) : [...arr, valor] }
    })
  }

  const finalizar = async () => {
    setFase('generando')
    setError(null)
    try {
      const payload = {
        ...datos,
        velocidad_objetivo: datos.objetivo === 'mantener' ? 'moderado' : datos.velocidad_objetivo,
        estatura_cm:      parseInt(datos.estatura_cm),
        peso_inicial_kg:  parseFloat(datos.peso_inicial_kg),
        peso_objetivo_kg: datos.peso_objetivo_kg ? parseFloat(datos.peso_objetivo_kg) : null,
        restricciones_dieta: datos.restricciones_dieta.filter(r => r !== 'ninguna'),
      }
      const actualizado = await completarOnboarding(payload)
      const planData = await generarPlanGroq()

      if (planData?.alimentos?.length) {
        await Promise.all(planData.alimentos.map(a => agregarAAlacena(a).catch(() => {})))
      }

      setUsuarioActualizado(actualizado)
      setPlan(planData)
      setFase('plan')
    } catch {
      setError('Hubo un error creando tu plan. Intenta de nuevo.')
      setFase('pasos')
    }
  }

  if (fase === 'generando') return <PantallaGenerando nombre={usuario.first_name} />

  if (fase === 'plan' && plan) {
    return (
      <PantallaPlan
        plan={plan}
        calorias={usuarioActualizado?.meta_calorias}
        proteina={usuarioActualizado?.meta_proteina}
        carbos={usuarioActualizado?.meta_carbos}
        grasas={usuarioActualizado?.meta_grasas}
        onEntrar={() => onComplete(usuarioActualizado)}
      />
    )
  }

  // Navegación tipo "push": adelante entra desde la derecha, atrás desde la izquierda
  const animacionPaso = prefersReducedMotion()
    ? 'nf-fade-in 200ms ease both'
    : `${direccion > 0 ? 'nf-push-in' : 'nf-pop-back'} 320ms var(--ease-out) both`

  const avanzar = () => siguiente()

  const renderPaso = () => {
    switch (paso) {

      case 0:
        return (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <img src={bruceTuxedo} alt='' className='nf-float' style={{ width: '190px', marginBottom: '20px', filter: 'drop-shadow(0 10px 30px rgba(74,222,128,0.25))' }} />
              <h1 className='nf-large-title' style={{ marginBottom: '10px' }}>Hola, {usuario.first_name?.split(' ')[0]}</h1>
              <p className='nf-subhead' style={{ maxWidth: '280px' }}>
                Soy Bruce. Vamos a crear tu plan de nutrición personalizado. Son solo 2 minutos.
              </p>
            </div>
            <Continuar onClick={avanzar}>Empezar</Continuar>
          </>
        )

      case 1:
        return (
          <>
            <Titulo sub='Afecta el cálculo de tu metabolismo basal'>¿Cuál es tu sexo biológico?</Titulo>
            {[
              { val: 'M', label: 'Masculino', emoji: '♂️' },
              { val: 'F', label: 'Femenino',  emoji: '♀️' },
            ].map(({ val, label, emoji }) => (
              <Opcion key={val} activa={datos.sexo === val} emoji={emoji} label={label} onClick={() => elegir('sexo', val)} />
            ))}
          </>
        )

      case 2:
        return (
          <>
            <Titulo sub='Para calcular tu edad y ajustar las calorías'>¿Cuándo naciste?</Titulo>
            <input
              type='date'
              className='nf-input'
              aria-label='Fecha de nacimiento'
              value={datos.fecha_nacimiento}
              onChange={e => set('fecha_nacimiento', e.target.value)}
              max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 13); return d.toLocaleDateString('en-CA') })()}
              style={{ fontSize: '19px', minHeight: '60px', borderRadius: '16px', colorScheme: 'dark' }}
            />
            <Continuar onClick={avanzar} disabled={!datos.fecha_nacimiento} />
          </>
        )

      case 3:
        return (
          <>
            <Titulo sub='En centímetros'>¿Cuánto mides?</Titulo>
            <CampoNumero
              value={datos.estatura_cm} onChange={e => set('estatura_cm', e.target.value)}
              placeholder='175' unidad='cm' inputMode='numeric' min={100} max={250} label='Estatura en centímetros'
            />
            <Continuar onClick={avanzar} disabled={!datos.estatura_cm || datos.estatura_cm < 100} />
          </>
        )

      case 4:
        return (
          <>
            <Titulo sub='Tu peso actual en kilogramos'>¿Cuánto pesas ahora?</Titulo>
            <CampoNumero
              value={datos.peso_inicial_kg} onChange={e => set('peso_inicial_kg', e.target.value)}
              placeholder='70.0' unidad='kg' inputMode='decimal' min={30} max={250} step={0.1} label='Peso en kilogramos'
            />
            <Continuar onClick={avanzar} disabled={!datos.peso_inicial_kg || datos.peso_inicial_kg < 30} />
          </>
        )

      case 5:
        return (
          <>
            <Titulo sub='Esto define tus calorías diarias'>¿Cuál es tu objetivo?</Titulo>
            {[
              { val: 'perder',   label: 'Perder grasa',  emoji: '🔥', desc: 'Déficit calórico controlado' },
              { val: 'mantener', label: 'Mantener peso', emoji: '⚖️', desc: 'Calorías de mantenimiento' },
              { val: 'ganar',    label: 'Ganar músculo', emoji: '💪', desc: 'Superávit para crecer' },
            ].map(({ val, label, emoji, desc }) => (
              <Opcion key={val} activa={datos.objetivo === val} emoji={emoji} label={label} desc={desc} onClick={() => elegir('objetivo', val)} />
            ))}
          </>
        )

      case 6:
        return (
          <>
            <Titulo sub='El ritmo con el que quieres llegar a tu meta'>¿A qué velocidad?</Titulo>
            {[
              { val: 'suave',    label: 'Suave',    emoji: '🐢', desc: datos.objetivo === 'perder' ? '~0.25 kg/sem' : '+0.25 kg/sem', extra: 'Más sostenible' },
              { val: 'moderado', label: 'Moderado', emoji: '🏃', desc: datos.objetivo === 'perder' ? '~0.5 kg/sem'  : '+0.4 kg/sem',  extra: 'Recomendado' },
              { val: 'agresivo', label: 'Agresivo', emoji: '🚀', desc: datos.objetivo === 'perder' ? '~1 kg/sem'    : '+0.5 kg/sem',  extra: 'Requiere disciplina' },
            ].map(({ val, label, emoji, desc, extra }) => (
              <Opcion key={val} activa={datos.velocidad_objetivo === val} emoji={emoji} label={label} desc={`${desc} · ${extra}`} onClick={() => elegir('velocidad_objetivo', val)} />
            ))}
          </>
        )

      case 7:
        return (
          <>
            <Titulo sub='Fuera del gym, en tu día a día'>¿Qué tan activo eres?</Titulo>
            {[
              { val: 'sedentario', label: 'Sedentario', emoji: '🛋️', desc: 'Trabajo de escritorio, poco movimiento' },
              { val: 'ligero',     label: 'Ligero',     emoji: '🚶', desc: '1-3 días de ejercicio por semana' },
              { val: 'moderado',   label: 'Moderado',   emoji: '🚴', desc: '3-5 días de ejercicio por semana' },
              { val: 'activo',     label: 'Activo',     emoji: '🏋️', desc: '6-7 días de ejercicio' },
              { val: 'muy_activo', label: 'Muy activo', emoji: '⚡', desc: 'Doble sesión o trabajo físico' },
            ].map(({ val, label, emoji, desc }) => (
              <Opcion key={val} activa={datos.nivel_actividad === val} emoji={emoji} label={label} desc={desc} onClick={() => elegir('nivel_actividad', val)} />
            ))}
          </>
        )

      case 8:
        return (
          <>
            <Titulo sub='Elige todos los que quieras. Bruce los usará para armar tu plan.'>¿Qué alimentos te gustan?</Titulo>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ALIMENTOS_OPCIONES.map(a => (
                <Chip key={a} activo={datos.alimentos_gustados.includes(a)} onClick={() => toggleChip('alimentos_gustados', a)}>{a}</Chip>
              ))}
            </div>
            <Continuar onClick={avanzar} disabled={datos.alimentos_gustados.length === 0}>
              {datos.alimentos_gustados.length === 0 ? 'Elige al menos uno' : `Continuar con ${datos.alimentos_gustados.length}`}
            </Continuar>
          </>
        )

      case 9:
        return (
          <>
            <Titulo sub='Bruce los dejará fuera de tu plan. Puedes saltar este paso.'>¿Qué alimentos no te gustan?</Titulo>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {NO_GUSTADOS_OPCIONES.map(a => (
                <Chip key={a} tint='var(--red)' activo={datos.alimentos_no_gustados.includes(a)} onClick={() => toggleChip('alimentos_no_gustados', a)}>{a}</Chip>
              ))}
            </div>
            <Continuar onClick={avanzar}>
              {datos.alimentos_no_gustados.length === 0 ? 'Saltar' : `Continuar (${datos.alimentos_no_gustados.length} fuera)`}
            </Continuar>
          </>
        )

      case 10:
        return (
          <>
            <Titulo sub='Dietas especiales o alimentos que evitas por salud o creencias'>¿Tienes alguna restricción?</Titulo>
            {RESTRICCIONES_ONBOARDING.map(({ id, label, emoji }) => (
              <Opcion
                key={id}
                activa={datos.restricciones_dieta.includes(id)}
                emoji={emoji}
                label={label}
                onClick={() => {
                  if (id === 'ninguna') {
                    set('restricciones_dieta', datos.restricciones_dieta.includes('ninguna') ? [] : ['ninguna'])
                  } else {
                    setDatos(d => {
                      const sinNinguna = d.restricciones_dieta.filter(r => r !== 'ninguna')
                      return {
                        ...d,
                        restricciones_dieta: sinNinguna.includes(id) ? sinNinguna.filter(r => r !== id) : [...sinNinguna, id],
                      }
                    })
                  }
                }}
              />
            ))}
            {error && <p role='alert' className='nf-footnote' style={{ color: 'var(--red)', textAlign: 'center', marginTop: '8px' }}>{error}</p>}
            <Continuar onClick={finalizar}>Generar mi plan</Continuar>
          </>
        )

      default: return null
    }
  }

  return (
    <div style={{
      minHeight: 'var(--app-h)', display: 'flex', flexDirection: 'column',
      padding: 'calc(var(--safe-top) + 12px) 20px calc(var(--safe-bottom) + 20px)',
      overflowX: 'hidden',
    }}>
      {paso > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', marginLeft: '-12px' }}>
          <button onClick={anterior} className='nf-icon-btn' aria-label='Paso anterior'>
            <IconChevronLeft size={26} strokeWidth={2.2} />
          </button>
          <ProgressBar paso={paso - 1} total={TOTAL_PASOS} />
          <span className='nf-caption nf-num' style={{ width: '40px', textAlign: 'right' }}>{paso}/{TOTAL_PASOS}</span>
        </div>
      )}
      <div key={paso} style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: animacionPaso }}>
        {renderPaso()}
      </div>
    </div>
  )
}
