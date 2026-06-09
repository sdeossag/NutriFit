import { useState, useEffect, useRef } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { IconHome, IconToolsKitchen2, IconBarbell, IconTrendingUp } from '@tabler/icons-react'

import T from './constants/translations'
import { getMiPerfil, limpiarTokens, getAccessToken } from './api'
import LoginScreen       from './screens/LoginScreen'
import OnboardingScreen  from './screens/OnboardingScreen'
import HomeScreen        from './screens/HomeScreen'
import FoodScreen        from './screens/FoodScreen'
import GymScreen         from './screens/GymScreen'
import ProgressScreen    from './screens/ProgressScreen'
import ProfileScreen     from './screens/ProfileScreen'
import BruceChatScreen   from './screens/BruceChatScreen'

import bruceFace       from './assets/bruce-face.png'
import bruceBatmanFace from './assets/bruce-batman-face.png'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCREENS   = ['home', 'food', 'gym', 'progress', 'chat']
const NAV_ICONS = [IconHome, IconToolsKitchen2, IconBarbell, IconTrendingUp, null]

// Anchos fijos de cada botón en el nav — calculados una vez al montar
// para no depender de getBoundingClientRect bajo transform scale
function FloatingTabBar({ screen, cambiarPantalla, imgBruce, t, setBruceHover }) {
  const navRef     = useRef(null)
  const btnRefs    = useRef([])
  const pillRef    = useRef(null)
  const animRef    = useRef(null)
  const pillX      = useRef(0)
  const targetX    = useRef(0)
  const pillVis    = useRef(false)
  // Cache de geometría sin transform (se llena en el primer mousemove)
  const geoCache   = useRef(null)

  const INFLUENCE_RADIUS = 110
  const MAX_SCALE        = 1.18
  const PILL_W           = 66

  const labels = [...(t.nav ?? ['Inicio', 'Comida', 'Gym', 'Progreso']), 'Bruce']

  // Construye el cache midiendo ANTES de cualquier transform
  function buildGeoCache() {
    const nav = navRef.current
    if (!nav) return
    // Reseteamos transforms temporalmente para medir geometría real
    btnRefs.current.forEach(btn => {
      if (btn) btn.style.transform = 'none'
    })
    const navRect = nav.getBoundingClientRect()
    geoCache.current = SCREENS.map((_, i) => {
      const btn = btnRefs.current[i]
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return {
        left:   r.left - navRect.left,
        right:  r.right - navRect.left,
        width:  r.width,
        centerX: r.left - navRect.left + r.width / 2,
      }
    })
  }

  function lerp(a, b, t) { return a + (b - a) * t }

  function updateClips() {
    const cache = geoCache.current
    if (!cache) return
    const pillLeft  = pillX.current - PILL_W / 2
    const pillRight = pillLeft + PILL_W

    SCREENS.forEach((_, i) => {
      const btn = btnRefs.current[i]
      const geo = cache[i]
      if (!btn || !geo) return

      const overlapL = Math.max(pillLeft, geo.left)
      const overlapR = Math.min(pillRight, geo.right)

      let clip
      if (overlapR <= overlapL) {
        clip = 'inset(0 100% 0 0)'
      } else {
        const fromLeft  = Math.max(0, ((overlapL - geo.left) / geo.width * 100)).toFixed(2)
        const fromRight = Math.max(0, ((geo.right - overlapR) / geo.width * 100)).toFixed(2)
        clip = `inset(0 ${fromRight}% 0 ${fromLeft}%)`
      }

      const iconGreen  = btn.querySelector('[data-icon-green]')
      const labelGreen = btn.querySelector('[data-label-green]')
      if (iconGreen)  iconGreen.style.clipPath  = clip
      if (labelGreen) labelGreen.style.clipPath = clip
    })
  }

  function animatePill() {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(() => {
      pillX.current = lerp(pillX.current, targetX.current, 0.18)
      if (pillRef.current) pillRef.current.style.left = (pillX.current - 33) + 'px'
      updateClips()
      if (Math.abs(pillX.current - targetX.current) > 0.3) animatePill()
    })
  }

  function updateTabBar(mouseX, mouseY) {
    const nav = navRef.current
    if (!nav) return

    // Construir cache si no existe todavía
    if (!geoCache.current) buildGeoCache()
    const cache = geoCache.current
    if (!cache) return

    const navRect = nav.getBoundingClientRect()
    const localX  = mouseX - navRect.left
    const localY  = mouseY - navRect.top

    const eases = cache.map((geo) => {
      if (!geo) return 0
      const cx   = geo.centerX
      const cy   = 30 // mitad aprox del nav
      const dist = Math.sqrt((localX - cx) ** 2 + (localY - cy) ** 2)
      const t    = Math.max(0, 1 - dist / INFLUENCE_RADIUS)
      return t * t * (3 - 2 * t)
    })

    const totalEase = eases.reduce((a, b) => a + b, 0)

    let weightedX = 0
    eases.forEach((ease, i) => {
      const geo = cache[i]
      if (ease > 0 && geo) weightedX += geo.centerX * ease
    })

    SCREENS.forEach((id, i) => {
      const btn = btnRefs.current[i]
      if (!btn) return
      const ease  = eases[i]
      const scale = 1 + (MAX_SCALE - 1) * ease

      btn.style.transform  = `scale(${scale.toFixed(3)}) translateY(${(-ease * 2).toFixed(2)}px)`
      btn.style.transition = 'none'

      const iconBaseEl  = btn.querySelector('[data-icon-base]')
      const labelBaseEl = btn.querySelector('[data-label-base]')
      const bruceEl     = btn.querySelector('[data-bruce]')

      if (iconBaseEl)  iconBaseEl.style.color  = `rgba(255,255,255,${(0.38 + 0.62 * ease).toFixed(2)})`
      if (labelBaseEl) labelBaseEl.style.color = `rgba(255,255,255,${Math.max(0.38, (0.38 + 0.62 * ease) * 0.7).toFixed(2)})`

      if (bruceEl) {
        const isGreen = ease > 0.25
        bruceEl.style.borderColor = isGreen ? '#4ade80' : `rgba(255,255,255,${Math.max(0.22, (0.38 + 0.62 * ease) * 0.4).toFixed(2)})`
        bruceEl.style.filter      = `brightness(${(0.62 + 0.5 * ease).toFixed(2)})`
      }
      if (id === 'chat') setBruceHover(ease > 0.4)
    })

    if (totalEase > 0) {
      targetX.current = weightedX / totalEase
      if (!pillVis.current) {
        pillVis.current = true
        pillX.current   = targetX.current
        if (pillRef.current) {
          pillRef.current.style.opacity = '1'
          pillRef.current.style.left    = (pillX.current - 33) + 'px'
        }
      }
      updateClips()
      animatePill()
    } else {
      pillVis.current = false
      if (pillRef.current) pillRef.current.style.opacity = '0'
      SCREENS.forEach((id, i) => {
        const btn = btnRefs.current[i]
        if (!btn) return
        const isActive   = id === screen
        const iconGreen  = btn.querySelector('[data-icon-green]')
        const labelGreen = btn.querySelector('[data-label-green]')
        if (iconGreen)  iconGreen.style.clipPath  = isActive ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)'
        if (labelGreen) labelGreen.style.clipPath = isActive ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)'
      })
    }
  }

  function resetTabBar() {
    pillVis.current = false
    if (pillRef.current) pillRef.current.style.opacity = '0'
    setBruceHover(false)
    SCREENS.forEach((id, i) => {
      const btn = btnRefs.current[i]
      if (!btn) return
      btn.style.transform  = 'scale(1) translateY(0px)'
      btn.style.transition = 'transform 0.3s cubic-bezier(0.34,1.4,0.64,1)'
      const isActive    = id === screen
      const iconBaseEl  = btn.querySelector('[data-icon-base]')
      const labelBaseEl = btn.querySelector('[data-label-base]')
      const iconGreen   = btn.querySelector('[data-icon-green]')
      const labelGreen  = btn.querySelector('[data-label-green]')
      const bruceEl     = btn.querySelector('[data-bruce]')
      if (iconBaseEl)  iconBaseEl.style.color   = isActive ? '#4ade80' : 'rgba(255,255,255,0.38)'
      if (labelBaseEl) labelBaseEl.style.color  = isActive ? '#4ade80' : 'rgba(255,255,255,0.38)'
      if (iconGreen)   iconGreen.style.clipPath  = isActive ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)'
      if (labelGreen)  labelGreen.style.clipPath = isActive ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)'
      if (bruceEl) {
        bruceEl.style.borderColor = isActive ? '#4ade80' : 'rgba(255,255,255,0.22)'
        bruceEl.style.filter      = isActive ? 'brightness(1)' : 'brightness(0.62)'
      }
    })
    // Invalidar cache para que se recalcule en el próximo hover
    geoCache.current = null
  }

  return (
    <nav
      ref={navRef}
      onMouseMove={(e) => updateTabBar(e.clientX, e.clientY)}
      onMouseLeave={resetTabBar}
      onTouchMove={(e) => {
        e.preventDefault()
        const touch = e.touches[0]
        updateTabBar(touch.clientX, touch.clientY)
      }}
      onTouchEnd={resetTabBar}
      style={{
        position: 'fixed', bottom: '20px', left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)', maxWidth: '382px',
        background: 'rgba(22,22,24,0.82)',
        backdropFilter: 'saturate(200%) blur(28px)',
        WebkitBackdropFilter: 'saturate(200%) blur(28px)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: '28px',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '10px 8px',
        zIndex: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset',
      }}
    >
      {/* Píldora liquid glass */}
      <div
        ref={pillRef}
        style={{
          position: 'absolute', top: '7px',
          width: `${PILL_W}px`, height: '46px',
          borderRadius: '23px',
          pointerEvents: 'none', zIndex: 0,
          opacity: 0,
          transition: 'opacity 0.18s ease',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '23px',
          background: 'rgba(74,222,128,0.11)',
          border: '0.5px solid rgba(74,222,128,0.28)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.12), 0 0 20px rgba(74,222,128,0.1)',
        }} />
        <div style={{
          position: 'absolute', top: '1px', left: '8px', right: '8px',
          height: '40%', borderRadius: '20px 20px 50% 50%',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.14), transparent)',
        }} />
      </div>

      {/* Botones */}
      {SCREENS.map((id, i) => {
        const active = screen === id
        const Icon   = NAV_ICONS[i]
        const label  = labels[i] ?? id

        return (
          <button
            key={id}
            ref={el => btnRefs.current[i] = el}
            onClick={() => cambiarPantalla(id)}
            style={{
              position: 'relative', zIndex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 10px', fontFamily: 'inherit', flex: 1,
              transformOrigin: 'center bottom',
            }}
          >
            {id === 'chat' ? (
              <div
                data-bruce=""
                style={{
                  width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden',
                  border: active ? '2px solid #4ade80' : '1.5px solid rgba(255,255,255,0.22)',
                  filter: active ? 'brightness(1)' : 'brightness(0.62)',
                  transition: 'border-color 0.22s ease, filter 0.22s ease',
                  flexShrink: 0,
                }}
              >
                <img src={imgBruce} alt="Bruce" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                <div
                  data-icon-base=""
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? '#4ade80' : 'rgba(255,255,255,0.38)',
                  }}
                >
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <div
                  data-icon-green=""
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4ade80',
                    clipPath: active ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)',
                    pointerEvents: 'none',
                  }}
                >
                  <Icon size={22} strokeWidth={2.2} />
                </div>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <span
                data-label-base=""
                style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  color: active ? '#4ade80' : 'rgba(255,255,255,0.38)',
                  letterSpacing: '0.03em',
                  display: 'block',
                }}
              >
                {label}
              </span>
              <span
                data-label-green=""
                style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  color: '#4ade80',
                  letterSpacing: '0.03em',
                  display: 'block',
                  position: 'absolute', inset: 0,
                  clipPath: active ? 'inset(0 0% 0 0%)' : 'inset(0 100% 0 0)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}

