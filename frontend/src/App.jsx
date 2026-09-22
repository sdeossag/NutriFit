import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'

import T from './constants/translations'
import { getMiPerfil, limpiarTokens, getAccessToken } from './api'
import { checkPushHoy } from './utils/notificaciones'
import LoginScreen       from './screens/LoginScreen'
import OnboardingScreen  from './screens/OnboardingScreen'
import HomeScreen        from './screens/HomeScreen'
import FoodScreen        from './screens/FoodScreen'
import GymScreen         from './screens/GymScreen'
import ProgressScreen    from './screens/ProgressScreen'
import ProfileScreen     from './screens/ProfileScreen'
import BruceChatScreen   from './screens/BruceChatScreen'
import TabBar            from './components/TabBar'
import Sheet, { SheetHeader } from './components/Sheet'
import { Toaster }       from './components/Toast'

import bruceFace from './assets/bruce-face.webp'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// En táctil, el teclado tapa la barra de pestañas: la escondemos mientras se escribe
function useTecladoAbierto() {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const esCampo = (el) =>
      el?.matches?.('textarea, input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color])')
    let t
    const onIn  = (e) => { if (esCampo(e.target)) { clearTimeout(t); setAbierto(true) } }
    const onOut = (e) => { if (esCampo(e.target)) { t = setTimeout(() => setAbierto(esCampo(document.activeElement)), 80) } }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])
  return abierto
}

function Splash() {
  return (
    <div style={{ minHeight: 'var(--app-h)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src={bruceFace} alt='' width={72} height={72}
        style={{ borderRadius: '22px', animation: 'nf-pulse 1.6s ease-in-out infinite' }}
      />
    </div>
  )
}

export default function App() {
  const [screen,        setScreen]        = useState('home')
  const [lang,          setLang]          = useState('es')
  const [usuario,       setUsuario]       = useState(null)
  const [authChecked,   setAuthChecked]   = useState(false)
  const [perfilAbierto, setPerfilAbierto] = useState(false)
  const mainRef = useRef(null)
  const scrollPorPantalla = useRef({})
  const tecladoAbierto = useTecladoAbierto()
  const t = T[lang]

  useEffect(() => {
    if (getAccessToken()) {
      getMiPerfil()
        .then(data => { setUsuario(data.usuario); checkPushHoy() })
        .catch(() => limpiarTokens())
        .finally(() => setAuthChecked(true))
    } else {
      setAuthChecked(true)
    }
  }, [])

  const handleLogin              = (d) => { setUsuario(d); setScreen('home') }
  const handleLogout             = ()  => { setPerfilAbierto(false); setUsuario(null); setScreen('home') }
  const handleOnboardingComplete = (d) => setUsuario(d)

  // Cada pestaña recuerda su scroll (como iOS). Tocar la pestaña activa sube al inicio.
  const cambiarPantalla = useCallback((id) => {
    const main = mainRef.current
    if (!main) return setScreen(id)
    if (id === screen) {
      main.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    scrollPorPantalla.current[screen] = main.scrollTop
    setScreen(id)
  }, [screen])

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = scrollPorPantalla.current[screen] ?? 0
  }, [screen])

  const cerrarPerfil = useCallback(() => setPerfilAbierto(false), [])

  if (!authChecked) return <Splash />

  if (!usuario) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginScreen onLogin={handleLogin} />
        <Toaster low />
      </GoogleOAuthProvider>
    )
  }

  if (!usuario.onboarding_completo) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <OnboardingScreen usuario={usuario} onComplete={handleOnboardingComplete} />
        <Toaster low />
      </GoogleOAuthProvider>
    )
  }

  const esChat = screen === 'chat'

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div id='app-shell' style={{
        // Fijo a los cuatro bordes del área visible: el documento nunca hace scroll
        position: 'fixed', inset: 0, margin: '0 auto', maxWidth: '430px',
        display: 'flex', flexDirection: 'column', background: 'var(--bg)',
      }}>
        <main
          ref={mainRef}
          style={{
            flex: 1, minHeight: 0,
            overflowY: esChat ? 'hidden' : 'auto',
            overscrollBehavior: 'contain',
            paddingBottom: esChat ? 0 : 'calc(var(--tabbar-h) + var(--tabbar-gap) + 24px)',
          }}
        >
          <div hidden={screen !== 'home'}>
            <HomeScreen t={t} lang={lang} screen={screen} usuario={usuario} onGoToProfile={() => setPerfilAbierto(true)} onOpenChat={() => cambiarPantalla('chat')} />
          </div>
          <div hidden={screen !== 'food'}>
            <FoodScreen t={t} screen={screen} />
          </div>
          <div hidden={screen !== 'gym'}>
            <GymScreen t={t} screen={screen} />
          </div>
          <div hidden={screen !== 'progress'}>
            <ProgressScreen t={t} screen={screen} />
          </div>
          <div hidden={!esChat} style={{ height: '100%' }}>
            <BruceChatScreen screen={screen} tecladoAbierto={tecladoAbierto} />
          </div>
        </main>

        <div className='nf-scroll-edge' aria-hidden='true' data-hidden={esChat || tecladoAbierto} />

        <TabBar
          screen={screen}
          onSelect={cambiarPantalla}
          labels={t.nav}
          hidden={tecladoAbierto}
        />
      </div>

      <Sheet
        open={perfilAbierto}
        onClose={cerrarPerfil}
        large
        label='Ajustes'
        header={
          <SheetHeader
            title='Ajustes'
            right={<button className='nf-btn nf-btn--plain' onClick={cerrarPerfil}>Listo</button>}
          />
        }
      >
        <ProfileScreen
          usuario={usuario}
          setUsuario={setUsuario}
          onLogout={handleLogout}
          lang={lang}
          setLang={setLang}
          t={t}
        />
      </Sheet>

      <Toaster low={tecladoAbierto} />
    </GoogleOAuthProvider>
  )
}
