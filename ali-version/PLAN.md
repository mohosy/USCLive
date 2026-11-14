# Trojan Map: build plan

Working name: **Trojan Map**. A live, interactive map of the USC University Park campus, built for USC students.

**Status (2026-11-14):** planning only. No feature code has been written. An unmodified Next.js scaffold sits uncommitted in the working tree (section 10). Nothing has been pushed to GitHub, and no GitHub push is planned until the owner asks for one.

**Before building starts,** the team should answer the open questions in section 8. The five that change the build most are marked there.

---

## 1. Product summary and demo story

### Summary

One map that answers what a USC student asks all day: where is my next class, how busy is it there, what is happening on campus right now, and is it safe to walk there.

- **Primary user:** a USC student, signed in with a usc.edu account.
- **Secondary user:** a verified USC Department of Public Safety (DPS) staff member, who publishes safety alerts. Students can never post alerts.
- **Surface:** a mobile-first web app, dark by default, in USC cardinal and gold.
- **Deliverables:** the Next.js app, a single self-contained HTML demo (`demo/trojan-map-demo.html`), a README, and a 3-minute demo script.

### What judges should remember

1. The map is alive: a game is being played, the dining hall is filling up, a pickup game is starting.
2. Safety alerts come only from verified DPS accounts, appear on the map within seconds, and clear themselves.
3. A pasted syllabus becomes office-hours pins on the map.

### The 3-minute demo

Two browser windows are open side by side: the student view and the DPS console. A hidden demo panel (press `D`) sets the time of day and the game phase, so no beat depends on the real clock or on the network.

| Time | Presenter does | Judges see |
| --- | --- | --- |
| 0:00–0:20 | Types a gmail.com address, then a usc.edu address and the 6-digit code | The gmail address is rejected. The usc.edu address opens the map. |
| 0:20–0:50 | Searches "Leavey", then drags the time scrubber from 10 am to 12:30 pm | The map flies to Leavey. Rings around dining halls, the gym and libraries change colour as lunch fills up. |
| 0:50–1:20 | Taps the Coliseum, then presses "Kickoff" in the demo panel | A countdown to kickoff and a pre-game marker. Then a gold pulse at the venue and a score card with a ticking game clock. |
| 1:20–1:55 | In the DPS window, publishes a Caution alert, then marks it All Clear | A banner drops in the student window, a red zone pulses on the map, the status changes to All Clear, and the alert moves to history. |
| 1:55–2:30 | Pastes a syllabus into My Schedule, then taps "Connect Google Calendar" | Office hours are extracted with location and times. Pins and a day timeline appear. |
| 2:30–2:50 | Drops a pin for pickup basketball, RSVPs from the second window, then books a Marshall breakout room | The event appears in both windows with the RSVP count. The room filter shows only rooms this student may book. |
| 2:50–3:00 | States what is mocked, what is real, and what comes next | The roadmap slide or README section. |

If the demo runs long, cut the room booking first, then the Google Calendar tap.

---

## 2. Features, ranked

Ranks: **Must** ships in the MVP and appears in the demo. **Nice** is built only after every Must works end to end. **Roadmap** is described in the README and not built.