export default function App() {
  const [screen,        setScreen]        = useState('home')
  const [lang,          setLang]          = useState('es')
  const [usuario,       setUsuario]       = useState(null)
  const [authChecked,   setAuthChecked]   = useState(false)
  const [perfilAbierto, setPerfilAbierto] = useState(false)
  const [bruceHover,    setBruceHover]    = useState(false)
  const mainRef = useRef(null)
  const t = T[lang]

  const imgBruce = bruceHover ? bruceBatmanFace : bruceFace

  useEffect(() => {
    if (getAccessToken()) {
      getMiPerfil()
        .then(data => setUsuario(data.usuario))
        .catch(() => limpiarTokens())
        .finally(() => setAuthChecked(true))
    } else {
      setAuthChecked(true)
    }
  }, [])

  const handleLogin              = (d) => { setUsuario(d); setScreen('home') }
  const handleLogout             = ()  => { setUsuario(null); setScreen('home') }
  const handleOnboardingComplete = (d) => setUsuario(d)

  const cambiarPantalla = (id) => {
    setScreen(id)
    if (mainRef.current) mainRef.current.scrollTop = 0
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '38px', animation: 'pulse 1.5s ease-in-out infinite' }}>🐾</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.92)}}`}</style>
      </div>
    )
  }

  if (!usuario) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginScreen onLogin={handleLogin} />
      </GoogleOAuthProvider>
    )
  }

  if (!usuario.onboarding_completo) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <OnboardingScreen usuario={usuario} onComplete={handleOnboardingComplete} />
      </GoogleOAuthProvider>
    )
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div style={{
        height: '100vh', background: '#0a0a0a', color: '#fff',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        display: 'flex', flexDirection: 'column',
      }}>
        <main ref={mainRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: '110px', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: screen === 'home'     ? 'block' : 'none' }}>
            <HomeScreen t={t} lang={lang} setLang={setLang} screen={screen} onGoToProfile={() => setPerfilAbierto(true)} onOpenChat={() => cambiarPantalla('chat')} />
          </div>
          <div style={{ display: screen === 'food'     ? 'block' : 'none' }}>
            <FoodScreen t={t} screen={screen} />
          </div>
          <div style={{ display: screen === 'gym'      ? 'block' : 'none' }}>
            <GymScreen t={t} />
          </div>
          <div style={{ display: screen === 'progress' ? 'block' : 'none' }}>
            <ProgressScreen t={t} screen={screen} />
          </div>
          <div style={{ display: screen === 'chat' ? 'block' : 'none', height: 'calc(100vh - 110px)' }}>
            <BruceChatScreen screen={screen} />
          </div>
        </main>

        <FloatingTabBar
          screen={screen}
          cambiarPantalla={cambiarPantalla}
          imgBruce={imgBruce}
          t={t}
          setBruceHover={setBruceHover}
        />

        {perfilAbierto && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{ width: '100%', maxWidth: '430px', background: '#0a0a0a', overflowY: 'auto' }}>
              <ProfileScreen
                usuario={usuario}
                setUsuario={setUsuario}
                onLogout={handleLogout}
                onClose={() => setPerfilAbierto(false)}
                t={t}
              />
            </div>
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  )
}