// MacroBar — barra de progreso fina para macros.
// pct: 0-100, color: string CSS. Anima transform (GPU), no width.

export default function MacroBar({ pct, color }) {
  return (
    <div
      aria-hidden='true'
      style={{
        height: '4px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '10px',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: color,
          borderRadius: '2px',
          transform: `scaleX(${Math.max(0, Math.min(pct, 100)) / 100})`,
          transformOrigin: 'left',
          transition: 'transform 700ms var(--ease-out)',
        }}
      />
    </div>
  )
}
