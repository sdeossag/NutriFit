// Card — contenedor base de NutriFit.
// Acepta cualquier prop de style para override.

export default function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: '#1c1c1e',
        borderRadius: '20px',
        border: '0.5px solid rgba(255,255,255,0.08)',
        padding: '20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}