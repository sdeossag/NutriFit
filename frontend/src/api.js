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

export const refrescarToken = async () => {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error('Sin refresh token')
  const res = await fetch(`${BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) { limpiarTokens(); throw new Error('Sesión expirada') }
  const data = await res.json()
  localStorage.setItem('access_token', data.access)
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
    } catch {
      limpiarTokens()
      window.location.reload()
    }
  }

  return res
}

const get  = (path) =>
  apiFetch(`${BASE}${path}`).then((r) => {
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`)
    return r.json()
  })

const post = (path, body) =>
  apiFetch(`${BASE}${path}`, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}`)
    return r.json()
  })

const patch = (path, body) =>
  apiFetch(`${BASE}${path}`, {
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`)
    return r.json()
  })

const put = (path, body) =>
  apiFetch(`${BASE}${path}`, {
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`PUT ${path} → ${r.status}`)
    return r.json()
  })

const del_ = (path) =>
  apiFetch(`${BASE}${path}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok && r.status !== 204) throw new Error(`DELETE ${path} → ${r.status}`)
  })

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

export const actualizarMetas = (metas) => patch('/auth/perfil/metas/', metas)

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

export const getProgresoSemanal = ()     => get('/progreso/')
export const registrarPeso      = (data) => post('/peso/', data)

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

// ── Rutinas personalizadas por día ───────────────────────────────────────
export const getRutinasDia    = ()     => get('/rutinas-dia/')
export const guardarRutinaDia = (data) => put('/rutinas-dia/', data)

// ── Ejercicios personalizados del pool ───────────────────────────────────
export const getEjerciciosPersonalizados   = ()     => get('/ejercicios-personalizados/')
export const crearEjercicioPersonalizado   = (data) => post('/ejercicios-personalizados/', data)