// Cliente API — NutriFit

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

// ── Token helpers ─────────────────────────────────────────────────────────────

export const guardarTokens = ({ access, refresh }) => {
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

export const limpiarTokens = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export const getAccessToken  = () => localStorage.getItem('access_token')
export const getRefreshToken = () => localStorage.getItem('refresh_token')

// El servidor rota el refresh token en cada uso e invalida el anterior: hay que
// guardar el nuevo, y si varias peticiones vencen a la vez, renovar una sola vez
// (si no, la segunda usa un token ya invalidado y cierra la sesión).
let renovando = null

export const refrescarToken = () => {
  renovando ??= renovar().finally(() => { renovando = null })
  return renovando
}

const renovar = async () => {
  const refresh = getRefreshToken()
  if (!refresh) throw Object.assign(new Error('Sin refresh token'), { sesionExpirada: true })
  const res = await fetch(`${BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) {
    // Solo un token rechazado cierra la sesión. Si el servidor está caído o
    // reiniciándose (un deploy), la sesión se conserva y se reintenta luego.
    const error = new Error(`Refresh → ${res.status}`)
    error.sesionExpirada = res.status === 400 || res.status === 401
    if (error.sesionExpirada) limpiarTokens()
    throw error
  }
  const data = await res.json()
  localStorage.setItem('access_token', data.access)
  if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
  return data.access
}

// ── Helpers internos ──────────────────────────────────────────────────────────

const apiFetch = async (url, options = {}) => {
  const token = getAccessToken()
  const isFormData = options.body instanceof FormData

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  }

  let res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    try {
      const newToken = await refrescarToken()
      res = await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      })
    } catch (e) {
      if (e.sesionExpirada) window.location.reload()
      // Sin conexión: se devuelve el 401 original y quien llamó muestra el error
    }
  }

  return res
}

// Envío con cuerpo. Si falla, el error trae status y el mensaje del backend
// (pensado para mostrarse, ej. límite de la IA o un dato inválido).
const enviar = (method) => (path, body) =>
  apiFetch(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) {
      const error = new Error(`${method} ${path} → ${r.status}`)
      error.status = r.status
      try { error.mensaje = (await r.json()).error } catch { /* sin cuerpo JSON */ }
      throw error
    }
    return r.status === 204 ? null : r.json()
  })

const get   = (path) => enviar('GET')(path)
const post  = enviar('POST')
const patch = enviar('PATCH')
const put   = enviar('PUT')
const del_  = (path) => enviar('DELETE')(path)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const loginGoogle = async (idToken) => {
  const res = await fetch(`${BASE}/auth/google/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: idToken }),
  })
  if (!res.ok) throw new Error('Error al iniciar sesión con Google')
  const data = await res.json()
  guardarTokens(data)
  return data   // { access, refresh, usuario, nuevo }
}

