interface SycharLogoProps {
  size?: number
  showWordmark?: boolean
}

export default function SycharLogo({ size = 40, showWordmark = false }: SycharLogoProps) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg
        viewBox="0 0 60 60"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top-left rounded block */}
        <rect x="4" y="4" width="34" height="26" rx="8" fill="#2EA8E0" />
        {/* Bottom-right rounded block */}
        <rect x="22" y="30" width="34" height="26" rx="8" fill="#2EA8E0" />
        {/* White notch — hides top-right of top block, creating S-curve */}
        <rect x="24" y="4" width="14" height="26" fill="white" />
        {/* White notch — hides bottom-left of bottom block */}
        <rect x="22" y="30" width="14" height="26" fill="white" />
      </svg>
      {showWordmark && (
        <span style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700,
          fontSize: size * 0.3,
          letterSpacing: '0.12em',
          color: '#1a1a2e',
          textTransform: 'uppercase',
        }}>
          SYCHAR
        </span>
      )}
    </div>
  )
}
