import { useState, useEffect } from 'react'
import { completarOnboarding, generarPlanGroq, agregarAAlacena } from '../api'

// ── Configuración de pasos ────────────────────────────────────────────────────

const ALIMENTOS_OPCIONES = [
  'Pollo','Res','Cerdo','Pescado','Atún','Huevos','Tofu',
  'Arroz','Papa','Pasta','Plátano','Yuca','Quinoa','Avena',
  'Brócoli','Espinaca','Zanahoria','Aguacate','Tomate',
  'Frijoles','Lentejas','Garbanzo',
  'Leche','Queso','Yogur','Whey protein',
  'Mango','Banano','Fresas','Naranja',
]

const NO_GUSTADOS_OPCIONES = [
  'Hígado','Sardinas','Coliflor','Remolacha','Cebolla cruda',
  'Ají picante','Cilantro','Tofu','Brócoli','Espinaca',
  'Pepino','Rábano','Berenjenas','Champiñones','Acelga',
]

const RESTRICCIONES_OPCIONES = [
  { id: 'ninguna',        label: 'Ninguna',           emoji: '✅' },
  { id: 'vegetariano',    label: 'Vegetariano',        emoji: '🥦' },
  { id: 'vegano',         label: 'Vegano',             emoji: '🌱' },
  { id: 'sin_gluten',     label: 'Sin gluten',         emoji: '🌾' },
  { id: 'sin_lacteos',    label: 'Sin lácteos',        emoji: '🥛' },
  { id: 'sin_cerdo',      label: 'Sin cerdo',          emoji: '🐷' },
  { id: 'halal',          label: 'Halal',              emoji: '☪️'  },
]

// ── Componentes base ──────────────────────────────────────────────────────────

