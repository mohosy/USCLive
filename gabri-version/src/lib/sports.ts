/** Every USC sport, where it plays, and team colours. Plain data: no imports, safe in the browser. */

export type SportId =
  | "football" | "mbb" | "wbb" | "wvb" | "mvb" | "mwp" | "wwp" | "mswim" | "wswim"
  | "baseball" | "wsoc" | "wlax" | "bvb" | "mten" | "wten" | "track" | "mgolf" | "wgolf";

export interface Venue { id: string; name: string; lat: number; lng: number; osmName: string }

/** Coordinates checked against OpenStreetMap (Nominatim) on Nov 14 2026. */
export const VENUES: Record<string, Venue> = {
  coliseum: { id: "coliseum", name: "Los Angeles Memorial Coliseum", lat: 34.01392, lng: -118.2878, osmName: "Los Angeles Memorial Coliseum" },
  galen: { id: "galen", name: "Galen Center", lat: 34.02075, lng: -118.2798, osmName: "Galen Center" },
  uytengsu: { id: "uytengsu", name: "Uytengsu Aquatics Center", lat: 34.02407, lng: -118.28911, osmName: "Uytengsu Aquatics Center" },
  dedeaux: { id: "dedeaux", name: "Dedeaux Field", lat: 34.02402, lng: -118.29027, osmName: "Dedeaux Field" },
  mcalister: { id: "mcalister", name: "McAlister Field", lat: 34.02657, lng: -118.28273, osmName: "McAlister Field" },
  // OSM calls this one "Norman Stadium"
  merle: { id: "merle", name: "Merle Norman Stadium", lat: 34.0202, lng: -118.28148, osmName: "Norman Stadium" },
  // OSM: "David X Marks Tennis Stadium"
  marks: { id: "marks", name: "Marks Stadium", lat: 34.02309, lng: -118.29063, osmName: "David X Marks Tennis Stadium" },
  // OSM has no "Loker Stadium": this point is "Allyson Felix Field", the track inside it
  loker: { id: "loker", name: "Loker Stadium", lat: 34.02199, lng: -118.28789, osmName: "Allyson Felix Field" },
};

export type SportFormat =
  | { kind: "periods"; count: number; minutes: number; name: "Q" | "H" }
  | { kind: "innings"; count: 9 }
  /** team score = sets won; each set's points go in the line table */
  | { kind: "sets"; bestOf: 5; to: 25; lastTo: 15 }
  /** team score = matches won */
  | { kind: "matches"; total: number }
  /** team points */
  | { kind: "points" };

export interface SportConfig {
  id: SportId;
  label: string;
  short: string;
  /** null = off campus, list only */
  venueId: string | null;
  /** the text after "USC Trojans " in the athletics calendar */
  icsName: string;
  espn: { path: string; teamId: string } | null;
  format: SportFormat;
  /** the "+N" choices for a scoring play */
  increments: number[];
}

const periods = (count: number, minutes: number, name: "Q" | "H"): SportFormat => ({ kind: "periods", count, minutes, name });
const sets: SportFormat = { kind: "sets", bestOf: 5, to: 25, lastTo: 15 };
const SWIM = [1, 2, 3, 4, 5, 6, 7, 9];
const espn = (path: string, teamId = "30") => ({ path, teamId });

