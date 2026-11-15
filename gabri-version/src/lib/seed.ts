/**
 * DEMO DATA. Everything is generated relative to"now" so the map always looks live
 * during a demo. Orgs, people and events are fictional.
 */
import { INTERSECTIONS } from "./campus";
import type { CampusEvent, ClassMeeting, InboxItem, Notification, Org, SafetyAlert, SchoolId, User } from "./types";

const MIN = 60_000;

function roundTo10(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(Math.round(x.getMinutes() / 10) * 10);
  return x;
}
const inMin = (now: Date, m: number) => roundTo10(new Date(now.getTime() + m * MIN));
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function dayAt(now: Date, addDays: number, h: number, m = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d;
}

export const ME = "u_me";

// [id, username, name, school, year, major, their friends (for "mutual friends")]
const STUDENTS: [string, string, string, SchoolId, string, string, string[]][] = [
  ["u_ryan", "ryanpatel", "Ryan Patel", "viterbi", "Sophomore", "Computer Science", ["u_ethan", "u_kai"]],
  ["u_ava", "ava.thompson", "Ava Thompson", "dornsife", "Sophomore", "Psychology", ["u_maya", "u_sofia"]],
  ["u_diego", "diegoram", "Diego Ramirez", "viterbi", "Senior", "Mechanical Engineering", ["u_jordan"]],
  ["u_hannah", "hannahkim", "Hannah Kim", "thornton", "Junior", "Music Industry", ["u_maya"]],
  ["u_omar", "omar.h", "Omar Haddad", "marshall", "Freshman", "Business Administration", ["u_priya", "u_leah"]],
  ["u_zoe", "zoewilliams", "Zoe Williams", "roski", "Junior", "Fine Arts", []],
  ["u_marcus", "marcusj", "Marcus Johnson", "annenberg", "Senior", "Communication", ["u_sofia"]],
  ["u_nina", "ninaliu", "Nina Liu", "viterbi", "Junior", "Computer Science", ["u_ethan", "u_ryan"]],
];

export function seedUsers(now: Date): User[] {
  const today = now.getDay();
  // Demo trick: CSCI 104 always starts ~95 min from now"today", so the assistant has a real gap to plan.
  const c104Start = inMin(now, 95);
  const c104End = new Date(c104Start.getTime() + 110 * MIN);
  const ohStart = inMin(now, -20);
  const ohEnd = new Date(ohStart.getTime() + 120 * MIN);

  const myClasses: ClassMeeting[] = [
    {
      code: "CSCI 104", title: "Data Structures & Object-Oriented Design", buildingId: "sgm", room: "SGM 124",
      days: Array.from(new Set([1, 3, today])), start: hhmm(c104Start), end: hhmm(c104End),
      officeHours: { who: "TA Kevin L.", buildingId: "sal", room: "SAL 1st floor lab", days: [today, 2], start: hhmm(ohStart), end: hhmm(ohEnd) },
    },
    {
      code: "FBE 403", title: "Business Finance", buildingId: "jkp", room: "JKP 112", days: [2, 4], start: "12:00", end: "13:50",
      officeHours: { who: "Prof. Alvarez", buildingId: "jff", room: "JFF 330", days: [1], start: "15:00", end: "16:30" },
    },
    { code: "WRIT 340", title: "Advanced Writing", buildingId: "thh", room: "THH 215", days: [1, 3], start: "10:00", end: "11:20" },
    { code: "MATH 225", title: "Linear Algebra & Differential Equations", buildingId: "kap", room: "KAP 156", days: [2, 4], start: "09:00", end: "10:20" },
  ];

  return [
    {
      id: ME, username: "arivera", name: "Alex Rivera", avatar: "AR", school: "viterbi", year: "Junior", major: "Computer Science (Business minor)",
      friends: ["u_priya", "u_jordan", "u_maya", "u_ethan", "u_sofia"], classes: myClasses,
      interests: ["soccer", "startups", "boba", "AI", "jazz"], orgs: ["org_startup"],
    },
    { id: "u_priya", username: "priyashah", name: "Priya Shah", avatar: "PS", school: "marshall", year: "Junior", major: "Business Administration", friends: [ME], classes: [], interests: ["finance"], orgs: ["org_finance"] },
    { id: "u_jordan", username: "jordanlee", name: "Jordan Lee", avatar: "JL", school: "dornsife", year: "Sophomore", major: "Economics", friends: [ME], classes: [], interests: ["soccer"], orgs: [] },
    { id: "u_maya", username: "mayachen", name: "Maya Chen", avatar: "MC", school: "sca", year: "Senior", major: "Film & TV Production", friends: [ME], classes: [], interests: ["film"], orgs: [] },
    { id: "u_ethan", username: "ethan.brooks", name: "Ethan Brooks", avatar: "EB", school: "viterbi", year: "Junior", major: "Electrical Engineering", friends: [ME], classes: [], interests: ["poker"], orgs: [] },
    { id: "u_sofia", username: "sofiam", name: "Sofia Martinez", avatar: "SM", school: "annenberg", year: "Sophomore", major: "Journalism", friends: [ME], classes: [], interests: ["news"], orgs: ["org_dt"] },
    { id: "u_kai", username: "kai.codes", name: "Kai Nakamura", avatar: "KN", school: "viterbi", year: "Freshman", major: "CS Games", friends: ["u_ethan", "u_ryan"], classes: [], interests: [], orgs: [] },
    { id: "u_leah", username: "leahg", name: "Leah Goldberg", avatar: "LG", school: "marshall", year: "Senior", major: "Accounting", friends: ["u_priya"], classes: [], interests: [], orgs: [] },
    // other Trojans you can find by @username and add (some are already going to things today)
    ...STUDENTS.map(([id, username, name, school, year, major, friends]) => ({
      id, username, name, avatar: name.split(" ").map((w) => w[0]).join(""), school, year, major, friends, classes: [], interests: [], orgs: [],
    })),
  ];
}

