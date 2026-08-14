# NutriFit

A full-stack AI-powered nutrition and fitness tracking Progressive Web App (PWA) built with Django REST Framework and React 19. Users get a personalized meal plan on day one, log food and workouts, and receive smart push notifications coached by Bruce — a no-nonsense dachshund AI persona.

---

## Features

### Onboarding & AI Plan Generation
- 10-step guided onboarding collecting physical data (age, weight, height, sex), fitness goal (lose / maintain / gain), activity level, meal preferences, disliked foods, and dietary restrictions
- Caloric and macro targets calculated via Mifflin-St Jeor BMR × activity multiplier
- Groq LLM (`qwen/qwen3.6-27b`) generates a fully personalized weekly meal plan excluding disliked foods, with a complete sample day (breakfast, lunch, dinner, snack) including kcal and protein per meal

### Bruce — AI Fitness Coach
- Persistent chat with Bruce, a dachshund persona that speaks casual Colombian Spanish
- Context-aware: Bruce knows the user's caloric goal, macros, food preferences, disliked foods, and dietary restrictions
- Supports full recipe requests with ingredients, step-by-step instructions, and macro breakdown per serving
- Daily motivational phrase on the home screen

### Nutrition Tracking
- Log meals with calories, protein, carbs, and fat
- AI photo analysis: upload a meal photo and get automatic nutritional estimates (Groq vision)
- AI label scanner: photograph a nutrition label to auto-fill macros
- Daily macro progress bars and calorie ring
- Pantry (Alacena): store frequent foods for one-tap logging

### Gym Tracking
- Weekly gym schedule with per-day muscle group targets
- Session logging: exercises, sets, reps, weight (kg), and notes
- Custom exercises with color coding per muscle group
- Workout history with per-exercise weight progression charts
- Mark sessions complete; rest days detected automatically (weekends)

### Water Tracking
- Log water intake with quick presets (termo 600 ml, glass 250 ml, bottle 500 ml)
- Daily progress bar toward hydration goal

### Progress Dashboard
- Weekly summary: average calories, protein, carb and fat adherence
- Weight evolution chart with linear trend and estimated days to goal
- Workout history filterable by muscle group
- Achievement badges (streaks, PRs, goal milestones)

### Push Notifications (Web Push — free tier)
- **Smart scheduling**: 3–4 notifications per day via GitHub Actions cron, targeting 8 AM, 12 PM, 5 PM, and 8 PM (Colombia UTC-5)
- **Behavior-based**: morning slot always fires; midday, afternoon, and evening slots only fire if calories are below threshold or gym session is pending
- Each message is generated live by Bruce via Groq based on the user's real-time food and gym data
- VAPID Web Push standard — works on iOS Safari (16.4+) and Android Chrome
- Slot deduplication: each slot fires at most once per day per device

### Authentication
- Google OAuth 2.0 login
- Apple Sign-In (iOS)
- JWT access + refresh tokens with automatic silent refresh via `apiFetch` interceptor
- Token blacklist on logout

---

## Tech Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | Django 5 + Django REST Framework |
| Auth | SimpleJWT + Google OAuth + Apple Sign-In |
| Database | PostgreSQL (Neon serverless) |
| AI | Groq API — `qwen/qwen3.6-27b` (reasoning hidden) |
| Push | pywebpush + VAPID (Web Push Protocol) |
| Static files | WhiteNoise |
| Hosting | Render (free tier, kept alive via UptimeRobot) |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite |
| PWA | VitePWA (injectManifest strategy) |
| Routing | State-based navigation (no URL router) |
| Auth storage | JWT in localStorage |
| Service Worker | Workbox precaching + Web Push handler |
| Hosting | Vercel |

### Infrastructure
| Service | Purpose |
|---------|---------|
| GitHub Actions | Cron — triggers smart notifications 4×/day |
| UptimeRobot | Keepalive ping to `/api/health/` every 5 min |
| Neon | Serverless PostgreSQL |
| Render | Backend hosting |
| Vercel | Frontend hosting + CDN |

---

## Project Structure

