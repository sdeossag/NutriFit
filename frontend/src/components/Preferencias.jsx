// Ajustes → Alimentación: gustos, lo que no te gusta, alergias y restricciones.
// Navegación tipo Ajustes de iOS: cada grupo es una página que entra desde la
// derecha y vuelve por el mismo camino. Los cambios se guardan al instante
// (sin botón "Guardar"); si el servidor falla, vuelve el valor anterior.
import { useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconAlertTriangle, IconHeart, IconMoodSad, IconLeaf } from '@tabler/icons-react'
import { ALERGIAS_OPCIONES, ALIMENTOS_OPCIONES, NO_GUSTADOS_OPCIONES, RESTRICCIONES_OPCIONES } from '../constants/alimentacion'
import { haptic } from '../lib/motion'

const PAGINAS = {
  alimentos_gustados: {
    titulo: 'Me gusta', icono: IconHeart, tint: 'var(--green)', sugerencias: ALIMENTOS_OPCIONES,
    ayuda: 'Bruce los prefiere al armar tus comidas y recetas.',
  },
  alimentos_no_gustados: {
    titulo: 'No me gusta', icono: IconMoodSad, tint: 'var(--orange)', sugerencias: NO_GUSTADOS_OPCIONES,
    ayuda: 'Bruce no los usa en tu plan ni te los sugiere.',
  },
  alergias: {
    titulo: 'Alergias', icono: IconAlertTriangle, tint: 'var(--red)', sugerencias: ALERGIAS_OPCIONES,
    ayuda: 'Nunca aparecerán: ni como ingrediente menor, ni en salsas, ni en la preparación. Aun así, revisa siempre las etiquetas.',
  },
  restricciones_dieta: {
    titulo: 'Restricciones', icono: IconLeaf, tint: 'var(--blue)',
    ayuda: 'Se cumplen siempre en tu plan y en los consejos de Bruce.',
  },
}

const etiquetaRestriccion = (id) => RESTRICCIONES_OPCIONES.find(r => r.id === id)?.label ?? id

// Lo que se ve a la derecha de cada fila: cuántos hay o cuáles
function resumenPreferencia(campo, valores = []) {
  if (!valores.length) return 'Ninguna'
  if (campo === 'restricciones_dieta') return valores.map(etiquetaRestriccion).join(', ')
  return valores.length <= 2 ? valores.join(', ') : `${valores.length} alimentos`
}

// Fila de la sección Alimentación en Ajustes
export function FilaPreferencia({ campo, valores, onAbrir }) {
  const { titulo, icono: Icono, tint } = PAGINAS[campo]
  return (
    <button onClick={onAbrir} className='nf-row nf-press-soft' style={{ '--row-inset': '60px', width: '100%', textAlign: 'left' }}>
      <span className='nf-row-icon' style={{ '--tint': tint }}><Icono size={18} /></span>
      <span style={{ flex: 1, fontSize: '15px' }}>{titulo}</span>
      <span className='nf-footnote' style={{ maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {resumenPreferencia(campo, valores)}
      </span>
      <IconChevronRight size={18} color='var(--label-4)' aria-hidden='true' style={{ flexShrink: 0 }} />
    </button>
  )
}

function ListaAlimentos({ campo, valores, onCambiar }) {
  const { sugerencias, tint } = PAGINAS[campo]
  const [nuevo, setNuevo] = useState('')
  const tiene = (x) => valores.some(v => v.toLowerCase() === x.toLowerCase())

  const agregar = (texto) => {
    const limpio = texto.trim().slice(0, 40)
    if (!limpio || tiene(limpio)) return
    haptic(6)
    onCambiar([...valores, limpio])
  }
  const quitar = (texto) => { haptic(6); onCambiar(valores.filter(v => v !== texto)) }

  const libres = sugerencias.filter(s => !tiene(s))
  return (
    <>
      <div className='nf-card' style={{ padding: '14px', marginBottom: '8px' }}>
        {valores.length === 0 ? (
          <p className='nf-footnote' style={{ textAlign: 'center', padding: '8px 0' }}>Todavía no hay nada aquí.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {valores.map(v => (
              <button key={v} onClick={() => quitar(v)} className='nf-chip' aria-pressed='true' aria-label={`Quitar ${v}`} style={{ '--tint': tint }}>
                {v} <IconX size={14} strokeWidth={2.4} />
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); agregar(nuevo); setNuevo('') }}
          style={{ display: 'flex', gap: '8px', marginTop: '12px' }}
        >
          <input
            className='nf-input'
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            placeholder='Escribe un alimento…'
            aria-label='Agregar alimento'
            enterKeyHint='done'
            maxLength={40}
          />
          <button type='submit' disabled={!nuevo.trim()} className='nf-btn nf-btn--tinted' style={{ '--tint': tint, padding: '0 14px' }} aria-label='Agregar'>
            <IconPlus size={18} />
          </button>
        </form>
      </div>
      <p className='nf-caption' style={{ margin: '0 16px 18px' }}>Toca un alimento para quitarlo.</p>

      {libres.length > 0 && (
        <>
          <h3 className='nf-section-label'>Sugerencias</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 4px' }}>
            {libres.map(s => (
              <button key={s} onClick={() => agregar(s)} className='nf-chip' style={{ '--tint': 'var(--label-2)' }}>
                <IconPlus size={14} /> {s}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function ListaRestricciones({ valores, onCambiar }) {
  const alternar = (id) => {
    haptic(8)
    let nuevas = valores.includes(id) ? valores.filter(v => v !== id) : [...valores, id]
    // Vegano ya incluye vegetariano
    if (id === 'vegano' && nuevas.includes('vegano')) nuevas = nuevas.filter(v => v !== 'vegetariano')
    if (id === 'vegetariano' && nuevas.includes('vegetariano')) nuevas = nuevas.filter(v => v !== 'vegano')
    onCambiar(nuevas)
  }
  return (
    <div className='nf-card' style={{ overflow: 'hidden' }}>
      {RESTRICCIONES_OPCIONES.map(r => (
        <div key={r.id} className='nf-row' style={{ '--row-inset': '60px', alignItems: 'center' }}>
          <span className='nf-row-icon' style={{ '--tint': 'var(--blue)', fontSize: '17px' }} aria-hidden='true'>{r.emoji}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '15px' }}>{r.label}</span>
            <span className='nf-caption' style={{ display: 'block' }}>{r.desc}</span>
          </span>
          <button
            role='switch'
            aria-checked={valores.includes(r.id)}
            aria-label={r.label}
            className='nf-switch'
            onClick={() => alternar(r.id)}
            style={{ flexShrink: 0 }}
          />
        </div>
      ))}
    </div>
  )
}

// Página de un grupo. Entra desde la derecha (push) como en Ajustes de iOS.
export function PaginaPreferencia({ campo, valores, onCambiar, onVolver }) {
  const { titulo, ayuda } = PAGINAS[campo]
  return (
    <div className='nf-pagina-push'>
      <button onClick={onVolver} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--green)', padding: '0 4px', marginLeft: '-6px' }}>
        <IconChevronLeft size={22} /> Ajustes
      </button>
      <h2 className='nf-title-2' style={{ margin: '6px 4px 4px' }}>{titulo}</h2>
      <p className='nf-footnote' style={{ margin: '0 4px 16px' }}>{ayuda}</p>
      {campo === 'restricciones_dieta'
        ? <ListaRestricciones valores={valores} onCambiar={onCambiar} />
        : <ListaAlimentos campo={campo} valores={valores} onCambiar={onCambiar} />}
    </div>
  )
}