export { ORGS } from "./orgs";
import { ORGS } from "./orgs";

const ok = { status: "approved" as const, reasons: [], riskScore: 0.02, checkedBy: "claude" as const };
const crowd = (n: number, prefix = "anon") => Array.from({ length: n }, (_, i) => `${prefix}_${i}`);

type Seed = Omit<CampusEvent, "id" |"createdAt" |"moderation" |"invitees" |"attendees" |"tags" |"schools" |"source"> &
  Partial<Pick<CampusEvent, "moderation" |"invitees" |"attendees" |"tags" |"schools" |"source">>;

export function seedEvents(now: Date): CampusEvent[] {
  const e = (s: Seed): Seed => s;
  const list: Seed[] = [
    e({ title: "Pickup soccer — need 4 more!", description: "Casual 7v7, all levels. Bring a light and dark shirt.", category: "sports_play", buildingId: "crm",
      start: inMin(now, 10).toISOString(), end: inMin(now, 100).toISOString(), host: { kind: "user", name: "Jordan Lee", id: "u_jordan" },
      visibility: "open", capacity: 18, freeFood: false, attendees: ["u_jordan", "u_sofia", "u_diego", ...crowd(8)], tags: ["pickup", "outdoor"], expectedTurnout: 16 }),
    e({ title: "Pickup basketball (half court)", description: "Running 3s on courts 2-3. Winners stay.", category: "sports_play", buildingId: "lrc",
      start: inMin(now, 20).toISOString(), end: inMin(now, 110).toISOString(), host: { kind: "user", name: "Kai Nakamura", id: "u_kai" },
      visibility: "open", capacity: 12, freeFood: false, attendees: ["u_kai", ...crowd(5)], tags: ["pickup"], expectedTurnout: 10 }),
    e({ title: "FBE 403 midterm study session", description: "Going through practice midterm #2 and the WACC problems. Bringing Insomnia cookies for everyone.", category: "academic", buildingId: "jff", room: "JFF 102",
      start: inMin(now, 60).toISOString(), end: inMin(now, 180).toISOString(), host: { kind: "user", name: "Priya Shah", id: "u_priya" },
      visibility: "open", schools: ["marshall"], course: "FBE 403", capacity: 20, freeFood: true, foodDetail: "Insomnia cookies", attendees: ["u_priya", "u_leah", ...crowd(6)], tags: ["midterm"], expectedTurnout: 12 }),
    e({ title: "CSCI 104 TA review: heaps & hash tables", description: "Official TA-led review before HW5. Slides posted after.", category: "academic", buildingId: "sal", room: "SAL 101",
      start: inMin(now, 300).toISOString(), end: inMin(now, 400).toISOString(), host: { kind: "usc", name: "CSCI 104 Course Staff" },
      visibility: "open", schools: ["viterbi"], course: "CSCI 104", capacity: 80, freeFood: false, attendees: crowd(34), tags: ["review", "official"], expectedTurnout: 60 }),
    e({ title: "Startup Pitch Night", description: "6 student founders pitch to VCs. Free pizza and networking after.", category: "student", buildingId: "rth", room: "RTH 526",
      start: inMin(now, -30).toISOString(), end: inMin(now, 120).toISOString(), host: { kind: "org", name: "Viterbi Startup Garage", id: "org_startup" },
      visibility: "public", schools: ["viterbi"], capacity: 120, freeFood: true, foodDetail: "Free pizza", attendees: ["u_ethan", "u_ryan", "u_nina", "u_omar", ...crowd(68)], tags: ["startups", "networking"], expectedTurnout: 90 }),
    e({ title: "Boba study break", description: "Free boba (first 150) + lo-fi + coloring. Come destress before midterms!", category: "student", buildingId: "tcc", room: "TCC 2nd floor lounge",
      start: inMin(now, 40).toISOString(), end: inMin(now, 100).toISOString(), host: { kind: "org", name: "Trojan Boba Society", id: "org_boba" },
      visibility: "public", capacity: 150, freeFood: true, foodDetail: "Free boba (first 150)", attendees: ["u_maya", "u_ava", "u_hannah", ...crowd(56)], tags: ["destress"], expectedTurnout: 150 }),
    e({ title: "Resume reviews: Tech & Finance", description: "Drop-in 10-minute resume reviews with recruiters and Career Center advisors. Coffee + bagels.", category: "career", buildingId: "tcc", room: "TCC 450",
      start: inMin(now, 120).toISOString(), end: inMin(now, 240).toISOString(), host: { kind: "usc", name: "USC Career Center" }, link: { url: "https://usc.joinhandshake.com/", label: "Register on Handshake" },
      visibility: "public", capacity: 100, freeFood: true, foodDetail: "Coffee + bagels", attendees: crowd(41), tags: ["resume", "internships"], expectedTurnout: 70 }),
    e({ title: "AI@USC Hackathon", description: "24h build sprint. Free meals for registered hackers.", category: "student", buildingId: "gin",
      start: inMin(now, -180).toISOString(), end: dayAt(now, 1, 11).toISOString(), host: { kind: "org", name: "HackSC" },
      visibility: "public", capacity: 400, freeFood: true, foodDetail: "Meals for registered hackers", attendees: crowd(310), tags: ["hackathon", "AI"], expectedTurnout: 350 }),
    e({ title: "Sunset yoga on the Quad", description: "Bring a mat or towel. All levels.", category: "sports_play", buildingId: "mcq",
      start: inMin(now, 80).toISOString(), end: inMin(now, 140).toISOString(), host: { kind: "org", name: "Recreational Sports" },
      visibility: "public", capacity: 60, freeFood: false, attendees: crowd(22), tags: ["wellness"], expectedTurnout: 35 }),
    e({ title: "Thornton Jazz Night", description: "Student combos play standards + originals. Free entry.", category: "usc", buildingId: "bov",
      start: inMin(now, 360).toISOString(), end: inMin(now, 480).toISOString(), host: { kind: "usc", name: "USC Thornton School of Music" },
      visibility: "public", schools: ["thornton", "all"], capacity: 900, freeFood: false, attendees: crowd(212), tags: ["music"], expectedTurnout: 400 }),
    e({ title: "Late-night silent study (free coffee 10pm)", description: "Reserved floor, phones away, coffee cart at 10pm.", category: "academic", buildingId: "lvl", room: "Lower level",
      start: inMin(now, 420).toISOString(), end: inMin(now, 660).toISOString(), host: { kind: "org", name: "USC Libraries" },
      visibility: "public", capacity: 200, freeFood: true, foodDetail: "Free coffee at 10pm", attendees: crowd(48), tags: ["finals-mode"], expectedTurnout: 120 }),
    e({ title: "Maya's birthday dinner", description: "Dinner at the Village then dessert. Just the crew!", category: "student", buildingId: "vil",
      start: inMin(now, 240).toISOString(), end: inMin(now, 360).toISOString(), host: { kind: "user", name: "Maya Chen", id: "u_maya" },
      visibility: "invite", invitees: [ME, "u_priya", "u_jordan", "u_sofia"], capacity: 10, freeFood: false, attendees: ["u_maya", "u_priya"], tags: ["friends"] }),
    e({ title: "Ethan's poker night", description: "Low stakes, snacks provided.", category: "student", buildingId: "pks",
      start: inMin(now, 300).toISOString(), end: inMin(now, 480).toISOString(), host: { kind: "user", name: "Ethan Brooks", id: "u_ethan" },
      visibility: "invite", invitees: ["u_kai", "u_leah"], capacity: 8, freeFood: false, attendees: ["u_ethan"], tags: [] }),
    e({ title: "Women's Volleyball vs. UCLA", description: "Rivalry match! Students free with ID. First 500 get a rally towel.", category: "sports_watch", buildingId: "gal",
      start: dayAt(now, 1, 19).toISOString(), end: dayAt(now, 1, 21).toISOString(), host: { kind: "usc", name: "USC Athletics" }, link: { url: "https://usctrojans.com/", label: "Get tickets" },
      visibility: "public", capacity: 1500, freeFood: false, attendees: crowd(640), tags: ["athletics", "rivalry"], expectedTurnout: 1200 }),
    e({ title: "Student film showcase", description: "Screening of this semester's 310 projects, Q&A with directors.", category: "student", buildingId: "sci", room: "SCI 108 (Norris Theatre)",
      start: dayAt(now, 1, 18).toISOString(), end: dayAt(now, 1, 20, 30).toISOString(), host: { kind: "user", name: "Maya Chen", id: "u_maya" },
      visibility: "school", schools: ["sca"], capacity: 200, freeFood: true, foodDetail: "Popcorn + drinks", attendees: crowd(77), tags: ["film"], expectedTurnout: 150 }),
    e({ title: "Coffee chats with IB analysts", description: "Small-group chats with recent grads now in banking. Business casual.", category: "career", buildingId: "jff", room: "JFF 236",
      start: dayAt(now, 1, 15).toISOString(), end: dayAt(now, 1, 17).toISOString(), host: { kind: "org", name: "Marshall Finance & Investing Club", id: "org_finance" },
      visibility: "school", schools: ["marshall"], capacity: 40, freeFood: true, foodDetail: "Coffee + pastries", attendees: ["u_priya", ...crowd(29)], tags: ["finance", "recruiting"], expectedTurnout: 35 }),
    e({ title: "USG Town Hall: campus safety & dining", description: "Tell USG what to fix. Chipotle for the first 100 attendees.", category: "usc", buildingId: "tcc", room: "TCC 227",
      start: dayAt(now, 2, 18).toISOString(), end: dayAt(now, 2, 19, 30).toISOString(), host: { kind: "org", name: "Undergraduate Student Government", id: "org_usg" },
      visibility: "public", capacity: 250, freeFood: true, foodDetail: "Chipotle (first 100)", attendees: crowd(88), tags: ["usg", "town-hall"], expectedTurnout: 150 }),
    e({ title: "Newsroom open house", description: "Meet the editors, pitch a story, free merch.", category: "student", buildingId: "ann", room: "ANN Media Center",
      start: dayAt(now, 2, 17).toISOString(), end: dayAt(now, 2, 19).toISOString(), host: { kind: "org", name: "Student Newsroom Collective", id: "org_dt" },
      visibility: "public", schools: ["annenberg", "all"], capacity: 80, freeFood: false, attendees: ["u_sofia", ...crowd(19)], tags: ["journalism"], expectedTurnout: 40 }),
    e({ title: "WRIT 340 peer review swap", description: "Bring a draft of the persuasive essay, we'll swap and mark up.", category: "academic", buildingId: "dml", room: "Doheny 2nd floor",
      start: dayAt(now, 1, 15).toISOString(), end: dayAt(now, 1, 16, 30).toISOString(), host: { kind: "user", name: "Sofia Martinez", id: "u_sofia" },
      visibility: "open", course: "WRIT 340", capacity: 8, freeFood: false, attendees: ["u_sofia", ...crowd(2)], tags: [], expectedTurnout: 6 }),
    e({ title: "Startup Garage weekly build night", description: "Bring your side project. Mentors floating around.", category: "student", buildingId: "rth", room: "RTH 115",
      start: dayAt(now, 3, 19).toISOString(), end: dayAt(now, 3, 22).toISOString(), host: { kind: "org", name: "Viterbi Startup Garage", id: "org_startup" },
      visibility: "public", schools: ["viterbi"], capacity: 60, freeFood: true, foodDetail: "Snacks + Red Bull", attendees: crowd(23), tags: ["build"], expectedTurnout: 40 }),
    e({ title: "Boba & board games", description: "Monthly social, all welcome.", category: "student", buildingId: "vil",
      start: dayAt(now, -6, 19).toISOString(), end: dayAt(now, -6, 21).toISOString(), host: { kind: "org", name: "Trojan Boba Society", id: "org_boba" },
      visibility: "public", capacity: 120, freeFood: true, foodDetail: "Free boba", attendees: crowd(96), tags: [], expectedTurnout: 80 }),
    // Live games (scores simulated from the start time, see lib/games.ts)
    e({ title: "First Fridays at the Natural History Museum", description: "Live DJs, talks and late-night galleries next to campus. Student discount with ID.", category: "community", buildingId: "osm_natural_history_museum_of_lo",
      start: inMin(now, 150).toISOString(), end: inMin(now, 330).toISOString(), host: { kind: "external", name: "Natural History Museum of LA" },
      link: { url: "https://nhm.org/", label: "Get tickets" },
      visibility: "public", capacity: 2000, freeFood: false, attendees: crowd(140), tags: ["music", "museum"], expectedTurnout: 600 }),
    e({ title: "Football: USC vs UCLA", description: "Rivalry game at the Coliseum. Student section opens 90 min before kickoff.", category: "sports_watch", buildingId: "col",
      start: inMin(now, -110).toISOString(), end: inMin(now, 90).toISOString(), host: { kind: "usc", name: "USC Athletics" }, link: { url: "https://usctrojans.com/", label: "Get tickets" },
      visibility: "public", capacity: 77500, freeFood: false, attendees: crowd(3200), tags: ["athletics", "rivalry", "live-game"], expectedTurnout: 3000,
      game: { sport: "football", home: "USC", away: "UCLA", homeRate: 0.3, awayRate: 0.22 } }),
    e({ title: "Men's Basketball: USC vs Oregon", description: "Conference game at Galen Center.", category: "sports_watch", buildingId: "gal",
      start: inMin(now, -60).toISOString(), end: inMin(now, 30).toISOString(), host: { kind: "usc", name: "USC Athletics" }, link: { url: "https://usctrojans.com/", label: "Get tickets" },
      visibility: "public", capacity: 10258, freeFood: false, attendees: crowd(820), tags: ["athletics", "live-game"], expectedTurnout: 900,
      game: { sport: "basketball", home: "USC", away: "ORE", homeRate: 1.75, awayRate: 1.65 } }),
    // Moderation queue examples (never shown on the public map)
    e({ title: "FREE AIRPODS for USC students!!! claim now", description: "Just DM @trojan_giveawayz and send your USC login to verify you're a student", category: "student", buildingId: "tommy",
      start: inMin(now, 60).toISOString(), end: inMin(now, 120).toISOString(), host: { kind: "user", name: "trojan_giveawayz" },
      visibility: "public", freeFood: false, attendees: [], tags: [], source: "user",
      moderation: { status: "rejected", reasons: ["Asks for USC credentials (phishing)", "Too-good-to-be-true giveaway"], riskScore: 0.97, checkedBy: "claude" } }),
    e({ title: "Doheny rooftop afterparty", description: "Sneak up through the service stairs, bring your own drinks", category: "student", buildingId: "dml",
      start: inMin(now, 600).toISOString(), end: inMin(now, 780).toISOString(), host: { kind: "user", name: "anonymous" },
      visibility: "public", freeFood: false, attendees: [], tags: [], source: "user",
      moderation: { status: "flagged", reasons: ["Encourages entering a restricted area", "Unsafe: rooftop access + alcohol"], riskScore: 0.81, checkedBy: "claude" } }),
  ];

  return list.map((s, i) => ({
    id: `ev_${String(i + 1).padStart(3, "0")}`,
    invitees: [],
    attendees: [],
    tags: [],
    schools: ["all"],
    source: "seed",
    moderation: ok,
    createdAt: new Date(now.getTime() - (i + 1) * 37 * MIN).toISOString(),
    ...s,
  }));
}

