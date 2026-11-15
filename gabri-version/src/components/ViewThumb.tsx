/**
 * Tiny previews for the Explore / Satellite switch (like the layer thumbnails in Google Maps).
 * Hand-drawn SVG in the same isometric angle as the map, so they're crisp and cost no network.
 */

/** An isometric box: front-bottom corner at (x, y), square footprint w, height h. */
function Box({ x, y, w, h, top, left, right }: { x: number; y: number; w: number; h: number; top: string; left: string; right: string }) {
  const t = y - h;
  return (
    <g>
      <path d={`M${x - w} ${t - w / 2}L${x} ${t}L${x} ${y}L${x - w} ${y - w / 2}Z`} fill={left} />
      <path d={`M${x} ${t}L${x + w} ${t - w / 2}L${x + w} ${y - w / 2}L${x} ${y}Z`} fill={right} />
      <path d={`M${x} ${t}L${x + w} ${t - w / 2}L${x} ${t - w}L${x - w} ${t - w / 2}Z`} fill={top} />
    </g>
  );
}

// campus diamond and the streets around it (shared so both previews line up)
const CAMPUS = "M5 25L22 16.5L39 25L22 33.5Z";
const STREETS = "M-2 23L24 10M20 10L46 23M-2 35L16 44M28 44L46 35";
// [x, y, w, h] for the buildings, back to front so nearer ones draw on top
const BLOCKS: [number, number, number, number][] = [
  [22, 21.5, 3.5, 6], [15, 25, 3.2, 4.5], [29, 25, 3.2, 5.5], [22, 28.5, 2.6, 3], [17.5, 30, 3, 4], [26.5, 30, 3, 3.5],
];
// pseudo-random tree canopy for the aerial look (fixed, so it never changes between renders)
const TREES = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37) % 44, y: (i * 23 + (i % 5) * 7) % 44, r: 1.4 + ((i * 13) % 10) / 6 }));

export function ExploreThumb() {
  return (
    <svg viewBox="6 9 32 32" aria-hidden className="h-full w-full">
      <rect width="44" height="44" fill="#ebeae7" />
      <path d={STREETS} stroke="#fff" strokeWidth="2.6" />
      <path d={CAMPUS} fill="#f6efe5" stroke="#990000" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M17 26L22 23.5L27 26L22 28.5Z" fill="#b9dda2" />
      {BLOCKS.map(([x, y, w, h], i) => <Box key={i} x={x} y={y} w={w} h={h} top="#f4eadc" left="#e3d3bf" right="#d5c1a9" />)}
    </svg>
  );
}

export function SatelliteThumb() {
  const roofs = ["#cfc7b9", "#b8715a", "#c9b08c", "#b8715a", "#d6d0c4", "#a9654f"];
  return (
    <svg viewBox="6 9 32 32" aria-hidden className="h-full w-full">
      <defs>
        <linearGradient id="sat-ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#77805f" />
          <stop offset="1" stopColor="#59623f" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" fill="url(#sat-ground)" />
      {TREES.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill={i % 3 ? "#3f5531" : "#4b6339"} opacity="0.85" />)}
      <path d={STREETS} stroke="#8f8c84" strokeWidth="2.8" />
      <path d={CAMPUS} fill="#a7a08f" opacity="0.55" />
      <path d="M17 26L22 23.5L27 26L22 28.5Z" fill="#6f9c4c" stroke="#e9eadf" strokeWidth="0.5" />
      {BLOCKS.map(([x, y, w, h], i) => (
        <g key={i}>
          {/* cast shadow to the lower right */}
          <path d={`M${x} ${y}L${x + w} ${y - w / 2}L${x + w + 3} ${y - w / 2 + 1.5}L${x + 3} ${y + 1.5}Z`} fill="#20241b" opacity="0.45" />
          <Box x={x} y={y} w={w} h={h} top={roofs[i]} left="#8a7766" right="#6c5a4b" />
        </g>
      ))}
    </svg>
  );
}
