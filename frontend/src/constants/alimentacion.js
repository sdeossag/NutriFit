// Opciones de alimentación compartidas por el onboarding y Ajustes → Alimentación.
// Los id de restricciones coinciden con RESTRICCIONES_VALIDAS del backend.

export const ALIMENTOS_OPCIONES = [
  'Pollo', 'Res', 'Cerdo', 'Pescado', 'Atún', 'Huevos', 'Tofu',
  'Arroz', 'Papa', 'Pasta', 'Plátano', 'Yuca', 'Quinoa', 'Avena',
  'Brócoli', 'Espinaca', 'Zanahoria', 'Aguacate', 'Tomate',
  'Frijoles', 'Lentejas', 'Garbanzo',
  'Leche', 'Queso', 'Yogur', 'Whey protein',
  'Mango', 'Banano', 'Fresas', 'Naranja',
]

export const NO_GUSTADOS_OPCIONES = [
  'Hígado', 'Sardinas', 'Coliflor', 'Remolacha', 'Cebolla cruda',
  'Ají picante', 'Cilantro', 'Tofu', 'Brócoli', 'Espinaca',
  'Pepino', 'Rábano', 'Berenjenas', 'Champiñones', 'Acelga',
]

export const ALERGIAS_OPCIONES = [
  'Maní', 'Frutos secos', 'Mariscos', 'Pescado', 'Huevo', 'Lácteos', 'Gluten', 'Soya', 'Ajonjolí',
]

export const RESTRICCIONES_OPCIONES = [
  { id: 'vegetariano',   label: 'Vegetariano',   emoji: '🥦', desc: 'Sin carne, pollo ni pescado.' },
  { id: 'vegano',        label: 'Vegano',        emoji: '🌱', desc: 'Nada de origen animal: tampoco huevo, lácteos ni miel.' },
  { id: 'sin_vegetales', label: 'Sin vegetales', emoji: '🚫', desc: 'Nada de ensaladas ni verduras a la vista. Sí frutas, legumbres y verduras escondidas en sopas o guisos.' },
  { id: 'sin_gluten',    label: 'Sin gluten',    emoji: '🌾', desc: 'Sin trigo, pan, pasta ni galletas.' },
  { id: 'sin_lacteos',   label: 'Sin lácteos',   emoji: '🥛', desc: 'Sin leche, queso ni yogur de vaca.' },
  { id: 'sin_cerdo',     label: 'Sin cerdo',     emoji: '🐷', desc: 'Sin cerdo, tocino, jamón ni chorizo.' },
  { id: 'halal',         label: 'Halal',         emoji: '☪️', desc: 'Sin cerdo ni alcohol.' },
]
