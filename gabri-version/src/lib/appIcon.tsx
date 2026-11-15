import { ImageResponse } from "next/og";

/**
 * The USCLive mark: white "USC" in a classic Caslon serif on cardinal, "LIVE" in clean gold sans underneath.
 * Libre Caslon Text and Inter (Google Fonts, Open Font License) give USC's serif-wordmark feel without copying the
 * trademarked logo or shield. Phones round the corners of the home-screen icon themselves; the favicon is a rounded tile.
 */
const CARDINAL = "#990000";
const GOLD = "#FFCC00";
const SERIF = "Libre Caslon Text";
const SANS = "Inter";

async function googleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@700&text=${text}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null; // offline build: fall back to the default font
  }
}

async function loadFonts(families: string[]) {
  const loaded = await Promise.all(families.map(async (name) => ({ name, data: await googleFont(name, "USCLIVE") })));
  const fonts = loaded.flatMap(({ name, data }) => (data ? [{ name, data, style: "normal" as const, weight: 700 as const }] : []));
  return fonts.length ? { fonts } : {};
}

/** Home-screen / install icon: full-bleed square. */
export async function appIcon(size: number) {
  const u = size / 100;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: CARDINAL, fontWeight: 700 }}>
        <div style={{ display: "flex", fontFamily: SERIF, fontSize: 31 * u, color: "#ffffff", lineHeight: 1, letterSpacing: -0.5 * u }}>USC</div>
        <div style={{ display: "flex", fontFamily: SANS, marginTop: 6 * u, fontSize: 11.5 * u, color: GOLD, lineHeight: 1, letterSpacing: 3.4 * u, paddingLeft: 3.4 * u }}>LIVE</div>
      </div>
    ),
    { width: size, height: size, ...(await loadFonts([SERIF, SANS])) },
  );
}

/** Browser-tab favicon: white "USC" on a rounded cardinal tile, gold underline for "live". */
export async function favIcon(size: number) {
  const u = size / 32;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: CARDINAL, borderRadius: 7 * u, fontFamily: SERIF, fontWeight: 700 }}>
        <div style={{ display: "flex", fontSize: 13 * u, color: "#ffffff", lineHeight: 1, letterSpacing: -0.4 * u }}>USC</div>
        <div style={{ display: "flex", marginTop: 2.5 * u, width: 18 * u, height: 2.6 * u, borderRadius: 99, background: GOLD }} />
      </div>
    ),
    { width: size, height: size, ...(await loadFonts([SERIF])) },
  );
}
