// Muestra los avisos de lib/toast: uno a la vez, con acción opcional ("Deshacer").
import { useEffect, useRef, useState } from 'react'
import { IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react'
import { subscribeToasts } from '../lib/toast'

const ICONS = {
  error:   <IconAlertCircle size={18} color='var(--red)' />,
  success: <IconCheck size={18} color='var(--green)' strokeWidth={2.5} />,
}

export function Toaster({ low = false }) {
  const [item,  setItem]  = useState(null)
  const [state, setState] = useState('enter')
  const timer     = useRef(null)
  const remaining = useRef(0)
  const started   = useRef(0)
  const itemId    = useRef(null)

  const dismiss = () => {
    clearTimeout(timer.current)
    const id = itemId.current
    setState('exit')
    // Si llegó otro toast mientras salía, no lo borres
    setTimeout(() => setItem(cur => (cur && cur.id === id && itemId.current === id ? null : cur)), 220)
  }

  const arm = (ms) => {
    clearTimeout(timer.current)
    remaining.current = ms
    started.current = Date.now()
    timer.current = setTimeout(dismiss, ms)
  }

  useEffect(() => {
    const off = subscribeToasts((t) => {
      itemId.current = t.id
      setItem(t)
      setState('enter')
      requestAnimationFrame(() => requestAnimationFrame(() => setState('open')))
      arm(t.duration)
    })
    return () => { off(); clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pausa el temporizador si la app pasa a segundo plano
  useEffect(() => {
    const onVis = () => {
      if (!item) return
      if (document.hidden) {
        clearTimeout(timer.current)
        remaining.current -= Date.now() - started.current
      } else {
        arm(Math.max(remaining.current, 1500))
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  if (!item) return null

  return (
    <div
      className='nf-toast nf-glass'
      data-state={state === 'open' ? undefined : state}
      data-low={low}
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-live='polite'
    >
      {ICONS[item.type]}
      <span style={{ flex: 1, lineHeight: 1.35 }}>{item.message}</span>
      {item.action && (
        <button
          className='nf-btn nf-btn--sm nf-btn--tinted'
          onClick={() => { item.action.onClick(); dismiss() }}
        >
          {item.action.label}
        </button>
      )}
      <button className='nf-icon-btn nf-icon-btn--sm' onClick={dismiss} aria-label='Cerrar aviso'>
        <IconX size={16} />
      </button>
    </div>
  )
}
