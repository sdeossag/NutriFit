import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// iOS, app instalada en la pantalla de inicio: WebKit calcula el área visible
// restando la barra de estado y deja una franja muerta abajo. Medimos cuánto
// falta de verdad (si Apple lo corrige, da 0) y lo exponemos como --ios-gap.
function medirFranjaIOS() {
  const raiz = document.documentElement
  if (window.navigator.standalone !== true) {
    raiz.style.setProperty('--ios-gap', '0px')
    return
  }
  // Con el teclado abierto las medidas no sirven: se conserva el último valor
  if (document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')) return

  const sonda = document.createElement('div')
  sonda.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(sonda)
  const altoVisible = sonda.getBoundingClientRect().height
  sonda.remove()

  const vertical = window.matchMedia('(orientation: portrait)').matches
  const altoPantalla = vertical
    ? Math.max(window.screen.width, window.screen.height)
    : Math.min(window.screen.width, window.screen.height)
  const franja = Math.round(altoPantalla - altoVisible)
  raiz.style.setProperty('--ios-gap', franja > 1 && franja < 120 ? `${franja}px` : '0px')
}

medirFranjaIOS()
window.addEventListener('resize', medirFranjaIOS)
window.addEventListener('orientationchange', () => setTimeout(medirFranjaIOS, 300))
document.addEventListener('focusout', () => setTimeout(medirFranjaIOS, 300))

createRoot(document.getElementById('root')).render(<App />)
