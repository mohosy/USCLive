/** Map lighting that follows the real sun over USC (dawn / day / dusk / night). */
export type LightPreset = "dawn" | "day" | "dusk" | "night";

const RAD = Math.PI / 180;
const J2000 = 946_728_000_000; // 2000-01-01 12:00 UTC

/** Sun altitude above the horizon in degrees (standard low-precision solar formulas, ~0.5° accurate). */
export function sunAltitude(d: Date, lat = 34.0205, lng = -118.2856) {
  const days = (d.getTime() - J2000) / 864e5;
  const M = RAD * (357.5291 + 0.98560028 * days); // mean anomaly
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI; // ecliptic longitude
  const e = RAD * 23.4397; // obliquity of the ecliptic
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * days) + RAD * lng - ra; // hour angle
  const phi = RAD * lat;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
}

/** Golden hour around sunrise/sunset is dawn/dusk; full dark is night. */
export function lightFor(d: Date): LightPreset {
  const alt = sunAltitude(d);
  if (alt > 8) return "day";
  if (alt < -8) return "night";
  return sunAltitude(new Date(+d + 10 * 60_000)) > alt ? "dawn" : "dusk"; // rising = morning (any timezone)
}