/** Events the demo student went to in the past few weeks (shown under "Past" on their profile). */
export function seedHistory(now: Date): CampusEvent[] {
  const past: (Seed & { daysAgo: number; h: number; m?: number; durMin: number })[] = [
    { daysAgo: 2, h: 18, durMin: 120, title: "Startup Garage weekly build night", description: "Heads-down build session with mentors and pizza.", category: "student", buildingId: "rth", room: "RTH 526",
      start: "", end: "", host: { kind: "org", name: "Viterbi Startup Garage", id: "org_startup" }, visibility: "public", freeFood: true, foodDetail: "Pizza", attendees: crowd(34, "h1") },
    { daysAgo: 4, h: 17, durMin: 90, title: "CSCI 104 TA review: linked lists & recursion", description: "TA-led review before HW4.", category: "academic", buildingId: "sal", room: "SAL 101",
      start: "", end: "", host: { kind: "usc", name: "CSCI 104 course staff" }, visibility: "school", schools: ["viterbi"], course: "CSCI 104", freeFood: false, attendees: crowd(48, "h2") },
    { daysAgo: 6, h: 12, durMin: 240, title: "Fall Career Fair: Tech & Engineering", description: "120+ employers hiring for internships and full-time.", category: "career", buildingId: "gal",
      start: "", end: "", host: { kind: "org", name: "Career Center", id: "org_career" }, visibility: "public", freeFood: false, attendees: crowd(410, "h3") },
    { daysAgo: 9, h: 20, durMin: 120, title: "Boba & board games", description: "Catan, Codenames and 40+ other games.", category: "student", buildingId: "tcc",
      start: "", end: "", host: { kind: "org", name: "Trojan Boba Society", id: "org_boba" }, visibility: "public", freeFood: true, foodDetail: "Free boba", attendees: crowd(57, "h4") },
    { daysAgo: 13, h: 7, m: 30, durMin: 60, title: "Sunrise run club: 5K around Expo Park", description: "Easy pace, coffee after.", category: "sports_play", buildingId: "tommy",
      start: "", end: "", host: { kind: "user", name: "Jordan Lee", id: "u_jordan" }, visibility: "open", freeFood: false, attendees: ["u_jordan", ...crowd(14, "h5")] },
  ];
  return past.map(({ daysAgo, h, m, durMin, ...s }, i) => {
    const start = dayAt(now, -daysAgo, h, m ?? 0);
    return {
      id: `hist_${String(i + 1).padStart(3, "0")}`,
      invitees: [],
      tags: [],
      schools: ["all"],
      source: "seed",
      moderation: ok,
      createdAt: new Date(start.getTime() - 5 * 24 * 60 * MIN).toISOString(),
      ...s,
      start: start.toISOString(),
      end: new Date(start.getTime() + durMin * MIN).toISOString(),
      attendees: [...(s.attendees ?? []), ME],
    };
  });
}