| # | Feature | Rank | What ships at that rank |
| --- | --- | --- | --- |
| 1 | usc.edu sign-in gate | Must | Mock flow: email, usc.edu check, 6-digit code. Behind an `AuthProvider` interface. |
| 2 | Campus map and key places | Must | Full-screen map, 14 places with markers and detail sheets, search. |
| 3 | Layer toggles and filters | Must | Games, Busy spots, My schedule, Public events, Rooms, Safety. |
| 4 | Live games layer | Must | Pulse at the venue, score and clock card, countdown to kickoff, pre-game marker. Mock data that ticks. |
| 5 | Busyness layer | Must | Coloured rings and a soft heat glow for dining halls, the gym and libraries. Mock data that follows the time of day. |
| 6 | Live Safety Alerts | Must | DPS-only console, severity levels, red zone, banner, status updates, auto-expiry, history, nearby-only notification with a simulated position. Mock alerts. Full spec in section 9. |
| 7 | My Schedule | Must | Day timeline and pins. Syllabus paste or upload with a heuristic parser that needs no key. LLM parser when a key is set. Mock Google Calendar and Brightspace connectors. |
| 8 | Public events and RSVP | Must | Drop a pin, set time and description, RSVP. Saved locally and synced across tabs. |
| 9 | Room booking | Must | Rooms filtered by school and interests, mock availability, book and cancel. |
| 10 | Demo panel and seed data | Must | Time scrubber, game phase, sample alert, reset. Every layer has seeded content. |
| 11 | Single-file demo | Must | `demo/trojan-map-demo.html`, every layer plus the mock sign-in. |
| 12 | README and demo script | Must | How to run, mocked versus real, roadmap, 3-minute script. |
| 13 | Real browser location for nearby alerts | Nice | Uses the Geolocation API when the user allows it. The simulated position stays as the demo default. |
| 14 | "Leave in 6 min" walk time to the next class | Nice | Straight-line distance at walking speed. |
| 15 | 3D buildings and a tilted camera | Nice | Vector tiles only. |
| 16 | Light theme | Nice | Token swap. |
| 17 | Installable PWA | Nice | Manifest and icons. |
| 18 | USC Google sign-in | Roadmap | Section 3. |
| 19 | Brightspace and Google Calendar sync | Roadmap | Section 3. |
| 20 | Live scores feed | Roadmap | Section 3. |
| 21 | Real crowd data | Roadmap | Section 3. |
| 22 | Official DPS feed and push notifications | Roadmap | Sections 3 and 9. |
| 23 | Real room booking | Roadmap | Deep links first, then APIs. |
| 24 | Moderation for public events | Roadmap | Report button, review queue. |

---

## 3. Feasibility: real now, mocked, and what the real version needs

Facts marked "checked" were confirmed by web search on 2026-11-14. They still need a teammate to confirm access.

### Sign-in gate

- **Real in the hackathon:** the domain check, the session, sign-out, and the code screen.
- **Mocked:** no email is sent. The code is shown on screen in a "demo inbox" card.
- **Real integration:** Google OAuth through Auth.js. Pass `hd=usc.edu` in the request to shape the Google screen, and **validate the `hd` claim in the ID token on the server**. Google's documentation says the `hd` request parameter is only a hint and that the `email` domain must not be used for this check (checked: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)). Needs a Google Cloud project and an OAuth client. USC Shibboleth SSO would need USC ITS to register the app.

### Map and places

- **Real:** real geography, real approximate coordinates, pan, zoom, search.
- **Mocked:** nothing.
- **Needs:** public tiles. OpenFreeMap, Carto and OpenStreetMap tile endpoints all returned HTTP 200 from the build machine. Heavy production traffic would need a hosted tile plan.

### Live games

- **Real:** the countdown, the clock logic, the animation, the card.
- **Mocked:** scores, clock and play text come from a seeded simulator. Opponents are placeholders and are labelled as demo data.
- **Real integration:** a `ScoresProvider`. Candidates: CollegeFootballData `/scoreboard` (live data is on a paid tier), ESPN's undocumented scoreboard JSON (free, no guarantee it stays up), Sportradar (business contract). For basketball, volleyball and baseball, the USC Athletics site's own stats feed is the likely source and has not been investigated.

### Busyness

