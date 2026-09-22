import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { loginGoogle, loginApple } from '../api'
import bruceFace from '../assets/bruce-face.webp'

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
    } catch {
      setError('No se pudo iniciar sesión con Google. Intenta de nuevo.')
    } finally {
      setCargando(null)
    }
  }

  // ── Apple ────────────────────────────────────────────────────────────────
  const handleApple = async () => {
    if (!window.AppleID) {
      setError('Iniciar sesión con Apple no está disponible en este navegador.')
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
      minHeight: 'var(--app-h)',
      display: 'flex', flexDirection: 'column',
      padding: 'calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px)',
      background: 'radial-gradient(90% 55% at 50% 0%, rgba(74,222,128,0.12) 0%, transparent 70%)',
    }}>
      {/* Marca: centrada en el espacio libre */}
      <div className='nf-enter' style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: '24px' }}>
        <img
          src={bruceFace} alt='' width={96} height={96}
          style={{
            width: '96px', height: '96px', borderRadius: '26px', marginBottom: '22px',
            background: '#fff',
            boxShadow: '0 12px 40px rgba(74,222,128,0.18), 0 0 0 0.5px rgba(255,255,255,0.2)',
          }}
        />
        <h1 className='nf-large-title' style={{ marginBottom: '8px' }}>NutriFit</h1>
        <p className='nf-subhead' style={{ maxWidth: '260px' }}>
          Tu compañero de nutrición y entrenamiento, con Bruce como coach.
        </p>
      </div>

      {/* Acciones: en la zona del pulgar */}
      <div className='nf-enter' style={{ animationDelay: '80ms', width: '100%', maxWidth: '380px', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Google: capa visual propia, el botón oficial va invisible encima (entrega el id_token) */}
          <div style={{ position: 'relative', opacity: cargando && cargando !== 'google' ? 0.4 : 1 }}>
            <div
              aria-hidden='true'
              className='nf-btn nf-btn--lg nf-btn--block'
              style={{ background: '#fff', color: '#1f1f1f', pointerEvents: 'none' }}
            >
              {cargando === 'google' ? <SpinnerIcon color='#1f1f1f' /> : <GoogleIcon />}
              {cargando === 'google' ? 'Conectando…' : 'Continuar con Google'}
            </div>
            <div style={{ position: 'absolute', inset: 0, opacity: 0, overflow: 'hidden', borderRadius: '16px' }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  setError('Google canceló el inicio de sesión.')
                  setCargando(null)
                }}
                width='380'
                size='large'
                useOneTap={false}
              />
            </div>
          </div>

          <button
            onClick={handleApple}
            disabled={!!cargando}
            className='nf-btn nf-btn--lg nf-btn--block'
            style={{ background: 'var(--surface-2)', color: '#fff', boxShadow: 'inset 0 0 0 0.5px var(--separator)', opacity: cargando && cargando !== 'apple' ? 0.4 : 1 }}
          >
            {cargando === 'apple' ? <SpinnerIcon /> : <AppleIcon />}
            {cargando === 'apple' ? 'Conectando…' : 'Continuar con Apple'}
          </button>
        </div>

        {error && (
          <p role='alert' className='nf-footnote nf-reveal' style={{ color: 'var(--red)', textAlign: 'center', marginTop: '14px' }}>
            {error}
          </p>
        )}

        <p className='nf-caption' style={{ textAlign: 'center', marginTop: '20px' }}>
          Al continuar aceptas nuestros Términos de servicio y la Política de privacidad.
        </p>
      </div>
    </div>
  )
}

// ── Iconos ────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width='20' height='20' viewBox='0 0 24 24' aria-hidden='true'>
      <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/>
      <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
      <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/>
      <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
      <path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z'/>
    </svg>
  )
}

function SpinnerIcon({ color = 'currentColor' }) {
  return (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke={color} strokeWidth='2.5' strokeLinecap='round' className='nf-spinner' aria-hidden='true'>
      <path d='M12 3a9 9 0 1 0 9 9' />
    </svg>
  )
}