export function seedInbox(now: Date): InboxItem[] {
  const ago = (m: number) => new Date(now.getTime() - m * MIN).toISOString();
  return [
    { id: "in_1", source: "brightspace", from: "CSCI 104 (Brightspace)", receivedAt: ago(45),
      subject: "Homework 5: Linked Lists & Iterators released",
      body: "HW5 is now available on Brightspace. It is due Sunday at 11:59 PM. Remember the TA review session tonight in SAL 101 covers heaps and hash tables." },
    { id: "in_2", source: "brightspace", from: "FBE 403 (Brightspace)", receivedAt: ago(130),
      subject: "Midterm moved + review session",
      body: "Heads up: the midterm is moved to next Wednesday in class. Optional review session Tuesday 6-7:30pm in JKP 202. Bring a financial calculator." },
    { id: "in_3", source: "gmail", from: "Sofia Martinez", receivedAt: ago(200),
      subject: "WRIT 340 study sesh tmrw? ",
      body: "hey!! doing a peer review swap for the persuasive essay tomorrow at 3 at Doheny 2nd floor, wanna come? bring your draft" },
    { id: "in_4", source: "gmail", from: "Trojan Boba Society", receivedAt: ago(320),
      subject: "This week: free donuts + boba",
      body: "Hi Trojans! Monday 9am we're giving out free Krispy Kreme donuts at Tommy Trojan (while supplies last). Also don't miss our boba study break today at TCC!" },
    { id: "in_5", source: "gmail", from: "IT-Support <helpdesk@usc-verify-account.co>", receivedAt: ago(400),
      subject: "URGENT: your USC account will be suspended",
      body: "Your account has unusual activity. Verify your password within 24 hours at the link below or lose access." },
    { id: "in_6", source: "gcal", from: "Maya Chen", receivedAt: ago(500),
      subject: "Invitation: Maya's birthday dinner",
      body: "Maya Chen invited you to 'Maya's birthday dinner' at USC Village, today. RSVP yes/no/maybe." },
    { id: "in_8", source: "gmail", from: "USC Department of Public Safety", receivedAt: ago(6),
      subject: "Trojans Alert: Robbery near Vermont Ave & Jefferson Blvd",
      body: "DPS is investigating a robbery reported at 2:40 PM near Vermont Ave and Jefferson Blvd. The suspect fled northbound. Avoid the area and walk with others. Call DPS at 213-740-4321 for an escort." },
    { id: "in_7", source: "gmail", from: "Career Center", receivedAt: ago(700),
      subject: "Engineering Career Fair next Wednesday",
      body: "120+ employers at the Galen Center next Wednesday 11am-4pm. Upload your resume to the career portal first. Free professional headshots at the entrance." },
  ];
}

