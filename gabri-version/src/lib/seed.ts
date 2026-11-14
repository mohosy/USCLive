/**
 * DEMO DATA. Everything is generated relative to"now" so the map always looks live
 * during a demo. Orgs, people and events are fictional.
 */
import type { CampusEvent, ClassMeeting, InboxItem, Notification, Org, User } from "./types";

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
      id: ME, name: "Alex Rivera", avatar: "AR", school: "viterbi", year: "Junior", major: "Computer Science (Business minor)",
      friends: ["u_priya", "u_jordan", "u_maya", "u_ethan", "u_sofia"], classes: myClasses,
      interests: ["soccer", "startups", "boba", "AI", "jazz"], orgs: ["org_startup"],
    },
    { id: "u_priya", name: "Priya Shah", avatar: "PS", school: "marshall", year: "Junior", major: "Business Administration", friends: [ME], classes: [], interests: ["finance"], orgs: ["org_finance"] },
    { id: "u_jordan", name: "Jordan Lee", avatar: "JL", school: "dornsife", year: "Sophomore", major: "Economics", friends: [ME], classes: [], interests: ["soccer"], orgs: [] },
    { id: "u_maya", name: "Maya Chen", avatar: "MC", school: "sca", year: "Senior", major: "Film & TV Production", friends: [ME], classes: [], interests: ["film"], orgs: [] },
    { id: "u_ethan", name: "Ethan Brooks", avatar: "EB", school: "viterbi", year: "Junior", major: "Electrical Engineering", friends: [ME], classes: [], interests: ["poker"], orgs: [] },
    { id: "u_sofia", name: "Sofia Martinez", avatar: "SM", school: "annenberg", year: "Sophomore", major: "Journalism", friends: [ME], classes: [], interests: ["news"], orgs: ["org_dt"] },
    { id: "u_kai", name: "Kai Nakamura", avatar: "KN", school: "viterbi", year: "Freshman", major: "CS Games", friends: [], classes: [], interests: [], orgs: [] },
    { id: "u_leah", name: "Leah Goldberg", avatar: "LG", school: "marshall", year: "Senior", major: "Accounting", friends: [], classes: [], interests: [], orgs: [] },
  ];
}

export const ORGS: Org[] = [
  { id: "org_usg", name: "Undergraduate Student Government", school: "all", kind: "usg", members: 60 },
  { id: "org_startup", name: "Viterbi Startup Garage", school: "viterbi", kind: "club", members: 140 },
  { id: "org_boba", name: "Trojan Boba Society", school: "all", kind: "club", members: 220 },
  { id: "org_finance", name: "Marshall Finance & Investing Club", school: "marshall", kind: "club", members: 180 },
  { id: "org_jazz", name: "Thornton Jazz Collective", school: "thornton", kind: "club", members: 45 },
  { id: "org_dt", name: "Student Newsroom Collective", school: "annenberg", kind: "club", members: 90 },
  { id: "org_career", name: "Career Center", school: "all", kind: "department", members: 0 },
];

const ok = { status: "approved" as const, reasons: [], riskScore: 0.02, checkedBy: "claude" as const };
const crowd = (n: number, prefix = "anon") => Array.from({ length: n }, (_, i) => `${prefix}_${i}`);

type Seed = Omit<CampusEvent, "id" |"createdAt" |"moderation" |"invitees" |"attendees" |"tags" |"schools" |"source"> &
  Partial<Pick<CampusEvent, "moderation" |"invitees" |"attendees" |"tags" |"schools" |"source">>;

