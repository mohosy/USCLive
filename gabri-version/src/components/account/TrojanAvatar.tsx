import type { TrojanLook } from "@/lib/types";

const COLOR: Record<TrojanLook["plume"], string> = { cardinal: "#990000", gold: "#FFCC00", white: "#ffffff", black: "#1d1d1f" };
const DEFAULT_LOOK: TrojanLook = { plume: "cardinal", cape: "cardinal", jersey: 7 };

/** Your Trojan: a flat helmet with a plume, over a jersey with your number. Colors come from Settings. */
export default function TrojanAvatar({ look, size = 104 }: { look?: TrojanLook; size?: number }) {
  const t = look ?? DEFAULT_LOOK;
  const plume = COLOR[t.plume] ?? COLOR.cardinal;
  const cape = COLOR[t.cape] ?? COLOR.cardinal;
  const number = cape === COLOR.gold ? "#990000" : "#FFCC00";
  const outline = t.plume === "white" ? "#c7c7cc" : "none";
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cardinal/[0.07]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Trojan avatar, number ${t.jersey}`}>
        {/* plume */}
        <path d="M34 30 C 38 12, 62 10, 70 22 L 64 26 C 58 18, 44 18, 40 32 Z" fill={plume} stroke={outline} strokeWidth={1.5} />
        {/* helmet */}
        <path d="M28 52 C 28 34, 72 34, 72 52 L 72 60 L 28 60 Z" fill="#FFCC00" />
        {/* visor */}
        <rect x="34" y="50" width="32" height="10" rx="4" fill="#1d1d1f" />
        <rect x="37" y="53" width="26" height="4" rx="2" fill="#f2c9a0" />
        {/* jersey */}
        <rect x="30" y="64" width="40" height="26" rx="7" fill={cape} />
        <text x="50" y="83" textAnchor="middle" fontSize="16" fontWeight="700" fill={number} fontFamily="inherit">
          {t.jersey}
        </text>
      </svg>
    </span>
  );
}
