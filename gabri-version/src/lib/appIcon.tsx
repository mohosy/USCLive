import { ImageResponse } from "next/og";

/** The home-screen icon: USC cardinal, "USC" in white over "LIVE" in gold. Phones round the corners themselves. */
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#990000" }}>
        <div style={{ display: "flex", fontSize: size * 0.3, fontWeight: 800, color: "#ffffff", letterSpacing: -size * 0.01, lineHeight: 1 }}>USC</div>
        <div style={{ display: "flex", marginTop: size * 0.03, fontSize: size * 0.15, fontWeight: 800, color: "#FFCC00", letterSpacing: size * 0.02, lineHeight: 1 }}>LIVE</div>
      </div>
    ),
    { width: size, height: size },
  );
}