export const loginApple = async ({ token, email, first_name, last_name }) => {
  const res = await fetch(`${BASE}/auth/apple/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, email, first_name, last_name }),
  })
  if (!res.ok) throw new Error('Error al iniciar sesión con Apple')
  const data = await res.json()
  guardarTokens(data)
  return data
}

export const logout = async () => {
  const refresh = getRefreshToken()
  if (refresh) {
    await post('/auth/logout/', { refresh }).catch(() => {})
  }
  limpiarTokens()
}

// ── Perfil ────────────────────────────────────────────────────────────────────

export const getMiPerfil = () => get('/auth/perfil/')

export const actualizarPerfil = (datos) => {
  let body
  if (datos.avatar instanceof File) {
    body = new FormData()
    Object.entries(datos).forEach(([k, v]) => v !== undefined && body.append(k, v))
  } else {
    body = datos
  }
  return patch('/auth/perfil/update/', body)
}

export const actualizarMetas    = (metas) => patch('/auth/perfil/metas/', metas)
export const actualizarObjetivo = (data)  => patch('/auth/perfil/objetivo/', data)

// ── Onboarding ────────────────────────────────────────────────────────────────

export const completarOnboarding = (datos) => patch('/onboarding/', datos)
export const generarPlanGroq     = ()       => post('/onboarding/plan/', {})

// ── Home ──────────────────────────────────────────────────────────────────────

export const getResumenHoy = () => get('/resumen/')

// ── Food ──────────────────────────────────────────────────────────────────────

export const getComidas      = (fecha) => get(`/comidas/?fecha=${fecha}`)
export const agregarComida   = (data)  => post('/comidas/', data)
export const eliminarComida  = (id)    => del_(`/comidas/${id}/`)
// Reemplaza las dos funciones existentes:
export const analizarFoto     = (data) => post('/analizar-foto/',    data)
export const analizarEtiqueta = (data) => post('/analizar-etiqueta/', data)

// ── Gym ───────────────────────────────────────────────────────────────────────

export const getSesionesSemana = ()       => get('/sesiones/')
export const sesionDeHoy       = ()       => get('/sesiones/hoy/')
export const getSesionFecha    = (fecha)  => get(`/sesiones/fecha/${fecha}/`)
export const registrarSesion   = (data)   => post('/sesiones/registrar/', data)
export const logEjercicio      = (data)   => post('/ejercicios/log/', data)

// ── Progress ──────────────────────────────────────────────────────────────────

export const getProgresoSemanal  = ()     => get('/progreso/')
export const getProgresoCompleto = ()     => get('/progreso-completo/')
export const registrarPeso       = (data) => post('/peso/', data)

// ── Alacena ───────────────────────────────────────────────────────────────────

export const getAlacena       = ()          => get('/alacena/')
export const agregarAAlacena  = (data)      => post('/alacena/', data)
export const editarAlacena    = (id, data)  => patch(`/alacena/${id}/`, data)
export const eliminarAlacena  = (id)        => del_(`/alacena/${id}/`)
export const usarAlacena      = (id, data)  => post(`/alacena/${id}/usar/`, data)
export const getBruceFrase = (contexto) => post('/bruce/frase/', contexto)

// ── Chat Bruce ────────────────────────────────────────────────────────────
export const getSesionesChatBruce  = ()        => get('/chat/')
export const crearSesionChat       = ()        => post('/chat/', {})
export const getSesionChat         = (id)      => get(`/chat/${id}/`)
export const eliminarSesionChat    = (id)      => del_(`/chat/${id}/`)
export const enviarMensajeBruce    = (id, msg) => post(`/chat/${id}/mensaje/`, { mensaje: msg })
// sesionDeHoy ya existe en tu api.js
export const getHistorialEjercicios = () => get('/ejercicios/historial/')

// ── Rutinas (paquetes) y la semana que las asigna ────────────────────────
export const getRutinas       = ()         => get('/rutinas/')
export const crearRutina      = (data)     => post('/rutinas/', data)
export const editarRutina     = (id, data) => patch(`/rutinas/${id}/`, data)
export const eliminarRutina   = (id)       => del_(`/rutinas/${id}/`)
export const asignarSemana    = (semana)   => put('/rutinas/semana/', { semana })

// ── Logros ───────────────────────────────────────────────────────────────
export const getLogros           = () => get('/logros/')
export const marcarLogrosVistos  = () => post('/logros/vistos/', {})

// ── Plan del día (Bruce) ─────────────────────────────────────────────────
export const getPlan             = (fecha)         => get(`/plan/?fecha=${fecha}`)
export const generarPlan         = (fecha)         => post('/plan/', { fecha })
export const cambiarComidaPlan   = (fecha, indice) => post('/plan/cambiar/', { fecha, indice })
export const registrarComidaPlan = (fecha, indice) => post('/plan/registrar/', { fecha, indice })

// ── Ejercicios personalizados del pool ───────────────────────────────────
export const getEjerciciosPersonalizados   = ()     => get('/ejercicios-personalizados/')
export const crearEjercicioPersonalizado   = (data) => post('/ejercicios-personalizados/', data)

// ── Agua ──────────────────────────────────────────────────────────────────────
export const getAgua       = (fecha) => get(`/agua/?fecha=${fecha}`)
export const registrarAgua = (data)  => post('/agua/', data)
export const eliminarAgua  = (id)    => del_(`/agua/${id}/`)