// API de avisos. El componente <Toaster /> se suscribe y muestra uno a la vez.
// Uso: toast('Comida eliminada', { action: { label: 'Deshacer', onClick } })
let listener = null
let seq = 0

export function subscribeToasts(fn) {
  listener = fn
  return () => { if (listener === fn) listener = null }
}

export function toast(message, { action, type = 'info', duration } = {}) {
  // Con acción ("Deshacer") se da más tiempo para decidir
  listener?.({ id: ++seq, message, action, type, duration: duration ?? (action ? 5500 : 3500) })
}
toast.error   = (message, opts) => toast(message, { ...opts, type: 'error' })
toast.success = (message, opts) => toast(message, { ...opts, type: 'success' })
