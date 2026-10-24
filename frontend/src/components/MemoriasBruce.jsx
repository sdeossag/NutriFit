// Ajustes → Lo que Bruce sabe de ti. Bruce guarda datos duraderos que le cuentas
// en el chat (gustos, horarios, lesiones…); aquí se ven y se borran. Borrar es
// inmediato; si el servidor falla, el recuerdo vuelve a la lista.
import { useEffect, useState } from 'react'
import { IconBrain, IconChevronLeft, IconChevronRight, IconTrash } from '@tabler/icons-react'
import { getMemoriasBruce, borrarMemoriaBruce } from '../api'
import { toast } from '../lib/toast'
import { haptic } from '../lib/motion'

export function FilaMemorias({ onAbrir }) {
  return (
    <button onClick={onAbrir} className='nf-row nf-press-soft' style={{ '--row-inset': '60px', width: '100%', textAlign: 'left' }}>
      <span className='nf-row-icon' style={{ '--tint': 'var(--purple)' }}><IconBrain size={18} /></span>
      <span style={{ flex: 1, fontSize: '15px' }}>Lo que Bruce sabe de ti</span>
      <IconChevronRight size={18} color='var(--label-4)' aria-hidden='true' />
    </button>
  )
}

export function PaginaMemorias({ onVolver }) {
  const [memorias, setMemorias] = useState(null)

  useEffect(() => {
    getMemoriasBruce().then(setMemorias).catch(() => {
      setMemorias([])
      toast.error('No se pudo cargar lo que Bruce recuerda.')
    })
  }, [])

  const borrar = async (m) => {
    haptic(10)
    setMemorias(prev => prev.filter(x => x.id !== m.id))
    try {
      await borrarMemoriaBruce(m.id)
    } catch {
      setMemorias(prev => [...prev, m].sort((a, b) => a.id - b.id))
      toast.error('No se pudo borrar. Intenta de nuevo.')
    }
  }

  return (
    <div className='nf-pagina-push'>
      <button onClick={onVolver} className='nf-btn nf-btn--plain' style={{ '--tint': 'var(--green)', padding: '0 4px', marginLeft: '-6px' }}>
        <IconChevronLeft size={22} /> Ajustes
      </button>
      <h2 className='nf-title-2' style={{ margin: '6px 4px 4px' }}>Lo que Bruce sabe de ti</h2>
      <p className='nf-footnote' style={{ margin: '0 4px 16px' }}>
        Bruce guarda lo que le cuentas en el chat y sirve en otras conversaciones. Borra lo que ya no sea cierto.
      </p>

      {memorias === null ? (
        <div className='nf-skeleton' style={{ height: '120px', borderRadius: 'var(--r-lg)' }} aria-busy='true' />
      ) : memorias.length === 0 ? (
        <div className='nf-card' style={{ padding: '24px 16px', textAlign: 'center' }}>
          <p className='nf-headline' style={{ marginBottom: '4px' }}>Todavía no recuerda nada</p>
          <p className='nf-footnote'>Cuéntale en el chat a qué hora entrenas, qué no te gusta o qué equipo tienes.</p>
        </div>
      ) : (
        <ul className='nf-card' style={{ listStyle: 'none', overflow: 'hidden' }}>
          {memorias.map(m => (
            <li key={m.id} className='nf-row' style={{ '--row-inset': '16px', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: '15px' }}>{m.texto}</span>
              <button onClick={() => borrar(m)} className='nf-icon-btn nf-icon-btn--sm' aria-label={`Olvidar: ${m.texto}`} style={{ color: 'var(--red)' }}>
                <IconTrash size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