export function seedAlerts(now: Date): SafetyAlert[] {
  const at = (id: string) => INTERSECTIONS.find((i) => i.id === id)!;
  const ago = (m: number) => new Date(now.getTime() - m * MIN).toISOString();
  const inn = (m: number) => new Date(now.getTime() + m * MIN).toISOString();
  return [
    { id: "al_1", kind: "suspicious", severity: "medium", title: "Suspicious activity reported", advice: "Avoid Figueroa & 37th", locationText: at("fig_37th").name,
      lat: at("fig_37th").lat, lng: at("fig_37th").lng, radiusM: 90, createdAt: ago(2), expiresAt: inn(88), source: "dps", resolved: false },
    { id: "al_2", kind: "crime", severity: "low", title: "Bike theft reported", advice: "Lock bikes with a U-lock near Leavey", locationText: "Leavey Library bike racks",
      lat: 34.02205, lng: -118.28262, radiusM: 50, createdAt: ago(41), expiresAt: inn(49), source: "dps", resolved: false },
  ];
}

export function seedNotifications(now: Date): Notification[] {
  const ago = (m: number) => new Date(now.getTime() - m * MIN).toISOString();
  return [
    { id: "n_1", kind: "friend", title: "Jordan started a pickup soccer game", body: "Cromwell Field · starts in 10 min · needs 4 more", createdAt: ago(3), read: false, eventId: "ev_001", source: "live" },
    { id: "n_2", kind: "food", title: "Free pizza right now", body: "Startup Pitch Night · RTH 526 · 6 min walk", createdAt: ago(12), read: false, eventId: "ev_005", source: "live" },
  ];
}
