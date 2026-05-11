function scoreColor(value) {
  if (value <= 40) {
    const t = value / 40
    return `rgb(${Math.round(220 + 35 * t)},${Math.round(53 + 140 * t)},${Math.round(69 - 62 * t)})`
  }
  const t = (value - 40) / 60
  return `rgb(${Math.round(255 - 230 * t)},${Math.round(193 - 58 * t)},${Math.round(7 + 77 * t)})`
}

function Donut({ value, size, stroke }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ
  const color = scoreColor(value)
  const fontSize = size >= 60 ? Math.round(size * 0.25) : Math.round(size * 0.27)

  return (
    <span
      title={`Fit score: ${value}%`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', fontFamily: 'var(--font-mono)', fontSize, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </span>
    </span>
  )
}

export function Fit({ value }) {
  return <Donut value={value} size={44} stroke={3.5} />
}

export function FitRing({ value, size = 72 }) {
  return <Donut value={value} size={size} stroke={6} />
}

export function Pill({ children, style, onClick, title }) {
  return (
    <span
      className="pill"
      style={onClick ? { cursor: 'pointer', ...style } : style}
      onClick={onClick}
      title={title}
    >
      {children}
    </span>
  )
}