const S = {
  wrap: {
    minHeight: '100vh', background: '#0a0a0a', color: '#fff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    display: 'flex', flexDirection: 'column',
    padding: '0 24px', boxSizing: 'border-box',
  },
  title: {
    fontSize: '28px', fontWeight: '700', letterSpacing: '-0.8px',
    lineHeight: 1.15, marginBottom: '10px',
  },
  subtitle: {
    fontSize: '15px', color: 'rgba(255,255,255,0.4)',
    marginBottom: '36px', lineHeight: 1.5,
  },
  card: (active) => ({
    background: active ? 'rgba(74,222,128,0.08)' : '#131313',
    border: `1.5px solid ${active ? '#4ade80' : 'rgba(255,255,255,0.07)'}`,
    borderRadius: '18px', padding: '18px 20px',
    cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: '14px',
    marginBottom: '10px',
  }),
  chip: (active) => ({
    background: active ? '#4ade80' : 'rgba(255,255,255,0.06)',
    color: active ? '#000' : 'rgba(255,255,255,0.7)',
    border: `1px solid ${active ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: '20px', padding: '8px 14px',
    fontSize: '13px', fontWeight: active ? '600' : '400',
    cursor: 'pointer', transition: 'all 0.18s',
    display: 'inline-block', margin: '4px',
  }),
  btn: (disabled) => ({
    width: '100%', padding: '17px',
    background: disabled ? 'rgba(255,255,255,0.06)' : '#4ade80',
    color: disabled ? 'rgba(255,255,255,0.2)' : '#000',
    border: 'none', borderRadius: '16px',
    fontSize: '16px', fontWeight: '700',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.2s', letterSpacing: '-0.2px',
  }),
  input: {
    width: '100%', background: '#131313',
    border: '1.5px solid rgba(255,255,255,0.1)',
    borderRadius: '16px', color: '#fff',
    fontSize: '32px', fontWeight: '700',
    padding: '20px', outline: 'none',
    textAlign: 'center', boxSizing: 'border-box',
    fontFamily: 'inherit', letterSpacing: '-1px',
  },
}

// Barra de progreso
function ProgressBar({ paso, total }) {
  return (
    <div style={{ display: 'flex', gap: '5px', marginBottom: '40px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: '3px', borderRadius: '2px',
          background: i <= paso ? '#4ade80' : 'rgba(255,255,255,0.1)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// Botón atrás
function BtnBack({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
      fontSize: '15px', cursor: 'pointer', padding: '0',
      marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      ← Atrás
    </button>
  )
}

// ── Pantalla de generando plan ────────────────────────────────────────────────

function PantallaGenerando({ nombre }) {
  const [msg, setMsg] = useState(0)
  const msgs = [
    '⚡ Calculando tu TDEE…',
    '🧠 Analizando tus preferencias…',
    '🥗 Diseñando tu plan de comidas…',
    '🎯 Ajustando macros a tu objetivo…',
    '✨ Casi listo…',
  ]

  useEffect(() => {
    const id = setInterval(() => setMsg(m => (m + 1) % msgs.length), 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      ...S.wrap, alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    }}>
      <div style={{ fontSize: '64px', marginBottom: '28px', filter: 'drop-shadow(0 0 30px rgba(74,222,128,0.4))' }}>🦇</div>
      <p style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px' }}>
        Hola, {nombre?.split(' ')[0]} 👋
      </p>
      <p style={{
        fontSize: '15px', color: '#4ade80', fontWeight: '600',
        minHeight: '24px', transition: 'opacity 0.4s',
      }}>
        {msgs[msg]}
      </p>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
        Groq IA está construyendo tu plan personalizado
      </p>
      {/* Animación de puntos */}
      <div style={{ marginTop: '40px', display: 'flex', gap: '8px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#4ade80',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

// ── Pantalla de bienvenida al plan ────────────────────────────────────────────

function PantallaPlan({ plan, calorias, proteina, carbos, grasas, onEntrar }) {
  return (
    <div style={{ ...S.wrap, paddingTop: '60px', paddingBottom: '40px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ ...S.title, textAlign: 'center' }}>Tu plan está listo</h2>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
          {plan?.plan_descripcion}
        </p>
      </div>

      {/* Macros resumen */}
      <div style={{
        background: '#131313', borderRadius: '20px',
        border: '0.5px solid rgba(255,255,255,0.07)',
        padding: '20px', marginBottom: '20px',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '16px',
      }}>
        {[
          { label: 'Calorías', val: calorias, unit: 'kcal', color: '#4ade80' },
          { label: 'Proteína', val: proteina, unit: 'g',    color: '#60a5fa' },
          { label: 'Carbos',   val: carbos,   unit: 'g',    color: '#f97316' },
          { label: 'Grasas',   val: grasas,   unit: 'g',    color: '#a78bfa' },
        ].map(({ label, val, unit, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: '26px', fontWeight: '700', color, letterSpacing: '-1px' }}>{val}<span style={{ fontSize: '12px', fontWeight: '400', color: 'rgba(255,255,255,0.3)', marginLeft: '2px' }}>{unit}</span></p>
          </div>
        ))}
      </div>

      {/* Lista de alimentos del plan */}
      <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {plan?.alimentos?.length} alimentos guardados en tu alacena
      </p>
      <div style={{ marginBottom: '28px' }}>
        {plan?.alimentos?.slice(0, 6).map((a, i) => (
          <div key={i} style={{
            background: '#131313', borderRadius: '14px',
            border: '0.5px solid rgba(255,255,255,0.06)',
            padding: '12px 16px', marginBottom: '8px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>{a.nombre}</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{a.descripcion}</p>
            </div>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#4ade80' }}>{a.calorias} kcal</p>
          </div>
        ))}
        {plan?.alimentos?.length > 6 && (
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px' }}>
            +{plan.alimentos.length - 6} más en tu alacena
          </p>
        )}
      </div>

      <button onClick={onEntrar} style={S.btn(false)}>
        Entrar a NutriFit 🚀
      </button>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ usuario, onComplete }) {
  const [paso,    setPaso]    = useState(0)
  const [visible, setVisible] = useState(true)
  const [datos,   setDatos]   = useState({
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
  const [fase,    setFase]    = useState('pasos')   // 'pasos' | 'generando' | 'plan'
  const [plan,    setPlan]    = useState(null)
  const [error,   setError]   = useState(null)

  const TOTAL_PASOS = 9

  // Animación de transición entre pasos
  const irAPaso = (n) => {
    setVisible(false)
    setTimeout(() => { setPaso(n); setVisible(true) }, 220)
  }

  const siguiente = () => irAPaso(paso + 1)
  const anterior  = () => irAPaso(paso - 1)

  const set = (campo, valor) => setDatos(d => ({ ...d, [campo]: valor }))

  const toggleChip = (campo, valor) => {
    setDatos(d => {
      const arr = d[campo]
      return { ...d, [campo]: arr.includes(valor) ? arr.filter(x => x !== valor) : [...arr, valor] }
    })
  }

  // Enviar onboarding + generar plan
  const finalizar = async () => {
    setFase('generando')
    try {
      const payload = {
        ...datos,
        estatura_cm:     parseInt(datos.estatura_cm),
        peso_inicial_kg: parseFloat(datos.peso_inicial_kg),
        peso_objetivo_kg: datos.peso_objetivo_kg ? parseFloat(datos.peso_objetivo_kg) : null,
        restricciones_dieta: datos.restricciones_dieta.filter(r => r !== 'ninguna'),
      }
      const usuarioActualizado = await completarOnboarding(payload)

      // Generar plan con Groq
      const planData = await generarPlanGroq()

      // Guardar alimentos en la alacena
      if (planData?.alimentos?.length) {
        await Promise.all(
          planData.alimentos.map(a => agregarAAlacena(a).catch(() => {}))
        )
      }

      setPlan(planData)
      setFase('plan')
      // Guardar usuario actualizado para cuando entren a la app
      window._usuarioOnboarding = usuarioActualizado

    } catch (e) {
      setError('Hubo un error. Intenta de nuevo.')
      setFase('pasos')
    }
  }

  const entrarApp = () => {
    onComplete(window._usuarioOnboarding)
  }

  // ── Render de fases especiales ─────────────────────────────────────────────

  if (fase === 'generando') {
    return <PantallaGenerando nombre={usuario.first_name} />
  }

  if (fase === 'plan' && plan) {
    return (
      <PantallaPlan
        plan={plan}
        calorias={window._usuarioOnboarding?.meta_calorias}
        proteina={window._usuarioOnboarding?.meta_proteina}
        carbos={window._usuarioOnboarding?.meta_carbos}
        grasas={window._usuarioOnboarding?.meta_grasas}
        onEntrar={entrarApp}
      />
    )
  }

  // ── Estilos de transición ──────────────────────────────────────────────────

  const transStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 0.22s ease, transform 0.22s ease',
  }

  // ── Pasos ──────────────────────────────────────────────────────────────────

  const renderPaso = () => {
    switch (paso) {

      // 0 — Bienvenida
      case 0:
        return (
          <div style={transStyle}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>🦇</div>
              <h1 style={{ ...S.title, textAlign: 'center', fontSize: '32px' }}>
                Hola, {usuario.first_name?.split(' ')[0]} 👋
              </h1>
              <p style={{ ...S.subtitle, textAlign: 'center' }}>
                Vamos a crear tu plan nutricional personalizado.<br />Son solo 2 minutos.
              </p>
            </div>
            <button onClick={siguiente} style={S.btn(false)}>Empezar →</button>
          </div>
        )

      // 1 — Sexo biológico
      case 1:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Cuál es tu<br />sexo biológico?</h2>
            <p style={S.subtitle}>Afecta el cálculo de tu metabolismo basal</p>
            {[
              { val: 'M', label: 'Masculino', emoji: '♂️' },
              { val: 'F', label: 'Femenino',  emoji: '♀️' },
            ].map(({ val, label, emoji }) => (
              <div key={val} onClick={() => { set('sexo', val); setTimeout(siguiente, 200) }}
                style={S.card(datos.sexo === val)}>
                <span style={{ fontSize: '28px' }}>{emoji}</span>
                <span style={{ fontSize: '17px', fontWeight: '600' }}>{label}</span>
                {datos.sexo === val && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '20px' }}>✓</span>}
              </div>
            ))}
          </div>
        )

      // 2 — Fecha de nacimiento
      case 2:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Cuándo<br />naciste?</h2>
            <p style={S.subtitle}>Para calcular tu edad y ajustar las calorías</p>
            <input
              type='date'
              value={datos.fecha_nacimiento}
              onChange={e => set('fecha_nacimiento', e.target.value)}
              max={new Date(Date.now() - 13 * 365.25 * 86400000).toISOString().split('T')[0]}
              style={{
                ...S.input, fontSize: '18px', textAlign: 'left',
                padding: '18px 20px', marginBottom: '24px',
                colorScheme: 'dark',
              }}
            />
            <button
              onClick={siguiente}
              disabled={!datos.fecha_nacimiento}
              style={S.btn(!datos.fecha_nacimiento)}
            >Continuar →</button>
          </div>
        )

      // 3 — Estatura
      case 3:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Cuánto<br />mides?</h2>
            <p style={S.subtitle}>En centímetros</p>
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <input
                type='number' inputMode='numeric'
                value={datos.estatura_cm}
                onChange={e => set('estatura_cm', e.target.value)}
                placeholder='175'
                min={100} max={250}
                style={S.input}
              />
              <span style={{
                position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '18px', color: 'rgba(255,255,255,0.3)', fontWeight: '600',
              }}>cm</span>
            </div>
            <button
              onClick={siguiente}
              disabled={!datos.estatura_cm || datos.estatura_cm < 100}
              style={S.btn(!datos.estatura_cm || datos.estatura_cm < 100)}
            >Continuar →</button>
          </div>
        )

      // 4 — Peso actual
      case 4:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Cuánto<br />pesas ahora?</h2>
            <p style={S.subtitle}>Tu peso actual en kilogramos</p>
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <input
                type='number' inputMode='decimal'
                value={datos.peso_inicial_kg}
                onChange={e => set('peso_inicial_kg', e.target.value)}
                placeholder='70.0'
                min={30} max={250} step={0.1}
                style={S.input}
              />
              <span style={{
                position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '18px', color: 'rgba(255,255,255,0.3)', fontWeight: '600',
              }}>kg</span>
            </div>
            <button
              onClick={siguiente}
              disabled={!datos.peso_inicial_kg || datos.peso_inicial_kg < 30}
              style={S.btn(!datos.peso_inicial_kg || datos.peso_inicial_kg < 30)}
            >Continuar →</button>
          </div>
        )

      // 5 — Objetivo
      case 5:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Cuál es<br />tu objetivo?</h2>
            <p style={S.subtitle}>Esto define tus calorías diarias</p>
            {[
              { val: 'perder',   label: 'Perder grasa',   emoji: '🔥', desc: 'Déficit calórico controlado' },
              { val: 'mantener', label: 'Mantener peso',  emoji: '⚖️', desc: 'Calorías de mantenimiento' },
              { val: 'ganar',    label: 'Ganar músculo',  emoji: '💪', desc: 'Superávit para crecer' },
            ].map(({ val, label, emoji, desc }) => (
              <div key={val} onClick={() => { set('objetivo', val); setTimeout(siguiente, 200) }}
                style={S.card(datos.objetivo === val)}>
                <span style={{ fontSize: '28px' }}>{emoji}</span>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '2px' }}>{label}</p>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{desc}</p>
                </div>
                {datos.objetivo === val && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '20px' }}>✓</span>}
              </div>
            ))}
          </div>
        )

      // 6 — Velocidad (solo si perder o ganar)
      case 6:
        if (datos.objetivo === 'mantener') {
          // Saltar este paso
          if (datos.velocidad_objetivo !== 'moderado') set('velocidad_objetivo', 'moderado')
          siguiente()
          return null
        }
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿A qué<br />velocidad?</h2>
            <p style={S.subtitle}>El ritmo con el que quieres alcanzar tu meta</p>
            {[
              { val: 'suave',    label: 'Suave',    emoji: '🐢', desc: datos.objetivo === 'perder' ? '~0.25 kg/sem' : '+0.25 kg/sem', extra: 'Más sostenible' },
              { val: 'moderado', label: 'Moderado', emoji: '🏃', desc: datos.objetivo === 'perder' ? '~0.5 kg/sem'  : '+0.4 kg/sem',  extra: 'Recomendado' },
              { val: 'agresivo', label: 'Agresivo', emoji: '🚀', desc: datos.objetivo === 'perder' ? '~1 kg/sem'    : '+0.5 kg/sem',  extra: 'Requiere disciplina' },
            ].map(({ val, label, emoji, desc, extra }) => (
              <div key={val} onClick={() => { set('velocidad_objetivo', val); setTimeout(siguiente, 200) }}
                style={S.card(datos.velocidad_objetivo === val)}>
                <span style={{ fontSize: '28px' }}>{emoji}</span>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '2px' }}>{label}</p>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{desc} · {extra}</p>
                </div>
                {datos.velocidad_objetivo === val && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '20px' }}>✓</span>}
              </div>
            ))}
          </div>
        )

      // 7 — Actividad física
      case 7:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Qué tan activo<br />eres?</h2>
            <p style={S.subtitle}>Fuera del gym, en tu día a día</p>
            {[
              { val: 'sedentario', label: 'Sedentario',    emoji: '🛋️', desc: 'Trabajo de escritorio, poco movimiento' },
              { val: 'ligero',     label: 'Ligero',         emoji: '🚶', desc: '1-3 días de ejercicio por semana' },
              { val: 'moderado',   label: 'Moderado',       emoji: '🚴', desc: '3-5 días de ejercicio por semana' },
              { val: 'activo',     label: 'Activo',         emoji: '🏋️', desc: '6-7 días de ejercicio' },
              { val: 'muy_activo', label: 'Muy activo',     emoji: '⚡', desc: 'Doble sesión o trabajo físico' },
            ].map(({ val, label, emoji, desc }) => (
              <div key={val} onClick={() => { set('nivel_actividad', val); setTimeout(siguiente, 200) }}
                style={{ ...S.card(datos.nivel_actividad === val), marginBottom: '8px' }}>
                <span style={{ fontSize: '24px' }}>{emoji}</span>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>{label}</p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{desc}</p>
                </div>
                {datos.nivel_actividad === val && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '18px' }}>✓</span>}
              </div>
            ))}
          </div>
        )

      // 8 — Alimentos que le gustan
      case 8:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Qué alimentos<br />te gustan?</h2>
            <p style={S.subtitle}>Selecciona todos los que quieras. Groq los usará para crear tu plan.</p>
            <div style={{ marginBottom: '24px', maxHeight: '320px', overflowY: 'auto' }}>
              {ALIMENTOS_OPCIONES.map(a => (
                <span key={a} onClick={() => toggleChip('alimentos_gustados', a)}
                  style={S.chip(datos.alimentos_gustados.includes(a))}>
                  {a}
                </span>
              ))}
            </div>
            <button
              onClick={siguiente}
              disabled={datos.alimentos_gustados.length === 0}
              style={S.btn(datos.alimentos_gustados.length === 0)}
            >
              {datos.alimentos_gustados.length === 0 ? 'Selecciona al menos uno' : `Continuar con ${datos.alimentos_gustados.length} →`}
            </button>
          </div>
        )

      // 9 — Restricciones + finalizar
      case 9:
        return (
          <div style={transStyle}>
            <BtnBack onClick={anterior} />
            <h2 style={S.title}>¿Tienes alguna<br />restricción?</h2>
            <p style={S.subtitle}>Dietas especiales o alimentos que evitas</p>
            <div style={{ marginBottom: '20px' }}>
              {RESTRICCIONES_OPCIONES.map(({ id, label, emoji }) => (
                <div key={id} onClick={() => {
                  if (id === 'ninguna') {
                    set('restricciones_dieta', datos.restricciones_dieta.includes('ninguna') ? [] : ['ninguna'])
                  } else {
                    toggleChip('restricciones_dieta', id)
                  }
                }} style={S.card(datos.restricciones_dieta.includes(id))}>
                  <span style={{ fontSize: '22px' }}>{emoji}</span>
                  <span style={{ fontSize: '15px', fontWeight: '600' }}>{label}</span>
                  {datos.restricciones_dieta.includes(id) && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: '18px' }}>✓</span>}
                </div>
              ))}
            </div>
            {error && <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', marginBottom: '12px' }}>{error}</p>}
            <button onClick={finalizar} style={S.btn(false)}>
              Generar mi plan con IA 🚀
            </button>
          </div>
        )

      default: return null
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#fff',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      display: 'flex', flexDirection: 'column',
      padding: '56px 24px 40px', boxSizing: 'border-box',
      maxWidth: '430px', margin: '0 auto',
    }}>
      {paso > 0 && <ProgressBar paso={paso - 1} total={TOTAL_PASOS} />}
      {renderPaso()}
    </div>
  )
}