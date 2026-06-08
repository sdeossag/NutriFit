// Todas las cadenas de texto de la app.
// Importa T y úsalo como T[lang].clave

const T = {
  en: {
    greeting: 'Good morning,', calToday: 'Calories Today', goal: 'goal',
    protein: 'Protein', carbs: 'Carbs', fats: 'Fats', water: 'Water',
    bruceQuote: '"Discipline today, strength tomorrow. Small choices, big results."',
    food: 'Food', logFood: 'Log your meals today', analyzeAI: 'Analyze with AI',
    analyzeDesc: 'Take a photo and Bruce calculates calories automatically',
    takePhoto: 'Take a Photo', today: 'Today', gym: 'Gym', weeklyPlan: 'Your weekly plan',
    progress: 'Progress', weeklyEvolution: 'Your weekly evolution',
    calTrend: 'Calories Trend', weight: 'Weight', streak: 'Streak',
    daysRow: 'days in a row', amazing: 'Amazing work!', unstoppable: "You're unstoppable!",
    weekGoal: 'You completed your weekly goal.',
    nav: ['Home', 'Food', 'Gym', 'Progress'],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    routines: [
      'Legs + Core', 'Chest + Shoulders', 'Back + Biceps',
      'Active Rest', 'Functional + Legs', 'Optional B or C', 'Rest',
    ],
    badges: ['Gym A', 'Gym B', 'Gym C', 'Rest', 'Gym D', 'Optional', 'Rest'],
    planned: 'Planned', sets: 'Sets', reps: 'Reps', weight_col: 'Weight',
    vsLastWeek: 'vs last week', avgKcal: 'avg kcal',
    addMeal: 'Add meal', loading: 'Loading...', error: 'Error loading data',
    analyzing: 'Analyzing...', analyzed: 'Photo analyzed!',
    noMeals: 'No meals logged today',
    confirmDelete: 'Delete this meal?',
  },
  es: {
    greeting: 'Buenos días,', calToday: 'Calorías hoy', goal: 'meta',
    protein: 'Proteína', carbs: 'Carbos', fats: 'Grasas', water: 'Agua',
    bruceQuote: '"Disciplina hoy, fuerza mañana. Pequeñas decisiones, grandes resultados."',
    food: 'Comida', logFood: 'Registra lo que comes hoy', analyzeAI: 'Analizar con IA',
    analyzeDesc: 'Toma una foto y Bruce calcula las calorías automáticamente',
    takePhoto: 'Tomar foto', today: 'Hoy', gym: 'Gym', weeklyPlan: 'Tu plan semanal',
    progress: 'Progreso', weeklyEvolution: 'Tu evolución semanal',
    calTrend: 'Tendencia Calorías', weight: 'Peso', streak: 'Racha',
    daysRow: 'días seguidos', amazing: '¡Increíble trabajo!', unstoppable: '¡Eres imparable!',
    weekGoal: 'Completaste tu meta semanal.',
    nav: ['Inicio', 'Comida', 'Gym', 'Progreso'],
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    routines: [
      'Pierna + Core', 'Pecho + Hombros + Tríceps', 'Espalda + Bíceps',
      'Descanso activo', 'Funcional + Pierna', 'Opcional B o C', 'Descanso',
    ],
    badges: ['Gym A', 'Gym B', 'Gym C', 'Rest', 'Gym D', 'Opcional', 'Rest'],
    planned: 'Planeado', sets: 'Series', reps: 'Reps', weight_col: 'Peso',
    vsLastWeek: 'vs semana pasada', avgKcal: 'kcal promedio',
    addMeal: 'Agregar comida', loading: 'Cargando...', error: 'Error al cargar datos',
    analyzing: 'Analizando...', analyzed: '¡Foto analizada!',
    noMeals: 'Sin comidas registradas hoy',
    confirmDelete: '¿Eliminar esta comida?',
  },
}

export default T