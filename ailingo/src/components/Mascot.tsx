export type Mood = "happy" | "cheer" | "sad" | "think";

/** Robi, the AIlingo robot. Pure SVG so it works offline and respects reduced motion via CSS. */
export function Mascot({ mood = "happy", size = 96, label = "Robi" }: { mood?: Mood; size?: number; label?: string }) {
  const ink = "#1f2a24";
  return (
    <svg className={`mascot mood-${mood}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} style={{ overflow: "visible" }}>
      <g className="ant">
        <line x1="50" y1="24" x2="50" y2="12" stroke="#46a302" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="9" r="6" fill="#ffc800" stroke="#d9a600" strokeWidth="2" />
      </g>
      <circle cx="14" cy="54" r="7" fill="#46a302" />
      <circle cx="86" cy="54" r="7" fill="#46a302" />
      <rect x="18" y="24" width="64" height="62" rx="24" fill="#58cc02" stroke="#46a302" strokeWidth="4" />
      <rect x="26" y="33" width="48" height="42" rx="16" fill="#fff" />
      {mood === "cheer" ? (
        <path d="M34 46 Q39 38 44 46 M56 46 Q61 38 66 46" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <ellipse className="eye" cx="39" cy="47" rx="4.5" ry="5.5" fill={ink} />
          <ellipse className="eye" cx="61" cy="47" rx="4.5" ry="5.5" fill={ink} />
        </>
      )}
      {mood === "sad" && <path d="M32 40 L45 43 M68 40 L55 43" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
      {mood === "think" && <path d="M32 38 L46 40" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
      {mood === "cheer" && <path d="M38 58 Q50 76 62 58 Z" fill="#ff4b4b" stroke={ink} strokeWidth="3" strokeLinejoin="round" />}
      {mood === "sad" && <path d="M40 66 Q50 58 60 66" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />}
      {mood === "think" && <path d="M42 63 H58" stroke={ink} strokeWidth="4" strokeLinecap="round" />}
      {mood === "happy" && <path d="M40 60 Q50 70 60 60" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />}
    </svg>
  );
}
