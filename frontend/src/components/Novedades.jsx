// "Novedades": se abre sola una vez por versión, la primera vez que la persona
// entra después de actualizar. Estilo "What's New" de iOS: título grande, filas
// con icono de color y un solo botón. Las cuentas nuevas no la ven (para ellas
// todo es nuevo); se marca como vista al terminar el onboarding.
import { useState } from 'react'
import {
  IconSparkles, IconBarbell, IconBooks, IconToolsKitchen2, IconMessageCircle,
  IconSalad, IconBell, IconTrophy, IconShieldCheck,
} from '@tabler/icons-react'
import Sheet from './Sheet'
import { marcarNovedadesVistas, novedadesPendientes } from '../utils/novedades'

const NOVEDADES = [
  { icono: IconSparkles, tint: 'var(--green)', titulo: 'Bruce arma tu semana',
    texto: 'Dile qué días entrenas, cuánto tiempo tienes, dónde y tu nivel, y te arma las rutinas según tu objetivo.' },
  { icono: IconBarbell, tint: 'var(--orange)', titulo: 'Rutinas a tu manera',
    texto: 'Cada rutina tiene su color y el emoji que quieras. Hasta 3 por día para doble entreno, se pliegan, y puedes cambiar o intercambiar días con deshacer.' },
  { icono: IconBooks, tint: 'var(--blue)', titulo: 'Mis ejercicios',
    texto: 'Edita o elimina cualquier ejercicio, también los que venían por defecto. Si lo cambias, se actualiza en tus rutinas.' },
  { icono: IconToolsKitchen2, tint: 'var(--orange)', titulo: 'Plan del día de Bruce',
    texto: 'Comidas para hoy o mañana con lo que te falta de tus metas. Pide otra opción, regístralas con un toque o mándale foto del plato y revisa la porción.' },
  { icono: IconMessageCircle, tint: 'var(--green)', titulo: 'El chat cambia tu plan',
    texto: '"Cámbiame la cena por algo con huevo": Bruce lo hace de una vez y puedes deshacerlo desde el chat. Además ya conoce cómo te fue en la semana.' },
  { icono: IconSalad, tint: 'var(--cyan)', titulo: 'Alimentación en Ajustes',
    texto: 'Tus gustos, restricciones y alergias en un solo lugar. Nueva opción "Sin vegetales": nada de ensaladas, pero sí verduras escondidas en sopas y guisos.' },
  { icono: IconBell, tint: 'var(--red)', titulo: 'Notificaciones que sirven',
    texto: 'Eliges qué te avisa y a qué hora. Si ya comiste, fuiste al gym o tomaste agua, no suenan. Y Bruce escribe como Bruce, no como un robot.' },
  { icono: IconTrophy, tint: 'var(--yellow)', titulo: 'Logros por niveles',
    texto: 'Bronce, plata, oro y más. Cada logro sube de nivel a medida que avanzas.' },
]

const NOTAS = [
  'Activa otra vez las notificaciones en Ajustes → Notificaciones: cambiamos cómo se envían y hay que darles permiso de nuevo.',
  'Tus rutinas siguen como estaban. Solo las cuentas nuevas empiezan sin rutinas para que Bruce les arme la suya.',
  'La sesión ya no se cierra sola cada pocas horas y tu foto de perfil queda guardada en tu cuenta.',
  'Las rachas respetan tus días de descanso y las sesiones del gym se marcan completas bien.',
  'En iPhone, si la barra de abajo se ve corrida, borra NutriFit de la pantalla de inicio y vuelve a agregarlo.',
]

export default function Novedades() {
  const [abierta, setAbierta] = useState(novedadesPendientes)

  const cerrar = () => { marcarNovedadesVistas(); setAbierta(false) }

  return (
    <Sheet open={abierta} onClose={cerrar} large label='Novedades de NutriFit'>
      <div style={{ padding: '4px 20px 0' }}>
        <p className='nf-caption' style={{ color: 'var(--green)', fontWeight: 600, marginBottom: '4px' }}>Actualización</p>
        <h2 className='nf-large-title' style={{ marginBottom: '6px' }}>Novedades</h2>
        <p className='nf-subhead' style={{ marginBottom: '24px' }}>Esto es lo que cambió en NutriFit.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
          {NOVEDADES.map(({ icono: Icono, tint, titulo, texto }, i) => (
            <div key={titulo} className='nf-enter' style={{ display: 'flex', gap: '14px', animationDelay: `${120 + i * 40}ms` }}>
              <span className='nf-row-icon' style={{ '--tint': tint, width: 40, height: 40, borderRadius: 12, flexShrink: 0 }}>
                <Icono size={22} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className='nf-headline' style={{ display: 'block', marginBottom: '2px' }}>{titulo}</span>
                <span className='nf-footnote' style={{ display: 'block', lineHeight: 1.4 }}>{texto}</span>
              </span>
            </div>
          ))}
        </div>

        <h3 className='nf-section-label' style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IconShieldCheck size={15} /> Notas de la actualización
        </h3>
        <div className='nf-card' style={{ padding: '14px 16px', marginBottom: '20px' }}>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {NOTAS.map(n => <li key={n} className='nf-footnote' style={{ lineHeight: 1.4 }}>{n}</li>)}
          </ul>
        </div>

        {/* El botón queda siempre a mano; el contenido pasa por debajo */}
        <div style={{
          position: 'sticky', bottom: 0, margin: '0 -20px', padding: '28px 20px calc(var(--safe-bottom, 0px) + 12px)',
          background: 'linear-gradient(to bottom, transparent, var(--surface-2) 45%)',
        }}>
          <button onClick={cerrar} className='nf-btn nf-btn--primary nf-btn--block nf-btn--lg'>Continuar</button>
        </div>
      </div>
    </Sheet>
  )
}
