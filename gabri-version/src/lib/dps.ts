/**
 * USC DPS "Daily Crime and Fire Log" importer.
 * Source: https://dps.usc.edu/alerts/log/ (public PDF, published each morning for the previous day).
 *
 * 1. find the newest daily PDF on the log page
 * 2. read text items with their x/y position and rebuild the table by column
 * 3. keep crimes / safety incidents (skip welfare checks, alarms, medical calls)
 * 4. place each incident: campus building by name, otherwise Mapbox place search
 *    ("EXPOSITION BL & WATT WY", "1100 Block Of 30TH ST")
 */
import { getDocumentProxy } from "unpdf";
import { BUILDINGS } from "./campus";
import type { SafetyAlert } from "./types";

const LOG_PAGE = "https://dps.usc.edu/alerts/log/";
const UA = "USCLive/0.1 (student hackathon project)";
const BBOX = "-118.3000,34.0080,-118.2700,34.0330"; // campus + the patrol area around it

export interface LogIncident {
  event: string;
  caseNo: string;
  reportedAt: string; // ISO
  offense: string; // final incident
  location: string;
  locationType: string; // "On Campus", "Public property", ...
  disposition: string;
}

/* ---------------- fetch + parse ---------------- */

export async function findLatestLogPdf(): Promise<string> {
  const res = await fetch(LOG_PAGE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DPS log page: ${res.status}`);
  const html = await res.text();
  // daily logs are named like /wp-content/uploads/2026/11/111326.pdf (MMDDYY); the 60-day log is named differently
  const links = Array.from(html.matchAll(/href="(https:\/\/dps\.usc\.edu\/wp-content\/uploads\/[^"]+?\/(\d{6})\.pdf)"/g));
  if (!links.length) throw new Error("No daily log PDF found on the DPS page");
  const key = (mmddyy: string) => `${mmddyy.slice(4, 6)}${mmddyy.slice(0, 2)}${mmddyy.slice(2, 4)}`;
  links.sort((a, b) => key(b[2]).localeCompare(key(a[2])));
  return links[0][1];
}

const HEADERS = ["Date Reported", "Event #", "Case #", "Offense", "Initial Incident", "Final Incident", "Date From", "Date To", "Location", "Disposition"] as const;
type Col = (typeof HEADERS)[number];

function parseReported(date: string, time: string): string | null {
  const d = date.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  const t = time.match(/(\d{1,2}):(\d{2})/);
  if (!d) return null;
  const dt = new Date(2000 + Number(d[3]), Number(d[1]) - 1, Number(d[2]), t ? Number(t[1]) : 12, t ? Number(t[2]) : 0);
  return isNaN(+dt) ? null : dt.toISOString();
}

export async function parseLogPdf(data: Uint8Array): Promise<LogIncident[]> {
  const pdf = await getDocumentProxy(data);
  const out: LogIncident[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as { str: string; transform: number[] }[])
      .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
      .filter((i) => i.s);

    // column x positions from this page's header row
    const cols: { name: Col; x: number }[] = [];
    for (const h of HEADERS) {
      const it = items.find((i) => i.s === h);
      if (it) cols.push({ name: h, x: it.x });
    }
    if (cols.length < 6) continue;
    const headerY = items.find((i) => i.s === "Date Reported")!.y;
    cols.sort((a, b) => a.x - b.x);
    const colOf = (x: number) => [...cols].reverse().find((c) => c.x <= x + 4)?.name;

    // a record starts with a date in the first column
    const starts = items.filter((i) => i.y < headerY - 2 && colOf(i.x) === "Date Reported" && /^\d{2}\/\d{2}\/\d{2}/.test(i.s)).sort((a, b) => b.y - a.y);
    starts.forEach((st, k) => {
      const lowerBound = k + 1 < starts.length ? starts[k + 1].y + 2 : -Infinity;
      const rows = items.filter((i) => i.y <= st.y + 2 && i.y > lowerBound && i.y < headerY - 2 && !/^Page \d/.test(i.s) && !/^\d+$/.test(i.s));
      const cell: Partial<Record<Col, string>> = {};
      for (const it of rows.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const c = colOf(it.x);
        if (c) cell[c] = cell[c] ? `${cell[c]} ${it.s}` : it.s;
      }
      // "Event #", "Case #" and "Offense" often arrive as one string
      const head = `${cell["Event #"] ?? ""} ${cell["Case #"] ?? ""}`;
      const event = head.match(/\d{2}-\d{2}-\d{2}-\d+/)?.[0] ?? "";
      const caseNo = head.replace(event, "").match(/\b\d{6,8}\b/)?.[0] ?? "";
      const reported = parseReported(cell["Date Reported"] ?? "", (cell["Date Reported"] ?? "").split("at")[1] ?? "");
      const loc = (cell["Location"] ?? "").replace(/\s+/g, " ").trim();
      const [location, ...rest] = loc.split(/\s+-\s+/);
      if (!event || !reported) return;
      out.push({
        event,
        caseNo,
        reportedAt: reported,
        offense: (cell["Final Incident"] ?? cell["Initial Incident"] ?? "").replace(/\s+/g, " ").trim(),
        location: location.replace(/\s*-\s*$/, "").trim(),
        locationType: rest.join(" - ").replace(/\s+/g, " ").trim(),
        disposition: (cell["Disposition"] ?? "").replace(/\s+/g, " ").trim(),
      });
    });
  }
  return out;
}

/* ---------------- classify ---------------- */

const SKIP = /^(SERVICE|ALARM RESPONSE|MEDICAL|ASSIST|INFORMATION|PROPERTY|LA MUNICIPAL CODE|FIRE -Fire Alarm)/i;
const RULES: [RegExp, SafetyAlert["kind"], SafetyAlert["severity"], string][] = [
  [/ROBBERY|ASSAULT|BATTERY|WEAPON|SHOOT|STAB|SEX|RAPE|KIDNAP|BRANDISH/i, "crime", "high", "Avoid the area and walk with others"],
  [/BURGLARY|THEFT|STOLEN|VEHICLE.*THEFT|LARCENY/i, "crime", "medium", "Keep belongings and bikes locked"],
  [/HATE|THREAT|HARASS|STALK|OBSCENE|INDECENT|LEWD/i, "crime", "medium", "Report anything suspicious to DPS"],
  [/VANDALISM|TRESPASS|DISORDERLY|PROWL|LOITER|SUSPICIOUS/i, "suspicious", "low", "Stay aware of your surroundings"],
  [/FIRE|HAZARD|TRAFFIC|COLLISION/i, "hazard", "low", "Use caution in the area"],
];

export function classify(offense: string): { kind: SafetyAlert["kind"]; severity: SafetyAlert["severity"]; advice: string } | null {
  if (SKIP.test(offense)) return null;
  for (const [re, kind, severity, advice] of RULES) if (re.test(offense)) return { kind, severity, advice };
  return null;
}

/** "THEFT-GRAND - Theft Grand-Trick or Device" -> "Grand theft (trick or device)" style short title */
export function shortTitle(offense: string) {
  const detail = offense.split(/\s+-\s+/).slice(1).join(" - ") || offense;
  const t = detail.replace(/\((MISD|FEL)\)/gi, "").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/* ---------------- locate ---------------- */

const STOP = new Set(["hall", "of", "the", "and", "center", "building", "for", "on", "campus", "usc", "&"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Best building whose name shares most of its distinctive words with the DPS location text. */
export function matchBuildingName(loc: string) {
  const lw = new Set(words(loc));
  let best: { b: (typeof BUILDINGS)[number]; score: number } | null = null;
  for (const b of BUILDINGS) {
    const bw = words(b.name);
    if (!bw.length) continue;
    const hit = bw.filter((w) => lw.has(w)).length;
    const score = hit / bw.length;
    if (hit >= 1 && score >= 0.6 && (!best || score > best.score)) best = { b, score };
  }
  return best?.b ?? null;
}

const geoCache = new Map<string, { lat: number; lng: number } | null>();

function toQuery(loc: string) {
  const fix = (s: string) =>
    s.replace(/\bBL\b/g, "Blvd").replace(/\bWY\b/g, "Way").replace(/\bAV\b/g, "Ave").replace(/\bST\b/g, "St").replace(/\bPL\b/g, "Pl").replace(/\bDR\b/g, "Dr");
  const block = loc.match(/^(\d+)\s+Block Of\s+(.+)$/i);
  // middle of the block; numbered streets around USC are "West" (W 30th St), named ones aren't (Ellendale Pl)
  if (block) return `${Number(block[1]) + 50} ${/^\d/.test(block[2]) ? "W " : ""}${fix(block[2])}, Los Angeles, CA`;
  if (loc.includes("&")) return `${fix(loc).replace("&", "and")}, Los Angeles, CA`;
  return `${fix(loc)}, Los Angeles, CA`;
}

const STREETISH = /&|\bBlock Of\b|\b(BL|ST|AV|WY|PL|DR|BLVD|AVE)\s*$/i;

export async function locate(loc: string): Promise<{ lat: number; lng: number; label: string } | null> {
  // street corners and blocks go to the geocoder; only real place names are matched to buildings
  const b = STREETISH.test(loc) ? null : matchBuildingName(loc);
  if (b) return { lat: b.lat, lng: b.lng, label: b.name };
  const key = loc.toLowerCase();
  if (geoCache.has(key)) {
    const c = geoCache.get(key);
    return c ? { ...c, label: loc } : null;
  }
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const q = encodeURIComponent(toQuery(loc));
  try {
    const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?q=${q}&proximity=-118.2851,34.0208&bbox=${BBOX}&limit=1&access_token=${token}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null; // rate limit / outage: try again next sync instead of caching "not found"
    const d = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
    const f = d.features?.[0];
    const hit = f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null;
    geoCache.set(key, hit);
    return hit ? { ...hit, label: loc } : null;
  } catch {
    return null;
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bBl\b/, "Blvd").replace(/\bWy\b/, "Way").replace(/\bAv\b/, "Ave");

/* ---------------- incidents -> map alerts ---------------- */

export const LOG_TTL_HOURS = 72; // DPS posts on weekdays, so keep weekend maps populated

export async function incidentsToAlerts(incidents: LogIncident[]): Promise<SafetyAlert[]> {
  const out: SafetyAlert[] = [];
  for (const inc of incidents) {
    const c = classify(inc.offense);
    if (!c) continue;
    const spot = await locate(inc.location);
    if (!spot) continue;
    out.push({
      id: `dps_${inc.event}`,
      kind: c.kind,
      severity: c.severity,
      title: shortTitle(inc.offense),
      advice: c.advice,
      locationText: spot.label === inc.location ? titleCase(inc.location) : spot.label,
      lat: spot.lat,
      lng: spot.lng,
      radiusM: c.severity === "high" ? 90 : 55,
      createdAt: inc.reportedAt,
      expiresAt: new Date(+new Date(inc.reportedAt) + LOG_TTL_HOURS * 3600_000).toISOString(),
      source: "dps_log",
      resolved: false,
      caseNo: inc.caseNo || undefined,
      disposition: inc.disposition || undefined,
    });
  }
  return out;
}

/** Full sync: newest daily log -> alerts. */
export async function syncDpsLog() {
  const url = await findLatestLogPdf();
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DPS PDF: ${res.status}`);
  const incidents = await parseLogPdf(new Uint8Array(await res.arrayBuffer()));
  const alerts = await incidentsToAlerts(incidents);
  return { url, incidents: incidents.length, alerts };
}
