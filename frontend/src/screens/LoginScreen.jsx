import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { loginGoogle, loginApple } from '../api'

export default function LoginScreen({ onLogin }) {
  const [cargando, setCargando] = useState(null)
  const [error, setError]       = useState(null)

  // ── Google ──────────────────────────────────────────────────────────────
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setCargando('google')
      setError(null)
      const data = await loginGoogle(credentialResponse.credential)
      onLogin(data.usuario)
    } catch (e) {
      setError('No se pudo iniciar sesión con Google. Intenta de nuevo.')
    } finally {
      setCargando(null)
    }
  }

  // ── Apple ────────────────────────────────────────────────────────────────
  const handleApple = async () => {
    if (!window.AppleID) {
      setError('Sign In with Apple no está disponible en este navegador.')
      return
    }
    try {
      setCargando('apple')
      setError(null)
      window.AppleID.auth.init({
        clientId:    'com.tuapp.nutrifit.web',
        scope:       'name email',
        redirectURI: window.location.origin,
        usePopup:    true,
      })
      const response = await window.AppleID.auth.signIn()
      const data = await loginApple({
        token:      response.authorization.id_token,
        email:      response.user?.email,
        first_name: response.user?.name?.firstName,
        last_name:  response.user?.name?.lastName,
      })
      onLogin(data.usuario)
    } catch (e) {
      if (e?.error !== 'popup_closed_by_user') {
        setError('No se pudo iniciar sesión con Apple.')
      }
    } finally {
      setCargando(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>

      {/* Glow de fondo */}
      <div style={{
        position: 'fixed', top: '-100px', left: '50%', transform: 'translateX(-50%)',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(74,222,128,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '360px', position: 'relative' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '24px',
            background: 'linear-gradient(135deg, #064e3b, #16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '38px', margin: '0 auto 20px',
            boxShadow: '0 0 40px rgba(74,222,128,0.2)',
          }}>🐾</div>
          <h1 style={{
            fontSize: '30px', fontWeight: '700', letterSpacing: '-1.2px',
            marginBottom: '8px', color: '#fff',
          }}>NutriFit</h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', lineHeight: 1.5 }}>
            Tu compañero de nutrición<br />y entrenamiento
          </p>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>

          {/* Google — usamos el componente oficial que devuelve credential (id_token) */}
          <div style={{ position: 'relative' }}>
            {/* Capa visual personalizada encima del botón de Google */}
            <div style={{
              width: '100%', padding: '15px 20px',
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
              pointerEvents: 'none',
              position: 'relative', zIndex: 1,
            }}>
              {cargando === 'google' ? <SpinnerIcon /> : <GoogleIcon />}
              <span style={{ fontSize: '15px', fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
                {cargando === 'google' ? 'Conectando…' : 'Continuar con Google'}
              </span>
            </div>

            {/* Botón real de Google — invisible encima */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 2,
              opacity: 0, overflow: 'hidden', borderRadius: '16px',
            }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  setError('Google canceló el inicio de sesión.')
                  setCargando(null)
                }}
                width="360"
                useOneTap={false}
              />
            </div>
          </div>

          {/* Apple */}
          <button
            onClick={handleApple}
            disabled={!!cargando}
            style={{
              width: '100%', padding: '15px 20px',
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: '16px', cursor: cargando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
              transition: 'all 0.2s', opacity: cargando && cargando !== 'apple' ? 0.4 : 1,
            }}
            onMouseEnter={e => !cargando && (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            {cargando === 'apple' ? <SpinnerIcon /> : <AppleIcon />}
            <span style={{ fontSize: '15px', fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
              {cargando === 'apple' ? 'Conectando…' : 'Continuar con Apple'}
            </span>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
            borderRadius: '12px', padding: '12px 16px',
            fontSize: '13px', color: '#f87171', textAlign: 'center', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Disclaimer */}
        <p style={{
          textAlign: 'center', fontSize: '11px',
          color: 'rgba(255,255,255,0.2)', lineHeight: 1.6, marginTop: '28px',
        }}>
          Al continuar aceptas nuestros{' '}
          <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline', cursor: 'pointer' }}>
            Términos de servicio
          </span>{' '}y{' '}
          <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline', cursor: 'pointer' }}>
            Política de privacidad
          </span>
        </p>
      </div>
    </div>
  )
}

// ── Iconos ────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function SpinnerIcon({ color = '#fff' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}