- **Real:** the visual layer, the levels, the time scrubber.
- **Mocked:** every number. Each place has an hourly curve plus small deterministic variation.
- **Real integration:**
  - Lyon Center: USC Recreational Sports publishes a live "Current Facility Traffic" page (checked: [recsports.usc.edu](https://recsports.usc.edu/rec-facilities/current-facility-traffic/)). Whether it has a usable feed and whether USC allows reuse is unknown.
  - Libraries and dining halls: no public live source was found.
  - Wi-Fi counts: USC researchers built CrowdMap from access-point logs, but it produces hourly counts from nightly logs and sits behind USC sign-in. Live counts would need USC ITS.
  - Fallback that needs no partner: opt-in check-ins from app users.

### My Schedule

- **Real:** the timeline, the pins, the heuristic syllabus parser, and the LLM parser when a key is set.
- **Mocked:** the Google Calendar and Brightspace connectors return seeded data after a short simulated connection.
- **Real integration:**
  - Google Calendar: OAuth scope `calendar.readonly`, then `events.list`. A sensitive scope needs Google's app verification before public launch. Test users work without it.
  - Brightspace: a USC Brightspace administrator must register an OAuth 2.0 app in Manage Extensibility and grant scopes such as `calendar:events:read` and `orgunits:course:read` (checked: [D2L OAuth 2 documentation](https://docs.valence.desire2learn.com/basic/oauth2.html)). A student team cannot do this alone.
  - Brightspace calendars hold due dates and course events, not weekly class meeting times. Meeting times come from Google Calendar or the USC Schedule of Classes.

### Public events

- **Real:** create, list, RSVP, persistence in the browser, sync across tabs.
- **Mocked:** "other students" are seeded users. Data does not leave the browser.
- **Real integration:** a database with realtime updates (Supabase or Postgres), and moderation.

### Room booking

- **Real:** filtering by school and interests, the booking flow, conflict checks against the student's own bookings.
- **Mocked:** inventory and availability. The inventory is modelled on the real systems.
- **Real integration** (checked):
  - Doheny, Leavey and Science & Engineering study rooms use LibCal at [libcal.usc.edu](https://libcal.usc.edu/). Bookings open one week ahead with a 2-hour daily limit.
  - Marshall breakout rooms (6 in the Business Library, 8 in the Accounting Library) are Marshall-only and use EMS with a Marshall login ([USC Libraries](https://libraries.usc.edu/locations/gaughan-tiberti-library/rooms/jff-breakout-rooms)).
  - Thornton practice rooms use the EMS Virtual SCheduling site at [uscschedule.usc.edu](https://uscschedule.usc.edu/).
  - First real step: deep-link each room to its official booking page. That needs no API access.

### Live Safety Alerts

- **Real:** the console, the alert lifecycle, expiry, the map zone, the banner, the history, and the nearby check, which runs on the device.
- **Mocked:** DPS identity verification, the alerts themselves, and delivery when the app is closed.
- **Real integration:** a partnership with DPS. Details in section 9.

---

## 4. Tech stack

| Layer | Choice | Why | Rejected |
| --- | --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | One command to run, one click to deploy on Vercel, and a server route to keep the LLM key off the client. OAuth callbacks drop in later. | Vite SPA: no server route for the key. |
| Map | MapLibre GL JS through `react-map-gl/maplibre` | Smooth camera moves, native heat and circle layers, no token. | Mapbox and Google Maps need keys and billing. Leaflet is less smooth; it is used for the single-file demo instead. |
| Tiles | OpenFreeMap dark vector style, Carto dark raster as fallback | No key. Vector tiles give sharp labels and optional 3D buildings. | OSM default raster tiles: light theme and a strict usage policy. |
| Styling | Tailwind CSS 4, shadcn/ui, lucide icons | Accessible primitives (dialog, sheet, tabs) without hand-rolling. Tokens for cardinal and gold. | A second component library. |
| Animation | CSS keyframes and transitions | Pulses and sheets need nothing heavier. Respects reduced-motion. | A motion library, unless polish time allows. |
| State and storage | React state plus a `Store` interface over `localStorage`, with `BroadcastChannel` for cross-tab sync | No backend to run. The interface lets Postgres replace it. | SQLite: adds a server and breaks the single-file build. |
| Syllabus parsing | `SyllabusParser` interface. Heuristic parser in the browser. LLM parser in a server route when `ANTHROPIC_API_KEY` is set, with the model named in `SYLLABUS_MODEL` | The demo cannot depend on a key or the network. A small Claude model returning JSON against a schema is cheap and accurate for this. | Client-side LLM calls: would expose the key. |
| Tests | Vitest for parsers and time logic, Playwright for a smoke run and screenshots | The parser and alert expiry are the logic most likely to break. | End-to-end coverage of every screen. |
| Deploy | Vercel for the app. The single-file demo is the static deliverable. | A static export cannot host the LLM route. | `output: "export"` for the main app. |

---

## 5. Architecture and data model

### Shape

```text
Browser
  UI (app shell, map, layer components, sheets)
    -> hooks (useLayers, useDemoClock, useSession)
      -> providers (interfaces; mock implementations in the MVP)
        -> Store (localStorage + BroadcastChannel)
Server (Next.js route)
  POST /api/parse-syllabus  -> LLM, only when a key is configured
```

Every external system sits behind an interface with a mock implementation. Swapping in a real integration means writing one new class and changing one line in `lib/providers/index.ts`.

### Folders

```text
app/                 layout, page, api/parse-syllabus/route.ts, dps/page.tsx
components/map/      CampusMap, PlaceMarker, one file per layer
components/panels/   SchedulePanel, EventsPanel, RoomsPanel, AlertsPanel, PlaceSheet
components/auth/     SignInGate
components/ui/       shadcn primitives
lib/types.ts         the data model below
lib/providers/       auth, scores, crowd, calendar, syllabus, rooms, safety, store
lib/seed/            places.json, games.json, rooms.json, events.json, schedule.json, alerts.json
lib/demo-clock.ts    one clock that every layer reads
demo/                template.html, trojan-map-demo.html
scripts/build-demo.mjs
```

Seed data is JSON so the app and the single-file demo read the same files.

### Data model

```ts
type LngLat = { lng: number; lat: number };
type School = "marshall" | "viterbi" | "thornton" | "dornsife" | "annenberg" | "sca" | "other";

interface User {
  id: string;
  email: string;                 // usc.edu only
  name: string;
  role: "student" | "dps";       // set by the server in the real system, never by the client
  school: School;
  major: string;
  interests: string[];           // "basketball", "music", "study-groups"
}

interface Place {
  id: string;
  name: string;
  shortName: string;
  kind: "library" | "dining" | "gym" | "venue" | "academic" | "landmark" | "housing" | "field";
  location: LngLat;
  tracksBusyness: boolean;
  capacity?: number;
}

interface Game {
  id: string;
  sport: string;
  opponent: string;
  venueId: Place["id"];
  startsAt: string;              // ISO 8601
  phase: "scheduled" | "pregame" | "live" | "final";
  period?: string;               // "Q3", "2nd half"
  clock?: string;                // "08:42"
  score: { usc: number; opponent: number };
  lastPlay?: string;
  pregame?: { label: string; placeId: Place["id"]; startsAt: string };
}

interface BusynessReading {
  placeId: Place["id"];
  at: string;
  percent: number;               // 0–100 of capacity
  level: "quiet" | "moderate" | "busy" | "packed";
  source: "mock" | "sensor" | "wifi" | "checkin";
}

interface ScheduleItem {
  id: string;
  userId: User["id"];
  kind: "class" | "office-hours" | "club" | "assignment";
  title: string;
  placeId?: Place["id"];
  locationText: string;          // "JFF 240"
  days: number[];                // 0 = Sunday
  start: string;                 // "14:00"
  end: string;
  source: "syllabus" | "google-calendar" | "brightspace" | "manual";
  confidence?: number;           // parser confidence, 0–1
}

interface PublicEvent {
  id: string;
  hostId: User["id"];
  title: string;
  category: "sports" | "study" | "social" | "club" | "other";
  description: string;
  location: LngLat;
  placeId?: Place["id"];
  startsAt: string;
  endsAt: string;
  capacity?: number;
  rsvps: User["id"][];
}

interface Room {
  id: string;
  placeId: Place["id"];
  name: string;
  type: "study" | "breakout" | "practice";
  capacity: number;
  amenities: string[];
  eligibleSchools: School[] | "all";
  interestTags: string[];
  bookingSystem: "libcal" | "ems-marshall" | "ems-usc" | "mock";
  bookingUrl?: string;
}

interface Booking {
  id: string;
  roomId: Room["id"];
  userId: User["id"];
  start: string;
  end: string;
  status: "confirmed" | "cancelled";
}

interface SafetyAlert {
  id: string;
  severity: "advisory" | "caution" | "emergency";
  category: string;              // from a fixed list, section 9
  title: string;
  instruction: string;           // "Avoid the area"
  location: LngLat;
  locationLabel: string;         // block or building, never an exact address
  radiusM: number;
  status: "active" | "all-clear" | "expired";
  issuedAt: string;
  expiresAt: string;
  updates: { at: string; status: SafetyAlert["status"]; text: string }[];
  notify: { scope: "nearby" | "campus"; radiusM: number };
  source: "dps-console" | "trojans-alert" | "crime-log" | "mock";
  issuedByRole: "dps";
  isDemo: boolean;
}
```

### Adapter interfaces

```ts
interface AuthProvider {
  requestCode(email: string): Promise<{ ok: true } | { ok: false; reason: "not-usc" | "invalid" }>;
  verifyCode(email: string, code: string): Promise<User | null>;
  currentUser(): User | null;
  signOut(): Promise<void>;
}

interface ScoresProvider {
  listGames(range: { from: string; to: string }): Promise<Game[]>;
  subscribe(gameId: string, onUpdate: (game: Game) => void): () => void;
}

interface CrowdProvider {
  read(placeIds: string[], at: Date): Promise<BusynessReading[]>;
}

interface CalendarSource {
  id: "google-calendar" | "brightspace";
  connect(): Promise<void>;
  isConnected(): boolean;
  listItems(range: { from: string; to: string }): Promise<ScheduleItem[]>;
  disconnect(): Promise<void>;
}

interface SyllabusParser {
  id: "heuristic" | "llm";
  parse(text: string): Promise<{ items: ScheduleItem[]; warnings: string[] }>;
}

interface RoomProvider {
  listRooms(user: User): Promise<Room[]>;
  availability(roomId: string, day: string): Promise<{ start: string; end: string; free: boolean }[]>;
  book(roomId: string, user: User, start: string, end: string): Promise<Booking>;
  cancel(bookingId: string): Promise<void>;
}

interface SafetyAlertSource {
  list(opts: { includeHistory: boolean }): Promise<SafetyAlert[]>;
  subscribe(onChange: (alerts: SafetyAlert[]) => void): () => void;
  publish(draft: Omit<SafetyAlert, "id" | "updates" | "status">, actor: User): Promise<SafetyAlert>;
  update(id: string, status: SafetyAlert["status"], text: string, actor: User): Promise<SafetyAlert>;
}

interface Store {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  subscribe(key: string, onChange: () => void): () => void;
}
```

`publish` and `update` reject any actor whose role is not `dps`. In the real system that check runs on the server.

### Places and seed coordinates

These are approximate and written from memory. They must be checked against OpenStreetMap when the seed file is created.

| Place | Kind | Lat | Lng |
| --- | --- | --- | --- |
| Tommy Trojan | landmark | 34.0205 | -118.2855 |
| Doheny Memorial Library | library | 34.0201 | -118.2837 |
| Leavey Library | library | 34.0217 | -118.2829 |
| McCarthy Quad | landmark | 34.0209 | -118.2832 |
| USC Village | dining | 34.0251 | -118.2851 |
| Lyon Center | gym | 34.0244 | -118.2884 |
| Galen Center | venue | 34.0210 | -118.2797 |
| LA Memorial Coliseum | venue | 34.0141 | -118.2879 |
| Marshall: Fertitta Hall (JFF) | academic | 34.0187 | -118.2823 |
| Marshall: Hoffman Hall (HOH) | academic | 34.0187 | -118.2853 |
| Parkside | dining | 34.0189 | -118.2909 |
| Everybody's Kitchen (EVK) | dining | 34.0212 | -118.2821 |
| Dedeaux Field | field | 34.0236 | -118.2897 |
| Cromwell Field | field | 34.0222 | -118.2879 |

---

## 6. UI and UX

### Screens

1. **Sign-in.** Full-screen card over a blurred map. Email field, inline rejection for non-usc.edu addresses, code entry, and a "demo inbox" card showing the code.
2. **Profile setup.** Two taps: school and interests. These drive the room filter. A seeded demo profile skips this.
3. **Map (home).** Full-screen map. Search bar at the top, layer chips under it, a "Live now" strip, and a bottom sheet.
4. **Place sheet.** Name, busyness now and for the next hours, games, rooms and events at that place.
5. **Game card.** Score, period, clock, last play, or the countdown before kickoff.
6. **My Schedule.** Day timeline, pins on the map, the syllabus box, and the two Connect buttons.
7. **Public events.** List, detail with RSVP, and "Drop a pin" to create.
8. **Rooms.** Filtered list, a slot grid, a confirm dialog, "My bookings".
9. **Safety.** Banner, alert detail with a status timeline, and history.
10. **DPS console** at `/dps`. Sign-in for the DPS role, an alert form with a map picker, active alerts with Update and All Clear, and an audit list.
11. **Demo panel.** Hidden behind the `D` key.

### Layout

- **Phone (the default):** the map fills the screen. Controls sit in the thumb zone. The bottom sheet has three stops: peek, half, full. Tap targets are at least 44 px.
- **Desktop:** the sheet becomes a 380 px left panel. The map keeps the rest.

### Layers

Six chips: Games, Busy spots, My schedule, Public events, Rooms, Safety. Each shows a count. Search covers places, events and rooms.

The Safety layer is on by default. An Emergency alert stays visible even when the Safety chip is off.

### Styling

| Token | Value | Use |
| --- | --- | --- |
| Background | `#0B0B0F` | App and map chrome |
| Surface | `#15151B` | Cards and sheets |
| Cardinal | `#990000` | Primary buttons, selected chips, brand fills |
| Gold | `#FFCC00` | Accents, live indicators, the game pulse |
| Alert red | `#FF3B30` | Safety alerts only |
| Busyness scale | teal, gold, orange, deep orange | Quiet to packed |

Three colour rules keep the layers readable:

- Cardinal on a dark background has low contrast, so it is used for fills and never for small text. Text accents use gold.
- Alert red and the expanding zone pulse are reserved for safety. The game pulse is gold, and the busyness scale stops at deep orange.
- Colour is never the only signal. Busyness shows a word and a percentage. Alerts show an icon and a severity label.

Motion: markers spring in, sheets slide, the camera flies to search results. All pulses stop when the system asks for reduced motion.

States: every panel has an empty state with a next action, a loading skeleton, and an error message with a retry. If tiles fail to load, the map shows a notice and the markers still render.

USC logos and the Tommy Trojan image are trademarks. The app uses the colours and plain text only.

---

## 7. Build order

Effort is given as a relative size and a share of the whole build, not in hours. Clock time depends on who builds it: one agent run, or several teammates working in parallel.

- **S:** one component or one module.
- **M:** a feature with two to four components and its seed data.
- **L:** a feature that touches the map, a panel, a provider and shared state.

| Step | Work | Size | Share | Depends on |
| --- | --- | --- | --- | --- |
| 0 | Team answers the marked questions in section 8 | n/a | n/a | n/a |
| 1 | Foundation: theme tokens, shadcn setup, app shell, `lib/types.ts`, seed JSON, `Store`, demo clock | M | 9% | 0 |
| 2 | Sign-in gate and profile setup | S | 4% | 1 |
| 3 | Map core: tiles, 14 places, markers, place sheet, search, layer chips | L | 14% | 1 |
| 4 | Games layer and game card | M | 9% | 3 |
| 5 | Busyness layer and time scrubber | M | 7% | 3 |
| 6 | Safety alerts: student view, DPS console, lifecycle, nearby check | L | 13% | 3 |
| 7 | My Schedule: timeline, pins, heuristic parser, LLM route, mock connectors | L | 13% | 3 |
| 8 | Public events and RSVP | M | 7% | 3 |
| 9 | Room booking | M | 6% | 3 |
| 10 | Polish: motion, empty and error states, phone pass, keyboard and contrast pass | M | 5% | 4–9 |
| 11 | Single-file demo | L | 9% | 1, and the seed data from 4–9 |
| 12 | README, demo script, tests, screenshots, full run-through | S | 4% | all |

**Parallel work.** Steps 4 to 9 are independent once steps 1 and 3 are done. Each is one layer file, one panel and one provider, so six people can take one each without touching the same files.

**Cut order if the build runs behind.** Drop these in order, and keep everything else:

1. Room booking depth: keep the filtered list and one-tap booking, drop the slot grid.
2. The LLM parser: the heuristic parser carries the demo.
3. Real browser location for alerts: the simulated position carries the demo.
4. Everything ranked Nice.

### The single-file demo

Target: `demo/trojan-map-demo.html`, one file, no build step to use it, no backend.

- **Map:** Leaflet with Carto dark raster tiles. Leaflet's JS and CSS are inlined with their licence header, so tiles are the only network request.
- **Offline fallback:** if tiles do not load within a few seconds, the file switches to an inline stylised SVG campus with the same markers. Venue Wi-Fi cannot break the demo.
- **Code:** plain JavaScript and CSS, written by hand. It covers the mock sign-in and all six layers, with the same demo panel.
- **Data:** `scripts/build-demo.mjs` copies the seed JSON into `demo/template.html` and writes the final file, which is committed. The app and the file cannot drift apart.
- **Persistence:** `localStorage`, same keys as the app.
- **Not included:** the LLM parser. The file uses the heuristic parser only.

### Verification before calling it done

- `npm run lint`, `npm run build` and the unit tests pass.
- A Playwright run signs in, toggles every layer, publishes and clears an alert, parses a syllabus, creates an event, RSVPs and books a room.
- Screenshots of the main views at phone and desktop widths are saved as artifacts.
- The single-file demo is opened from disk with the network off and with it on.

---

## 8. Risks and open questions

### Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| A mock safety alert is mistaken for a real one | Panic, loss of trust | Every mock alert carries a visible DEMO label. Seeded alerts use plainly generic incidents. |
| The app is taken for an official USC or DPS service | Legal and reputational | "Not an official USC service" in the footer and README. No USC logos. |
| Venue Wi-Fi fails during the demo | Blank map | SVG fallback in the single-file demo. A recorded backup video. |
| The LLM route is slow or the key is missing | Stalled schedule beat | The heuristic parser is the default in the demo. The LLM is a visible toggle. |
| Coordinates are off | Markers on the wrong building | Check all 14 against OpenStreetMap in step 3. |
| Public events are abused | Harmful content on a campus map | usc.edu identity on every event, a report button, moderation on the roadmap. |
| Too much scope for the time available | Half-working layers | The cut order in section 7. A layer is either complete or hidden. |
| Next.js 16 behaves differently from older versions | Build errors | The scaffold ships version-matched docs in `node_modules/next/dist/docs/`. Read them before writing routes. |
| Student data leaves the device | Privacy | Schedule, location and RSVPs stay in the browser in the MVP. Syllabus text goes to the LLM only when a key is set, and the UI says so. |

### Open questions for the team

The first five change the build and should be answered before step 1.

1. **Does anyone on the team have a contact at DPS?** Without one, the pitch is "built for DPS to adopt". With one, it is "DPS can pilot this".
2. **Is the safety pitch a DPS console, a mirror of official DPS alerts, or both?** This plan builds the console and designs the mirror. Section 9 explains why the mirror should be the real data path.
3. **Which sport leads the demo?** Football at the Coliseum is the strongest visual. Basketball at Galen matches a mid-November date.
4. **Who is the demo student?** The school decides which rooms appear. This plan assumes a Marshall student with basketball and music interests.
5. **Will an LLM key be available at the demo?** If not, the LLM parser moves to Nice.
6. Is the name "Trojan Map" final? The teammate repository is called USCLive.
7. Is there a USC Brightspace administrator who would register an OAuth app after the hackathon?
8. Does USC allow reuse of the Lyon Center traffic data, and is there a feed behind the page?
9. Should public events allow off-campus pins, or only the campus area?
10. Where does the code go after this run? All GitHub pushes are cancelled for now. The earlier target was `mohosy/USCLive` through a branch and a pull request.

---

## 9. Live Safety Alerts: feature spec

**Rank: Must.** It appears in the demo at 1:20.

### What it does

A verified DPS account publishes an alert from a console. Within seconds every signed-in student sees:

- a **pulsing red zone** on the map at the reported location,
- an **in-app banner**: "Be careful: reported incident near Jefferson Blvd and Hoover St. Avoid the area.",
- the **time issued**, the **status**, and every **update** in order.

DPS can post updates and mark the alert **All Clear**. Alerts **expire on their own**. Past alerts stay in a **history** list.

### Who can post

Only the `dps` role. Students cannot create, edit, comment on or re-share an alert inside the app. This is the main defence against misinformation and panic.

- **MVP:** one seeded DPS demo account with a separate sign-in at `/dps`. The role comes from the seed data, not from what the user types.
- **Real system:** the role is granted on the server from an allowlist tied to USC SSO identities, with multi-factor sign-in required. The client never sends its own role. Every publish, update and all-clear is written to an append-only audit log with the actor and the time. A second approver for Emergency alerts is an option to raise with DPS.

### Severity levels

| Level | Map | Notification | Default expiry |
| --- | --- | --- | --- |
| Advisory | Static amber ring | Entry in the alerts tray, no banner | 2 hours |
| Caution | Pulsing red zone | Banner the student can dismiss | 4 hours |
| Emergency | Larger pulsing red zone | Banner that stays until acknowledged, sent campus-wide, visible even with the Safety layer off | Until All Clear |

The expiry defaults are proposals for DPS to confirm. The publisher can change the expiry on each alert.

### Lifecycle

`active` → optional updates → `all-clear` → `expired`.

- An alert with no All Clear expires at its expiry time.
- After All Clear the zone turns grey and stops pulsing, then moves to history after 30 minutes.
- Expiry is computed from timestamps on every clock tick, so a closed tab shows the right state when reopened.

### Nearby-only notification

Each alert has a notify scope: **nearby** (within a radius the publisher sets) or **campus**.

- The check runs **on the device**. The student's position is never sent anywhere.
- Judges will not be standing on campus, so the demo uses a simulated "you are here" dot that the presenter can drag. Real browser location is ranked Nice.
- Students outside the radius get no banner. The zone still shows on their map.
- Emergency alerts ignore the radius.
- If location permission is refused, the student is treated as nearby. Missing a warning is worse than receiving an extra one.

### History

A list of past alerts with category, general location, issued time, final status and the update timeline. It keeps 60 days, the same window as the public DPS log.

History is a list and fading pins. It is deliberately **not** a crime heat map: an aggregated "danger" overlay would stigmatise blocks and neighbourhoods on thin data.

### Real data path

The app must repeat official information, not compete with it. What the official sources are today (checked: [DPS alerts page](https://dps.usc.edu/alerts/), [Clery FAQ](https://dps.usc.edu/alerts/clery-faqs/)):

| Source | What it is | How the app would use it |
| --- | --- | --- |
| TrojansAlert | USC's emergency notification system. Text and email from authorised USC senders, using pre-scripted messages. | The live path. Needs DPS and USC emergency planning to add the app as a delivery channel or to provide a feed. No public API was found. |
| Timely Warnings and Crime Alerts | Emails for serious crimes, also posted on the DPS site. Timely Warnings cover Clery geography. Crime Alerts cover the DPS patrol area. | Import as Caution alerts with the official wording and a link to the source. |
| Daily Crime and Fire Log | A public PDF published each business day with the prior day's reports, covering 60 days. Columns include date reported, offense, general location and disposition. It carries no personal information. | History and context only. It is a day behind, so it can never drive a live alert. |

All three plug into the same `SafetyAlertSource` interface as the console and the mock. The plan's recommendation is that the official feed is the real path, and the console is what DPS uses when it wants to add a map zone to an alert it is already sending.

**Demo data:** three seeded alerts (one active Caution, one All Clear, one expired Advisory) and a "publish sample alert" button. All are labelled DEMO.

### Privacy and safety rules

1. **No victim information.** No names, ages, genders, residences or room numbers. The form has no free-text field for people.
2. **No profiling.** The MVP form has no suspect description field. If DPS later needs one, it carries only what DPS has officially released, and never race or ethnicity as the sole descriptor.
3. **Accurate wording.** Alerts are built from a fixed category list and a fixed instruction list ("Avoid the area", "Shelter in place", "Use another route"). "Reported" is used until DPS confirms. No speculation and no adjectives.
4. **General locations.** A block, an intersection or a building, matching the precision of the public DPS log. Never an exact address or a room.
5. **Official source wins.** Each alert links to the official notice when one exists. If the app and TrojansAlert disagree, the app shows the TrojansAlert text.
6. **Not an emergency service.** Each alert shows "Emergency? Call 911 or DPS at 213-740-4321" (the UPC emergency line listed on the [DPS site](https://dps.usc.edu/critical-usc-emergency-response-service/faq/)).
7. **No tracking.** The app does not record who saw an alert or where they were.
8. **No student posting, comments or reactions** on alerts.
9. **Corrections stay visible.** A wrong alert is retracted with an update, not deleted, so students who saw it also see the correction.
10. **Legal duties stay with USC.** The app is an extra channel. It does not replace the university's Clery Act notifications.

### Notifications beyond the banner

Push when the app is closed is Roadmap: Web Push with a service worker. On iPhones it only works after the site is added to the home screen, which is a reason to consider a native app later.

---

## 10. What already exists

Before the plan-first instruction arrived, the project was scaffolded. No feature code was written.

| Item | State | Fit with this plan |
| --- | --- | --- |
| Next.js 16.4.6 scaffold from `create-next-app` (TypeScript, Tailwind 4.3.3, ESLint, App Router, React 19.3.0), moved to the repo root | Uncommitted, unmodified | The framework chosen in section 4. Becomes step 1. |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/*.svg` | Default boilerplate | Replaced in step 1. |
| `package.json` | Name is still `tmp-scaffold` | Rename in step 1. |
| Installed packages: `maplibre-gl` 6.18.0, `react-map-gl` 8.1.3, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` | In `package.json` and `node_modules`, uncommitted | The map and styling choices in section 4. |
| `README.md` | Currently the `create-next-app` boilerplate. The original seeded README was moved to `README.seed.md`. | Both are replaced by the real README in step 12. |
| `AGENTS.md` | Written by the scaffold | Keep. It points to the version-matched Next.js docs. |
| Tile check | OpenFreeMap, Carto and OSM endpoints returned HTTP 200 | Supports the tile choice in section 4. |

Not done: shadcn/ui setup, any component, any seed data, any provider, the single-file demo, tests, screenshots.

Only `PLAN.md` is committed. The scaffold is left uncommitted on purpose so the repository holds nothing the team has not agreed to. It can be committed as is, or recreated with one command.
