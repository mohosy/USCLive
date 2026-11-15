import { z } from "zod";

// Dining hall menus and hours. Pure code: types, parsers, the demo menu. No fetching here.

export type HallId = "evk" | "parkside" | "village";
export type MealId = "breakfast" | "brunch" | "lunch" | "dinner";
export type DietTag = "vegan" | "vegetarian" | "gluten-free" | "halal";
export interface MenuItem { name: string; tags: DietTag[]; /** allergen names as the site lists them, lower case: "dairy", "eggs", "soy" … */ allergens: string[]; /** a notice line ("MADE TO ORDER OMELETTES UNTIL 1PM"), not a dish */ note: boolean }
export interface MenuStation { name: string; subtitle?: string; items: MenuItem[] }
export interface MenuMeal { id: MealId; name: string; stations: MenuStation[] }
export interface HallHours { /** ISO times for that day, or null when unknown or closed all day */ open: string | null; close: string | null; openNow: boolean; /** "Open now · closes 10 PM" | "Closed · opens 7 AM" | "Closed · opens 8:30 AM tomorrow" | "Closed today" | "Hours unavailable" */ label: string; source: "usc" | "usual" }
export interface HallMenu {
  hall: HallId; name: string; short: string; buildingId: string; lat: number; lng: number;
  /** the day this menu is for, YYYY-MM-DD in Los Angeles time */
  date: string;
  /** only meals that are served that day, in day order */
  meals: MenuMeal[];
  /** the meal being served now, else the next one today, else the last one; null when there are none */
  currentMeal: MealId | null;
  hours: HallHours;
  source: "usc" | "demo";
  /** "Menu · USC Hospitality" | "Demo menu" */
  sourceLabel: string;
  fetchedAt: string;
}
export interface DiningPayload { date: string; halls: HallMenu[]; notes: string[] }

export const HALL_IDS: HallId[] = ["evk", "parkside", "village"];

export interface HallInfo { id: HallId; name: string; short: string; buildingId: string; slug: string; hoursLocationId: string; lat: number; lng: number }

// Coordinates checked against OpenStreetMap (Nominatim) on 2026-11-14.
export const DINING_HALLS: Record<HallId, HallInfo> = {
  // OSM: "Everybody's Kitchen" (amenity=restaurant), about 1 m from the campus.ts point
  evk: { id: "evk", name: "Everybody's Kitchen", short: "EVK", buildingId: "evk", slug: "evk", hoursLocationId: "405", lat: 34.021383, lng: -118.282114 },
  // OSM: "Parkside Dining Hall", 3771 McClintock Avenue (amenity=restaurant), about 79 m from the campus.ts point
  parkside: { id: "parkside", name: "Parkside Restaurant & Grill", short: "Parkside", buildingId: "pks", slug: "parkside", hoursLocationId: "406", lat: 34.018882, lng: -118.291089 },
  // OSM has no "USC Village Dining Hall". The only dining point near it is "Honors Dining Hall" (the
  // McCarthy Honors college, a different hall), so this uses OSM's "USC Village" point as a whole
  // (amenity=university), about 105 m from the campus.ts point.
  village: { id: "village", name: "USC Village Dining Hall", short: "Village", buildingId: "vil", slug: "university-village", hoursLocationId: "407", lat: 34.025883, lng: -118.285232 },
};

export const HOURS_URL = "https://hospitality.usc.edu/hours-of-operation/";

export function menuUrl(hall: HallId, dateISO: string): string {
  const [y, m, d] = dateISO.split("-");
  return `https://hospitality.usc.edu/wp-json/hsp-api/v1/get-res-dining-menus/${DINING_HALLS[hall].slug}?y=${y}&m=${m.padStart(2, "0")}&d=${d.padStart(2, "0")}`;
}

// ---------- Los Angeles time helpers ----------