```
nutrifit-v2/
├── backend/
│   ├── api/
│   │   ├── models.py          # Usuario, Comida, AlimentoAlacena, SesionGym,
│   │   │                      # EjercicioLog, EjercicioPersonalizado, RutinaDay,
│   │   │                      # SesionChat, MensajeChat, RegistroPeso,
│   │   │                      # RegistroAgua, PushSubscription
│   │   ├── views.py           # ~60 endpoints
│   │   ├── urls.py
│   │   ├── serializers.py
│   │   └── migrations/        # 10 migrations
│   └── nutrifit/
│       └── settings.py
├── frontend/
│   ├── src/
│   │   ├── screens/           # LoginScreen, OnboardingScreen, HomeScreen,
│   │   │                      # FoodScreen, GymScreen, ProgressScreen,
│   │   │                      # BruceChatScreen, ProfileScreen
│   │   ├── components/        # Card, MacroBar
│   │   ├── utils/
│   │   │   └── notificaciones.js   # Web Push subscribe/unsubscribe
│   │   ├── api.js             # apiFetch with JWT refresh interceptor
│   │   └── sw.js              # Service worker (Workbox + push handler)
│   └── vite.config.js
└── .github/
    └── workflows/
        └── notificaciones.yml # GitHub Actions cron for push notifications
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google/` | Google OAuth login |
| POST | `/api/auth/apple/` | Apple Sign-In |
| POST | `/api/auth/token/refresh/` | JWT refresh |
| POST | `/api/auth/logout/` | Blacklist token |
| GET/PUT | `/api/auth/perfil/` | User profile |

### Onboarding
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/onboarding/` | Save onboarding data |
| POST | `/api/onboarding/plan/` | Generate AI meal plan (Groq) |

### Nutrition
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/comidas/` | List / log meals |
| GET/PUT/DELETE | `/api/comidas/<id>/` | Meal detail |
| POST | `/api/analizar-foto/` | AI meal photo analysis |
| GET/POST | `/api/alacena/` | Pantry items |
| POST | `/api/analizar-etiqueta/` | AI nutrition label scan |

### Gym
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sesiones/` | Weekly sessions |
| GET | `/api/sesiones/hoy/` | Today's session |
| POST | `/api/sesiones/registrar/` | Mark session complete |
| POST | `/api/ejercicios/log/` | Log an exercise set |
| GET | `/api/ejercicios/historial/` | Exercise weight history |

### Progress
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resumen/` | Today's summary |
| GET | `/api/progreso/` | Weekly progress |
| GET | `/api/progreso-completo/` | Full progress data |
| POST | `/api/peso/` | Log weight |
| GET/POST | `/api/agua/` | Water intake |

### Bruce / Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bruce/frase/` | Daily motivational phrase |
| GET/POST | `/api/chat/` | Chat sessions |
| POST | `/api/chat/<id>/mensaje/` | Send message to Bruce |

### Push Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/push/subscribe/` | Register device for push |
| DELETE | `/api/push/unsubscribe/` | Remove push subscription |
| GET | `/api/push/estado/` | Check subscription status |
| POST | `/api/push/check/` | Daily push on app open |
| GET | `/api/push/cron/` | Smart cron push (GitHub Actions) |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/HEAD | `/api/health/` | Health check (UptimeRobot) |

---

## Environment Variables

### Backend (Render)
```env
SECRET_KEY=
DATABASE_URL=                  # Neon PostgreSQL connection string
GROQ_API_KEY=
VAPID_PRIVATE_KEY=             # base64url EC private key
VAPID_CLAIM_EMAIL=
CRON_SECRET=                   # Shared secret for /api/push/cron/
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
ALLOWED_HOSTS=
DEBUG=False
```

### Frontend (Vercel)
```env
VITE_API_URL=https://your-backend.onrender.com/api
VITE_VAPID_PUBLIC_KEY=         # base64url EC public key (uncompressed point)
VITE_GOOGLE_CLIENT_ID=
```

---

## Smart Push Notifications

GitHub Actions triggers the `/api/push/cron/` endpoint four times daily (Colombia UTC-5):

| Time | Slot | Fires if… |
|------|------|-----------|
| 8:00 AM | `manana` | Always — morning motivation |
| 12:00 PM | `mediodia` | Calories < 35% of goal **or** gym session pending |
| 5:00 PM | `tarde` | Calories < 60% of goal **or** gym session pending |
| 8:00 PM | `noche` | Calories < 80% of goal **or** gym session missed |

Each notification body is generated live by Bruce via Groq using the user's current food log and gym status. A slot fires at most once per day per device.

To set up, add these secrets to the GitHub repository:

| Secret | Value |
|--------|-------|
| `BACKEND_URL` | `https://your-backend.onrender.com` |
| `CRON_SECRET` | Your chosen secret string |

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # fill in your values
python manage.py migrate
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local    # fill in your values
npm run dev
```

---

## Deployment

- **Backend**: push to `main` → Render auto-deploys, runs migrations
- **Frontend**: push to `main` → Vercel auto-deploys
- **Notifications**: GitHub Actions runs on schedule — no additional setup needed after secrets are configured
- **Keepalive**: UptimeRobot pings `/api/health/` every 5 minutes to prevent Render free-tier sleep
