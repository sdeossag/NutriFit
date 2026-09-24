// Qué versión de "Novedades" ya vio esta persona en este dispositivo.
// Al cambiar VERSION_NOVEDADES la hoja vuelve a abrirse una vez.
export const VERSION_NOVEDADES = '2026-09-plan-y-rutinas'
const CLAVE = 'nf_novedades_vistas'

export const novedadesPendientes = () => {
  try { return localStorage.getItem(CLAVE) !== VERSION_NOVEDADES } catch { return false }
}
export const marcarNovedadesVistas = () => {
  try { localStorage.setItem(CLAVE, VERSION_NOVEDADES) } catch { /* sin almacenamiento: no pasa nada */ }
}
