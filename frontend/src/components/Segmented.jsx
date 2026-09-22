// Control segmentado de iOS: el "thumb" se desliza al segmento elegido.
export default function Segmented({ options, value, onChange, label, style }) {
  const idx = Math.max(0, options.findIndex(o => o.id === value))
  return (
    <div className='nf-seg' role='tablist' aria-label={label} style={style}>
      <div
        className='nf-seg-thumb'
        aria-hidden='true'
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map(o => (
        <button
          key={o.id}
          role='tab'
          aria-selected={o.id === value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.id)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
