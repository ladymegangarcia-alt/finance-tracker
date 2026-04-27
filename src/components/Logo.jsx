export default function Logo({ variant = 'light', size = 40 }) {
  const bookColor = variant === 'dark' ? '#faf6ec' : '#1e5940'
  const textColor = variant === 'dark' ? '#faf6ec' : '#1e5940'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 60 60" fill="none">
        <path
          d="M 18 14 A 12 12 0 0 1 42 14"
          stroke="#c89b3c"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="30" cy="14" r="4" fill="#c89b3c" />
        <path
          d="M 14 28 L 30 24 L 46 28 L 46 46 L 30 50 L 14 46 Z"
          stroke={bookColor}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <line x1="30" y1="24" x2="30" y2="50" stroke={bookColor} strokeWidth="3" />
      </svg>
      <span
        style={{
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: size * 0.55,
          color: textColor,
          letterSpacing: '0.5px',
          lineHeight: 1,
        }}
      >
        StewardSoft
      </span>
    </div>
  )
}