const LA = "America/Los_Angeles";
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: LA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function laParts(ms: number) {
  const o: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in Los Angeles time */
export function laDate(now: number): string {
  const p = laParts(now);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** minutes since midnight, Los Angeles time */
export function laMinutes(now: number): number {
  const p = laParts(now);
  return p.h * 60 + p.mi;
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD */
export function dayOfWeek(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** the real moment (ms) of a Los Angeles wall-clock time on a date */
export function laEpoch(dateISO: string, minutes: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = laParts(t);
    t += wall - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return t;
}

/** "7 AM", "8:30 AM", "10 PM" in Los Angeles time */
export function fmtTime(ms: number): string {
  const p = laParts(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}${p.mi ? ":" + pad(p.mi) : ""} ${p.h < 12 ? "AM" : "PM"}`;
}

// ---------- menu parsing ----------

const rawItem = z.object({ item: z.string(), allergens: z.array(z.string()).nullish(), preferences: z.array(z.string()).nullish() });
const rawStation = z.object({ station: z.string(), subtitle: z.string().nullish(), menu: z.array(rawItem).nullish() });
const rawMeal = z.object({ name: z.string(), stations: z.array(rawStation).nullish() });
const rawMenu = z.object({ meals: z.array(rawMeal) });

const MEAL_BY_NAME: Record<string, MealId> = { breakfast: "breakfast", brunch: "brunch", lunch: "lunch", dinner: "dinner" };

function makeItem(name: string, allergenSlugs: string[], prefs: string[]): MenuItem {
  const hasMarker = allergenSlugs.length > 0 || prefs.length > 0;
  const tags: DietTag[] = [];
  if (prefs.includes("vegan")) tags.push("vegan");
  if (prefs.includes("vegan") || prefs.includes("vegetarian")) tags.push("vegetarian");
  if (hasMarker && !allergenSlugs.includes("gluten") && !allergenSlugs.includes("not-analyzed")) tags.push("gluten-free");
  if (prefs.includes("halal-ingredients")) tags.push("halal");
  const allergens = [...new Set(allergenSlugs.filter((a) => a !== "not-analyzed").map((a) => a.replace(/-/g, " ")))];
  const note = !hasMarker && /[A-Z]/.test(name) && name === name.toUpperCase();
  return { name, tags, allergens, note };
}

/** Reads the USC Hospitality menu reply. Null when the shape is wrong or no meal has any dishes. */
export function parseMenu(raw: unknown): MenuMeal[] | null {
  const parsed = rawMenu.safeParse(raw);
  if (!parsed.success) return null;
  const meals: MenuMeal[] = [];
  for (const m of parsed.data.meals) {
    const id = MEAL_BY_NAME[m.name.trim().toLowerCase()];
    if (!id || !m.stations) continue; // a meal with no stations is not served
    const stations: MenuStation[] = [];
    for (const s of m.stations) {
      const items: MenuItem[] = [];
      for (const it of s.menu ?? []) {
        const name = it.item.trim();
        if (name) items.push(makeItem(name, (it.allergens ?? []).map((a) => a.trim().toLowerCase()), (it.preferences ?? []).map((p) => p.trim().toLowerCase())));
      }
      if (!items.length) continue;
      const subtitle = s.subtitle?.trim();
      stations.push({ name: s.station.trim(), ...(subtitle ? { subtitle } : {}), items });
    }
    if (stations.length) meals.push({ id, name: m.name.trim(), stations });
  }
  return meals.length ? meals : null;
}

// ---------- hours ----------

const decodeAttr = (s: string) => s.replace(/&quot;|&#0?34;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&");
const shiftsSchema = z.array(z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]));

/** Today's opening times for one hall from the hours page. Null when the hall is missing or unreadable. */
export function parseHours(html: string, locationId: string, now: number): { open: number; close: number }[] | null {
  for (const tag of html.match(/<span\b[^>]*\bopen-indicator\b[^>]*>/g) ?? []) {
    if (tag.match(/\bdata-location="([^"]*)"/)?.[1] !== locationId) continue;
    const attr = tag.match(/\bdata-shifts="([^"]*)"/)?.[1];
    if (attr === undefined) return null;
    let json: unknown;
    try { json = JSON.parse(decodeAttr(attr)); } catch { return null; }
    const shifts = shiftsSchema.safeParse(json);
    if (!shifts.success) return null;
    const all = shifts.data.map(([a, b]) => ({ open: Number(a), close: Number(b) })).filter((s) => Number.isFinite(s.open) && Number.isFinite(s.close) && s.close > s.open);
    if (all.length !== shifts.data.length) return null;
    // a page cached from before midnight would show yesterday: treat that as unreadable
    const today = laDate(now);
    const mine = all.filter((s) => laDate(s.open) === today);
    return all.length && !mine.length ? null : mine.sort((a, b) => a.open - b.open);
  }
  return null;
}

// Regular term hours, read from the hours page on Nov 14 2026. This is the fallback when the page
// cannot be read, and what is shown for any day other than today. [open, close] in minutes from
// midnight, Los Angeles time, indexed 0 = Sunday … 6 = Saturday.
const H = (h: number, m = 0) => h * 60 + m;
export const USUAL_HOURS: Record<HallId, [number, number][]> = {
  evk: [[H(8, 30), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(20)], [H(7), H(22)], [H(8, 30), H(22)]],
  parkside: [[H(8, 30), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(8, 30), H(20)]],
  village: [[H(11), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(22)], [H(7), H(20)], [H(8, 30), H(22)]],
};

/** Opening label for a day. `todayShifts` are the page's times (only used when the date is today). */
export function hoursFor(hall: HallId, dateISO: string, now: number, todayShifts: { open: number; close: number }[] | null): HallHours {
  const isToday = dateISO === laDate(now);
  let shifts: { open: number; close: number }[];
  let source: "usc" | "usual";
  if (isToday && todayShifts) {
    shifts = [...todayShifts].sort((a, b) => a.open - b.open);
    source = "usc";
  } else {
    const usual = USUAL_HOURS[hall]?.[dayOfWeek(dateISO)];
    if (!usual) return { open: null, close: null, openNow: false, label: "Hours unavailable", source: "usual" };
    shifts = [{ open: laEpoch(dateISO, usual[0]), close: laEpoch(dateISO, usual[1]) }];
    source = "usual";
  }
  if (!shifts.length) return { open: null, close: null, openNow: false, label: "Closed today", source };
  const open = new Date(shifts[0].open).toISOString();
  const close = new Date(shifts[shifts.length - 1].close).toISOString();
  const base = { open, close, source };
  const current = shifts.find((s) => now >= s.open && now < s.close);
  if (isToday) {
    if (current) return { ...base, openNow: true, label: `Open now · closes ${fmtTime(current.close)}` };
    const next = shifts.find((s) => s.open > now);
    if (next) return { ...base, openNow: false, label: `Closed · opens ${fmtTime(next.open)}` };
    // already closed for the day: say when it opens tomorrow (usual hours)
    const [y, m, d] = dateISO.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const usual = USUAL_HOURS[hall]?.[dayOfWeek(tomorrow)];
    return { ...base, openNow: false, label: usual ? `Closed · opens ${fmtTime(laEpoch(tomorrow, usual[0]))} tomorrow` : "Closed today" };
  }
  // a day that has not started yet is closed right now; a past day is not worth a label
  if (dateISO > laDate(now)) return { ...base, openNow: false, label: `Closed · opens ${fmtTime(shifts[0].open)}` };
  return { ...base, openNow: false, label: "Hours unavailable" };
}

// ---------- which meal is on ----------

// The site does not publish per-meal times. These are estimates (minutes from midnight).
export const MEAL_WINDOWS: Record<MealId, { start: number; end: number }> = {
  breakfast: { start: H(7), end: H(10, 30) },
  brunch: { start: H(8, 30), end: H(15) },
  lunch: { start: H(11), end: H(15) },
  dinner: { start: H(16, 30), end: H(22) },
};

/** The meal being served now, else the next one today, else the last one. Another day: the first meal. */
export function currentMealFor(meals: MenuMeal[], now: number, dateISO: string): MealId | null {
  if (!meals.length) return null;
  if (dateISO !== laDate(now)) return meals[0].id;
  const m = laMinutes(now);
  const on = meals.find((x) => m >= MEAL_WINDOWS[x.id].start && m < MEAL_WINDOWS[x.id].end);
  if (on) return on.id;
  const next = meals.find((x) => MEAL_WINDOWS[x.id].start > m);
  return (next ?? meals[meals.length - 1]).id;
}

// ---------- demo menu ----------

// A dish is "Name;tags;allergens". Tags: V vegan, G vegetarian, F gluten-free, H halal.
// The first two dishes of every station are always on the menu, so every day has pasta, vegan,
// vegetarian, gluten-free and halal food. The rest rotate with the day of the week.
interface DemoStation { name: string; subtitle?: string; dishes: string[] }
interface DemoHall { morning: DemoStation[]; main: DemoStation[] }

const DEMO: Record<HallId, DemoHall> = {
  evk: {
    morning: [
      { name: "Hot Line", dishes: ["MADE TO ORDER OMELETTES UNTIL 1PM;;", "Scrambled Eggs;GFH;eggs", "Homestyle Waffles;G;dairy,eggs,soy,gluten", "Turkey Sausage Links;FH;", "Breakfast Potatoes;VF;", "Vegan Tofu Scramble;VF;soy", "Buttermilk Pancakes;G;dairy,eggs,gluten", "Crispy Bacon;F;pork", "Oatmeal with Brown Sugar;V;gluten"] },
      { name: "Fresh from the Farm", dishes: ["Seasonal Fruit Salad;VF;", "Greek Yogurt Parfait;GF;dairy", "Overnight Oats with Berries;V;gluten", "Avocado Toast;V;gluten", "Mini Bagels with Cream Cheese;G;gluten,dairy", "Chia Pudding;VF;", "Hard Boiled Eggs;GFH;eggs", "Granola Bar;V;gluten,tree-nuts"] },
    ],
    main: [
      { name: "Hot Line", dishes: ["Herb Roasted Chicken;FH;", "Roasted Vegetable Medley;VF;", "Beef Meatballs;H;gluten,eggs,dairy", "Baked Salmon with Dill;F;fish", "Garlic Mashed Potatoes;GF;dairy", "Chicken Tikka Masala;FH;dairy", "Mac and Cheese;G;gluten,dairy", "Steamed Jasmine Rice;VF;", "BBQ Pulled Pork;F;pork", "Braised Green Beans;VF;"] },
      { name: "Fresh from the Farm", dishes: ["Garden Salad Bar;VF;", "Quinoa Tabbouleh;V;gluten", "Caesar Salad;G;dairy,eggs,fish,gluten", "Roasted Beet and Citrus Salad;VF;", "Hummus and Pita;V;gluten,sesame", "Greek Salad;GF;dairy", "Cucumber Mint Salad;VF;", "Chickpea Salad;VF;", "Fresh Fruit;VF;"] },
      { name: "Pizza and Pasta", dishes: ["Penne Arrabbiata;V;gluten", "Margherita Flatbread;G;gluten,dairy", "Fettuccine Alfredo;G;gluten,dairy,eggs", "Pepperoni Pizza;;gluten,dairy,pork", "Spaghetti with Meat Sauce;H;gluten", "Vegan Cheese Pizza;V;gluten,soy", "Garlic Breadsticks;G;gluten,dairy", "Pesto Rotini;G;gluten,dairy,tree-nuts", "Gluten-Free Penne;VF;"] },
    ],
  },
  parkside: {
    morning: [
      { name: "Americana", dishes: ["Scrambled Eggs;GFH;eggs", "Breakfast Burrito;H;gluten,eggs,dairy", "Hash Browns;VF;", "Turkey Bacon;FH;", "French Toast;G;gluten,eggs,dairy", "Vegan Breakfast Sausage;V;soy,gluten", "Fluffy Pancakes;G;gluten,eggs,dairy", "Sauteed Spinach;VF;"] },
      { name: "Bistro", dishes: ["Greek Yogurt with Honey;GF;dairy", "Fresh Fruit Cups;VF;", "Steel Cut Oats;V;gluten", "Almond Butter Toast;V;gluten,tree-nuts", "Plain Bagels;V;gluten", "Cottage Cheese;GF;dairy", "Banana Walnut Muffins;G;gluten,eggs,dairy,tree-nuts", "Smoked Salmon Bagel;;fish,gluten"] },
    ],
    main: [
      { name: "Americana", dishes: ["Grilled Chicken Sandwich;H;gluten", "Sweet Potato Fries;VF;", "Cheeseburger;;gluten,dairy", "Crispy Chicken Tenders;H;gluten,eggs", "Black Bean Burger;V;gluten,soy", "Roasted Corn on the Cob;VF;", "Mac and Cheese;G;gluten,dairy", "Coleslaw;GF;eggs", "Hot Dogs;;gluten,pork"] },
      { name: "Eurasia", dishes: ["Chicken Teriyaki;H;soy,gluten", "Vegetable Lo Mein;V;gluten,soy,sesame", "Steamed White Rice;VF;", "Beef and Broccoli;H;soy,gluten", "Tofu Banh Mi Bowl;V;soy,gluten", "Vegetable Spring Rolls;V;gluten,soy", "Chicken Shawarma Plate;FH;", "Sesame Green Beans;VF;sesame"] },
      { name: "Bistro", dishes: ["Pesto Penne;G;gluten,dairy,tree-nuts", "Lemon Herb Salmon;F;fish", "Chicken Parmesan;H;gluten,dairy,eggs", "Marinara Spaghetti;V;gluten", "Roasted Garlic Broccoli;VF;", "Eggplant Rollatini;G;gluten,dairy,eggs", "Herb Roasted Potatoes;VF;", "Lentil Soup;VF;"] },
      { name: "Pizza/Salad Bar", dishes: ["Cheese Pizza;G;gluten,dairy", "Mediterranean Chickpea Salad;VF;", "Veggie Supreme Pizza;G;gluten,dairy", "Mixed Greens Bar;VF;", "Chicken Caesar Salad;;dairy,eggs,fish,gluten", "Vegan Pesto Pizza;V;gluten,tree-nuts", "Tomato Cucumber Salad;VF;", "Antipasto Salad;F;dairy,pork"] },
    ],
  },
  village: {
    morning: [
      { name: "Grill", dishes: ["Scrambled Eggs;GFH;eggs", "Hash Brown Patties;VF;", "Chicken Apple Sausage;FH;", "Breakfast Quesadilla;G;gluten,dairy,eggs", "Tofu Veggie Scramble;VF;soy", "Pork Breakfast Sausage;F;pork", "Blueberry Pancakes;G;gluten,eggs,dairy", "Roasted Tomatoes;VF;"] },
      { name: "Sweets and Treats", dishes: ["Fresh Fruit Bowl;VF;", "Vegan Banana Bread;V;gluten", "Butter Croissants;G;gluten,dairy,eggs", "Cinnamon Rolls;G;gluten,dairy,eggs", "Coconut Yogurt;VF;", "Blueberry Muffins;G;gluten,dairy,eggs", "Oat Raisin Cookies;V;gluten", "Apple Turnovers;G;gluten,dairy"] },
    ],
    main: [
      { name: "Grill", dishes: ["Grilled Chicken Breast;FH;", "Grilled Portobello Mushrooms;VF;", "Classic Cheeseburger;;gluten,dairy", "Halal Beef Burger;H;gluten", "Grilled Veggie Skewers;VF;", "Garlic Fries;V;", "Turkey Burger;;gluten,eggs", "Bratwurst;;gluten,pork", "Grilled Corn;VF;"] },
      { name: "Expo", dishes: ["Spaghetti Marinara;V;gluten", "Herb Rice Pilaf;V;gluten", "Chicken Alfredo Penne;H;gluten,dairy", "Beef Stew;F;", "Vegetable Paella;VF;", "Baked Ziti;G;gluten,dairy", "Seared Cod with Lemon;F;fish", "Roasted Carrots;VF;", "Chicken Fried Rice;H;soy,eggs,sesame"] },
      { name: "Flexitarian", dishes: ["Lentil Stew;VF;", "Tofu Stir Fry;V;soy,sesame", "Chickpea Curry;VF;", "Falafel Wrap;V;gluten,sesame", "Quinoa Power Bowl;VF;", "Veggie Enchiladas;G;gluten,dairy", "Roasted Cauliflower Steaks;VF;", "Sweet Potato Tacos;V;gluten", "Mushroom Risotto;GF;dairy"] },
      { name: "Salad Bar", dishes: ["Build Your Own Salad;VF;", "Roasted Chickpeas;VF;", "Chopped Greek Salad;GF;dairy", "Kale Caesar Salad;G;dairy,eggs,fish,gluten", "Soup of the Day;V;", "Pasta Salad;V;gluten", "Grilled Chicken Strips;FH;", "Fruit and Berry Bowl;VF;"] },
    ],
  },
};

function parseDish(s: string): MenuItem {
  const [name, tags = "", allergens = ""] = s.split(";");
  const t: DietTag[] = [];
  if (tags.includes("V")) t.push("vegan");
  if (tags.includes("V") || tags.includes("G")) t.push("vegetarian");
  if (tags.includes("F")) t.push("gluten-free");
  if (tags.includes("H")) t.push("halal");
  const a = allergens ? allergens.split(",").map((x) => x.replace(/-/g, " ")) : [];
  return { name, tags: t, allergens: a, note: !tags && !allergens && name === name.toUpperCase() };
}

function demoStation(st: DemoStation, seed: number): MenuStation {
  const count = Math.min(st.dishes.length, 5 + (seed % 4));
  const pinned = st.dishes.slice(0, 2);
  const rest = st.dishes.slice(2);
  const start = seed % rest.length;
  const rotated = [...rest.slice(start), ...rest.slice(0, start)].slice(0, count - 2);
  return { name: st.name, ...(st.subtitle ? { subtitle: st.subtitle } : {}), items: [...pinned, ...rotated].map(parseDish) };
}

/** A believable made-up menu. Same hall and date always give the same dishes. */
export function demoMenu(hall: HallId, dateISO: string): MenuMeal[] {
  const d = DEMO[hall];
  const dow = dayOfWeek(dateISO);
  const weekend = dow === 0 || dow === 6;
  const build = (id: MealId, name: string, stations: DemoStation[], mealIdx: number): MenuMeal => ({
    id, name, stations: stations.map((s, i) => demoStation(s, dow * 5 + i * 3 + mealIdx * 7)),
  });
  return weekend
    ? [build("brunch", "Brunch", [...d.morning, d.main[0]], 1), build("dinner", "Dinner", d.main, 3)]
    : [build("breakfast", "Breakfast", d.morning, 0), build("lunch", "Lunch", d.main.slice(0, 3), 2), build("dinner", "Dinner", d.main, 3)];
}