export const SPORTS: Record<SportId, SportConfig> = {
  football: { id: "football", label: "Football", short: "FB", venueId: "coliseum", icsName: "Football", espn: espn("football/college-football"), format: periods(4, 15, "Q"), increments: [1, 2, 3, 6] },
  mbb: { id: "mbb", label: "Men's Basketball", short: "MBB", venueId: "galen", icsName: "Men's Basketball", espn: espn("basketball/mens-college-basketball"), format: periods(2, 20, "H"), increments: [1, 2, 3] },
  wbb: { id: "wbb", label: "Women's Basketball", short: "WBB", venueId: "galen", icsName: "Women's Basketball", espn: espn("basketball/womens-college-basketball"), format: periods(4, 10, "Q"), increments: [1, 2, 3] },
  wvb: { id: "wvb", label: "Women's Volleyball", short: "WVB", venueId: "galen", icsName: "Women's Volleyball", espn: espn("volleyball/womens-college-volleyball"), format: sets, increments: [1] },
  mvb: { id: "mvb", label: "Men's Volleyball", short: "MVB", venueId: "galen", icsName: "Men's Volleyball", espn: espn("volleyball/mens-college-volleyball"), format: sets, increments: [1] },
  mwp: { id: "mwp", label: "Men's Water Polo", short: "MWP", venueId: "uytengsu", icsName: "Men's Water Polo", espn: espn("water-polo/mens-college-water-polo"), format: periods(4, 8, "Q"), increments: [1] },
  wwp: { id: "wwp", label: "Women's Water Polo", short: "WWP", venueId: "uytengsu", icsName: "Women's Water Polo", espn: espn("water-polo/womens-college-water-polo"), format: periods(4, 8, "Q"), increments: [1] },
  mswim: { id: "mswim", label: "Men's Swimming & Diving", short: "MSD", venueId: "uytengsu", icsName: "Men's Swimming & Diving", espn: null, format: { kind: "points" }, increments: SWIM },
  wswim: { id: "wswim", label: "Women's Swimming & Diving", short: "WSD", venueId: "uytengsu", icsName: "Women's Swimming & Diving", espn: null, format: { kind: "points" }, increments: SWIM },
  baseball: { id: "baseball", label: "Baseball", short: "BSB", venueId: "dedeaux", icsName: "Baseball", espn: espn("baseball/college-baseball", "68"), format: { kind: "innings", count: 9 }, increments: [1] },
  wsoc: { id: "wsoc", label: "Women's Soccer", short: "WSOC", venueId: "mcalister", icsName: "Women's Soccer", espn: espn("soccer/usa.ncaa.w.1", "20511"), format: periods(2, 45, "H"), increments: [1] },
  wlax: { id: "wlax", label: "Women's Lacrosse", short: "WLAX", venueId: "mcalister", icsName: "Women's Lacrosse", espn: null, format: periods(4, 15, "Q"), increments: [1] },
  bvb: { id: "bvb", label: "Women's Beach Volleyball", short: "BVB", venueId: "merle", icsName: "Women's Beach Volleyball", espn: null, format: { kind: "matches", total: 5 }, increments: [1] },
  mten: { id: "mten", label: "Men's Tennis", short: "MTEN", venueId: "marks", icsName: "Men's Tennis", espn: null, format: { kind: "matches", total: 7 }, increments: [1] },
  wten: { id: "wten", label: "Women's Tennis", short: "WTEN", venueId: "marks", icsName: "Women's Tennis", espn: null, format: { kind: "matches", total: 7 }, increments: [1] },
  track: { id: "track", label: "Track & Field", short: "T&F", venueId: "loker", icsName: "Track & Field", espn: null, format: { kind: "points" }, increments: SWIM },
  mgolf: { id: "mgolf", label: "Men's Golf", short: "MGOLF", venueId: null, icsName: "Men's Golf", espn: null, format: { kind: "points" }, increments: SWIM },
  wgolf: { id: "wgolf", label: "Women's Golf", short: "WGOLF", venueId: null, icsName: "Women's Golf", espn: null, format: { kind: "points" }, increments: SWIM },
};

export const SPORT_IDS = Object.keys(SPORTS) as SportId[];

/** Team colours: background and the text colour that sits on it. */
export const TEAM_COLORS: Record<string, { color: string; textColor: string }> = {
  USC: { color: "#990000", textColor: "#FFCC00" },
  UCLA: { color: "#2D68C4", textColor: "#F2A900" },
  ORE: { color: "#154733", textColor: "#FEE123" },
  WASH: { color: "#3E3468", textColor: "#E8D3A2" },
  STAN: { color: "#8C1515", textColor: "#FFFFFF" },
  ND: { color: "#0C2340", textColor: "#C99700" },
  CAL: { color: "#003262", textColor: "#FDB515" },
  MICH: { color: "#00274C", textColor: "#FFCB05" },
  OSU: { color: "#BB0000", textColor: "#FFFFFF" },
  PSU: { color: "#041E42", textColor: "#FFFFFF" },
  IU: { color: "#990000", textColor: "#EEEDEB" },
};
const NEUTRAL = { color: "#3a3a3c", textColor: "#ffffff" };
export const teamColors = (abbr: string) => TEAM_COLORS[abbr.toUpperCase()] ?? NEUTRAL;
