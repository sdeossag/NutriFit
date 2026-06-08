// MacroBar — barra de progreso de 3px para macros.
// pct: 0-100, color: string CSS

export default function MacroBar({ pct, color }) {
  return (
    <div
      style={{
        height: '3px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '8px',
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: '2px',
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  )
}