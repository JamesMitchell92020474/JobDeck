export function Fit({ value }) {
  return (
    <span className="fit" title={`Fit score: ${value}%`}>
      <span className="fit-bar"><i style={{ width: `${value}%` }} /></span>
      <span className="fit-num">{value}</span>
    </span>
  )
}

export function FitRing({ value, size = 64 }) {
  return (
    <span
      className="fit-ring"
      style={{ '--p': value, width: size, height: size }}
    >
      <span style={{ fontSize: size > 70 ? 20 : 18 }}>{value}</span>
    </span>
  )
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