export function seedEvents(now: Date): CampusEvent[] {
  const e = (s: Seed): Seed => s;
  const list: Seed[] = [
    e({ title: "Pickup soccer — need 4 more!", description: "Casual 7v7, all levels. Bring a light and dark shirt.", category: "sports", buildingId: "crm",
      start: inMin(now, 10).toISOString(), end: inMin(now, 100).toISOString(), host: { kind: "user", name: "Jordan Lee", id: "u_jordan" },
      visibility: "open", capacity: 18, freeFood: false, attendees: ["u_jordan", "u_sofia", ...crowd(9)], tags: ["pickup", "outdoor"], expectedTurnout: 16 }),
    e({ title: "Pickup basketball (half court)", description: "Running 3s on courts 2-3. Winners stay.", category: "sports", buildingId: "lrc",
      start: inMin(now, 20).toISOString(), end: inMin(now, 110).toISOString(), host: { kind: "user", name: "Kai Nakamura", id: "u_kai" },
      visibility: "open", capacity: 12, freeFood: false, attendees: ["u_kai", ...crowd(5)], tags: ["pickup"], expectedTurnout: 10 }),
    e({ title: "FBE 403 midterm study session", description: "Going through practice midterm #2 and the WACC problems. Bringing Insomnia cookies for everyone.", category: "study", buildingId: "jff", room: "JFF 102",
      start: inMin(now, 60).toISOString(), end: inMin(now, 180).toISOString(), host: { kind: "user", name: "Priya Shah", id: "u_priya" },
      visibility: "open", schools: ["marshall"], course: "FBE 403", capacity: 20, freeFood: true, foodDetail: "Insomnia cookies", attendees: ["u_priya", "u_leah", ...crowd(6)], tags: ["midterm"], expectedTurnout: 12 }),
    e({ title: "CSCI 104 TA review: heaps & hash tables", description: "Official TA-led review before HW5. Slides posted after.", category: "academic", buildingId: "sal", room: "SAL 101",
      start: inMin(now, 300).toISOString(), end: inMin(now, 400).toISOString(), host: { kind: "usc", name: "CSCI 104 Course Staff" },
      visibility: "open", schools: ["viterbi"], course: "CSCI 104", capacity: 80, freeFood: false, attendees: crowd(34), tags: ["review", "official"], expectedTurnout: 60 }),
    e({ title: "Startup Pitch Night", description: "6 student founders pitch to VCs. Free pizza and networking after.", category: "club", buildingId: "rth", room: "RTH 526",
      start: inMin(now, -30).toISOString(), end: inMin(now, 120).toISOString(), host: { kind: "org", name: "Viterbi Startup Garage", id: "org_startup" },
      visibility: "public", schools: ["viterbi"], capacity: 120, freeFood: true, foodDetail: "Free pizza", attendees: ["u_ethan", ...crowd(71)], tags: ["startups", "networking"], expectedTurnout: 90 }),
    e({ title: "Boba study break", description: "Free boba (first 150) + lo-fi + coloring. Come destress before midterms!", category: "social", buildingId: "tcc", room: "TCC 2nd floor lounge",
      start: inMin(now, 40).toISOString(), end: inMin(now, 100).toISOString(), host: { kind: "org", name: "Trojan Boba Society", id: "org_boba" },
      visibility: "public", capacity: 150, freeFood: true, foodDetail: "Free boba (first 150)", attendees: ["u_maya", ...crowd(58)], tags: ["destress"], expectedTurnout: 150 }),
    e({ title: "Resume reviews: Tech & Finance", description: "Drop-in 10-minute resume reviews with recruiters and Career Center advisors. Coffee + bagels.", category: "career", buildingId: "tcc", room: "TCC 450",
      start: inMin(now, 120).toISOString(), end: inMin(now, 240).toISOString(), host: { kind: "org", name: "Career Center", id: "org_career" },
      visibility: "public", capacity: 100, freeFood: true, foodDetail: "Coffee + bagels", attendees: crowd(41), tags: ["resume", "internships"], expectedTurnout: 70 }),
    e({ title: "AI@USC Hackathon", description: "24h build sprint. Free meals for registered hackers.", category: "academic", buildingId: "gin",
      start: inMin(now, -180).toISOString(), end: dayAt(now, 1, 11).toISOString(), host: { kind: "org", name: "HackSC" },
      visibility: "public", capacity: 400, freeFood: true, foodDetail: "Meals for registered hackers", attendees: crowd(310), tags: ["hackathon", "AI"], expectedTurnout: 350 }),
    e({ title: "Sunset yoga on the Quad", description: "Bring a mat or towel. All levels.", category: "sports", buildingId: "mcq",
      start: inMin(now, 80).toISOString(), end: inMin(now, 140).toISOString(), host: { kind: "org", name: "Recreational Sports" },
      visibility: "public", capacity: 60, freeFood: false, attendees: crowd(22), tags: ["wellness"], expectedTurnout: 35 }),
    e({ title: "Thornton Jazz Night", description: "Student combos play standards + originals. Free entry.", category: "arts", buildingId: "bov",
      start: inMin(now, 360).toISOString(), end: inMin(now, 480).toISOString(), host: { kind: "org", name: "Thornton Jazz Collective", id: "org_jazz" },
      visibility: "public", schools: ["thornton", "all"], capacity: 900, freeFood: false, attendees: crowd(212), tags: ["music"], expectedTurnout: 400 }),
    e({ title: "Late-night silent study (free coffee 10pm)", description: "Reserved floor, phones away, coffee cart at 10pm.", category: "study", buildingId: "lvl", room: "Lower level",
      start: inMin(now, 420).toISOString(), end: inMin(now, 660).toISOString(), host: { kind: "org", name: "USC Libraries" },
      visibility: "public", capacity: 200, freeFood: true, foodDetail: "Free coffee at 10pm", attendees: crowd(48), tags: ["finals-mode"], expectedTurnout: 120 }),
    e({ title: "Maya's birthday dinner", description: "Dinner at the Village then dessert. Just the crew!", category: "social", buildingId: "vil",
      start: inMin(now, 240).toISOString(), end: inMin(now, 360).toISOString(), host: { kind: "user", name: "Maya Chen", id: "u_maya" },
      visibility: "invite", invitees: [ME, "u_priya", "u_jordan", "u_sofia"], capacity: 10, freeFood: false, attendees: ["u_maya", "u_priya"], tags: ["friends"] }),
    e({ title: "Ethan's poker night", description: "Low stakes, snacks provided.", category: "social", buildingId: "pks",
      start: inMin(now, 300).toISOString(), end: inMin(now, 480).toISOString(), host: { kind: "user", name: "Ethan Brooks", id: "u_ethan" },
      visibility: "invite", invitees: ["u_kai", "u_leah"], capacity: 8, freeFood: false, attendees: ["u_ethan"], tags: [] }),
    e({ title: "Women's Volleyball vs. UCLA", description: "Rivalry match! Students free with ID. First 500 get a rally towel.", category: "sports", buildingId: "gal",
      start: dayAt(now, 1, 19).toISOString(), end: dayAt(now, 1, 21).toISOString(), host: { kind: "usc", name: "USC Athletics" },
      visibility: "public", capacity: 1500, freeFood: false, attendees: crowd(640), tags: ["athletics", "rivalry"], expectedTurnout: 1200 }),
    e({ title: "Student film showcase", description: "Screening of this semester's 310 projects, Q&A with directors.", category: "arts", buildingId: "sci", room: "SCI 108 (Norris Theatre)",
      start: dayAt(now, 1, 18).toISOString(), end: dayAt(now, 1, 20, 30).toISOString(), host: { kind: "user", name: "Maya Chen", id: "u_maya" },
      visibility: "school", schools: ["sca"], capacity: 200, freeFood: true, foodDetail: "Popcorn + drinks", attendees: crowd(77), tags: ["film"], expectedTurnout: 150 }),
    e({ title: "Coffee chats with IB analysts", description: "Small-group chats with recent grads now in banking. Business casual.", category: "career", buildingId: "jff", room: "JFF 236",
      start: dayAt(now, 1, 15).toISOString(), end: dayAt(now, 1, 17).toISOString(), host: { kind: "org", name: "Marshall Finance & Investing Club", id: "org_finance" },
      visibility: "school", schools: ["marshall"], capacity: 40, freeFood: true, foodDetail: "Coffee + pastries", attendees: ["u_priya", ...crowd(29)], tags: ["finance", "recruiting"], expectedTurnout: 35 }),
    e({ title: "USG Town Hall: campus safety & dining", description: "Tell USG what to fix. Chipotle for the first 100 attendees.", category: "club", buildingId: "tcc", room: "TCC 227",
      start: dayAt(now, 2, 18).toISOString(), end: dayAt(now, 2, 19, 30).toISOString(), host: { kind: "org", name: "Undergraduate Student Government", id: "org_usg" },
      visibility: "public", capacity: 250, freeFood: true, foodDetail: "Chipotle (first 100)", attendees: crowd(88), tags: ["usg", "town-hall"], expectedTurnout: 150 }),
    e({ title: "Newsroom open house", description: "Meet the editors, pitch a story, free merch.", category: "club", buildingId: "ann", room: "ANN Media Center",
      start: dayAt(now, 2, 17).toISOString(), end: dayAt(now, 2, 19).toISOString(), host: { kind: "org", name: "Student Newsroom Collective", id: "org_dt" },
      visibility: "public", schools: ["annenberg", "all"], capacity: 80, freeFood: false, attendees: ["u_sofia", ...crowd(19)], tags: ["journalism"], expectedTurnout: 40 }),
    e({ title: "WRIT 340 peer review swap", description: "Bring a draft of the persuasive essay, we'll swap and mark up.", category: "study", buildingId: "dml", room: "Doheny 2nd floor",
      start: dayAt(now, 1, 15).toISOString(), end: dayAt(now, 1, 16, 30).toISOString(), host: { kind: "user", name: "Sofia Martinez", id: "u_sofia" },
      visibility: "open", course: "WRIT 340", capacity: 8, freeFood: false, attendees: ["u_sofia", ...crowd(2)], tags: [], expectedTurnout: 6 }),
    e({ title: "Startup Garage weekly build night", description: "Bring your side project. Mentors floating around.", category: "club", buildingId: "rth", room: "RTH 115",
      start: dayAt(now, 3, 19).toISOString(), end: dayAt(now, 3, 22).toISOString(), host: { kind: "org", name: "Viterbi Startup Garage", id: "org_startup" },
      visibility: "public", schools: ["viterbi"], capacity: 60, freeFood: true, foodDetail: "Snacks + Red Bull", attendees: crowd(23), tags: ["build"], expectedTurnout: 40 }),
    e({ title: "Boba & board games", description: "Monthly social, all welcome.", category: "social", buildingId: "vil",
      start: dayAt(now, -6, 19).toISOString(), end: dayAt(now, -6, 21).toISOString(), host: { kind: "org", name: "Trojan Boba Society", id: "org_boba" },
      visibility: "public", capacity: 120, freeFood: true, foodDetail: "Free boba", attendees: crowd(96), tags: [], expectedTurnout: 80 }),
    // Moderation queue examples (never shown on the public map)
    e({ title: "FREE AIRPODS for USC students!!! claim now", description: "Just DM @trojan_giveawayz and send your USC login to verify you're a student", category: "social", buildingId: "tommy",
      start: inMin(now, 60).toISOString(), end: inMin(now, 120).toISOString(), host: { kind: "user", name: "trojan_giveawayz" },
      visibility: "public", freeFood: false, attendees: [], tags: [], source: "user",
      moderation: { status: "rejected", reasons: ["Asks for USC credentials (phishing)", "Too-good-to-be-true giveaway"], riskScore: 0.97, checkedBy: "claude" } }),
    e({ title: "Doheny rooftop afterparty", description: "Sneak up through the service stairs, bring your own drinks", category: "social", buildingId: "dml",
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
    { id: "in_7", source: "gmail", from: "Career Center", receivedAt: ago(700),
      subject: "Engineering Career Fair next Wednesday",
      body: "120+ employers at the Galen Center next Wednesday 11am-4pm. Upload your resume to the career portal first. Free professional headshots at the entrance." },
  ];
}

export function seedNotifications(now: Date): Notification[] {
  const ago = (m: number) => new Date(now.getTime() - m * MIN).toISOString();
  return [
    { id: "n_1", kind: "friend", title: "Jordan started a pickup soccer game", body: "Cromwell Field · starts in 10 min · needs 4 more", createdAt: ago(3), read: false, eventId: "ev_001", source: "live" },
    { id: "n_2", kind: "food", title: "Free pizza right now", body: "Startup Pitch Night · RTH 526 · 6 min walk", createdAt: ago(12), read: false, eventId: "ev_005", source: "live" },
  ];
}
