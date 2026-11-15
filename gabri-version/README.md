# USCLive — Gabri's version

A live 3D map of everything happening at USC, with an LLM (OpenAI or Claude) doing the reading, planning and moderation.
Desktop-first MVP for AI@USC (mobile later).

## Run it

```bash
cd gabri-version
npm install
cp .env.example .env.local   # add NEXT_PUBLIC_MAPBOX_TOKEN and OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000 (organizer view: `/dashboard`).

Without an API key everything still works in **offline mode** (heuristics). With `OPENAI_API_KEY` the AI features run on OpenAI (`OPENAI_MODEL`, default `gpt-4.1`); with `ANTHROPIC_API_KEY` they run on Claude. Both use structured outputs validated with zod. Provider switch lives in `src/lib/ai.ts`.

`POST /api/reset` re-seeds the demo data relative to the current time — do it right before recording the demo.

## Features

| Feature | Where |
|---|---|
| 3D campus map (Mapbox Standard: 3D buildings, landmarks, trees; needs `NEXT_PUBLIC_MAPBOX_TOKEN`), event pins sized by attendance | `src/components/MapView.tsx` |
| Map / Satellite / **3D** switch. 3D = Google Photorealistic 3D Tiles via deck.gl (needs `NEXT_PUBLIC_GOOGLE_MAPS_KEY` with Map Tiles API) | `src/components/Google3DView.tsx` |
| Map callouts (Mo's design): live game scores, busy/quiet spots, DPS cautions, your next class, pickup events, webcams, with filter chips | `src/lib/callouts.ts`, `MapView.tsx` |
| DPS safety alerts: red zones + callouts, expire automatically, "Trojans Alert" emails become map alerts via the inbox scan | `src/lib/seed.ts`, `api/inbox/scan`, `api/alerts/[id]` |
| Live webcams: Caltrans I-110 live video (HLS) + USC Tommy/Hecuba snapshots (link to usc.edu for USC's live player) | `src/lib/webcams.ts`, `WebcamViewer.tsx` |
| Every named building on campus tagged (143 from OpenStreetMap + 27 hand-tuned) | `src/lib/campus.ts`, `campus-buildings.osm.json` |
| Mo's 3D walking tour: type "how do I get to THH" | `src/components/walk/` |
| Hotspots: heatmap + 3D "crowd columns" vs. normal level for that hour, k-anonymity (<5 people hidden) | `src/lib/hotspots.ts` |
| **"What should I do now?"** — free time before next class, walk times, friends, free food → 3 ranked suggestions | `src/app/api/ai/now`, `NowPanel.tsx` |
| Ask the map (natural language → answer + highlighted pins + fly-to) | `src/app/api/ai/ask` |
| Add event from pasted text **or a flyer photo** (Claude vision) | `src/app/api/ai/extract`, `AddEventModal.tsx` |
| AI moderation of user events (Claude + rule layer, stricter wins) → approved / flagged for USG / rejected | `src/lib/ai.ts#moderateEvent` |
| Visibility: public · school-only · open invite (pickup soccer, FBE 403 study session) · invite-only (friends) | `src/lib/store.ts#canSee` |
| Free food filter + 🍕 badges (Claude detects food in event text) | everywhere |
| Study spot finder (emptiest + closest + quiet) | `src/app/api/study`, `StudyPanel.tsx` |
| Campus bot: scans Gmail / Brightspace / Google Calendar (demo inbox) → events, deadlines, invites, **phishing warnings** | `src/app/api/inbox/scan` |
| Real Brightspace sync via its iCal subscribe link | `src/app/api/import/ical` |
| Scraper for public `*.usc.edu` event pages → Claude extracts events | `src/app/api/scrape` |
| Live notifications + toasts (simulated live campus every ~35s) | `src/lib/live.ts` |
| Organizer / USG dashboard: RSVPs vs expected vs **measured turnout**, AI insight brief, moderation queue, post-by-flyer | `/dashboard`, `src/lib/dashboard.ts` |
| **Event registration**: one-tap sign-up with capacity, waitlist and deadline; organizer list + CSV; import an Engage or Handshake listing | `src/lib/registration.ts`, `src/app/api/events/[id]/register`, `RegisterBox.tsx` |

## Registration: real vs demo

What is real, what only opens another site, and what would need USC.

**Real (native registration, built into USCLive)**
- Events marked "One tap in USCLive" register you here: `POST /api/events/:id/register`. The server enforces the
  capacity (a full event puts you on the waitlist), the deadline, and one record per person per event. Asking twice
  changes nothing. `DELETE` cancels, and the first person on the waitlist moves up and is notified.
- Who you are always comes from the signed-in session cookie, never from the request. The routes are rate-limited.
- Registering puts the event on your in-app schedule and friends see you as going (the same rule as the rest of the
  app: friends by name, everyone else as a count). You get a notification 20 minutes before it starts.
- Organizers (the person hosting, or a Student Creator account posting for the hosting org) see counts, the list and
  a CSV export on `/dashboard`. Nobody else can read the list.

**Opens the official page (Handshake, Engage, other sites)**
- For events that register on Handshake, Engage or another website, USCLive only opens that page in a new tab.
  **USCLive never registers anyone on Handshake or Engage.**
- When you come back, the app asks "Did you register?". Yes records a *self-reported* registration and adds the event
  to your schedule. USCLive cannot check it; organizers see these counted separately as "Said they registered".
- "Import from Engage or Handshake" reads a public event page's title, date, time and location to pre-fill the
  new-event form. It only reads what the page shows to everyone, it never signs in, and many Handshake pages need a
  sign-in, in which case the organizer fills the form in by hand.

**Would need USC's approval and the official APIs**
- Registering students on Handshake or Engage directly, or reading the real attendee lists back from them. That means
  an agreement with USC and those platforms' official APIs. It is not built and not faked.
- Adding a registered event to your Google Calendar. The Google connection here is read-only.

**Schedule conflicts**
- Registering, confirming "Did you register?" for a Handshake or Engage event, and RSVPing all check the event against your
  classes that day and the events you are already going to. An overlap ("Conflicts with FBE 403, 2:00-3:20 PM, JKP 112") or
  a back-to-back pair too far apart to walk ("Starts 5 min after BUAD 307 ends, 12 min walk") comes back as a 409 with the
  list, and nothing is saved. "Register anyway" sends `{ anyway: true }`; the event is then marked on its card, in the list
  and on your profile ("Overlaps FBE 403"). No conflict: it registers straight away.
- The assistant mentions a conflict when it suggests an event, and opens the event without joining it for you when it clashes.
- Rules in `src/lib/conflicts.ts`, checked by `node scripts/check-conflicts.mjs`. Walk times are the app's straight-line
  estimate (distance x 1.3), not a routed path.

**Demo data and limits**
- The orgs are real USC orgs and offices (names, descriptions, sites and logos from the EngageSC directory and each
  org's own site, in `src/lib/orgs.ts`). The people, the events and every headcount are made-up demo data: these orgs
  are not hosting these events and have not endorsed USCLive.
- 21 seed events take registrations (17 in the app, three on Handshake, one on Engage); the seeded "going" lists
  count as registered so the numbers add up.
- Storage follows the rest of the app: memory locally, the single Supabase state row when Supabase is configured.
  `supabase/migrations/20261114_event_registrations.sql` defines proper tables for registrations, but **the app does
  not read those tables yet**.
- Sign-in is Google, or the shared demo student (no password), so "signed-in user only" is as strong as that.
- The rate limit is kept in one server's memory; on a host running several copies each copy counts separately.
- Run the rule checks with `node scripts/check-registration.mjs`.

## Friends, profile and settings: real vs demo
**Real, working now**
- Friend requests: search by name or @username, or scan someone's QR code (it opens `/?add=<username>`). Send, accept, decline,
  cancel and unfriend go through `POST /api/friends`; who is asking always comes from the session cookie. No duplicates, you
  can't add yourself, and asking someone who already asked you accepts their request. Rules in `src/lib/friends.ts`.
- Requests to you show at the top of Notifications with Accept and Decline. The friends list says what you share
  ("2 classes, 1 event together").
- Settings (`src/lib/prefs.ts`) save the moment you change them, on your account, and are re-applied when you sign back in.
  Privacy is all off by default. "Show events I'm going to" is enforced on the server: friends only see "Maya is going" for
  friends who turned it on. Each Notifications switch hides that kind of notification.
- Your Trojan's plume and cape colours show on your profile avatar and on your Trojan in Explore and in play mode.

**Demo behaviour, on purpose**
- The demo students are not real people, so a request sent to one is accepted automatically after about 8 seconds. Requests
  between real accounts wait for a real answer. Two demo students have a request waiting for the demo student.
- Demo students have "Show events I'm going to" switched on so the map has friends on it.

**Not built**
- Viewing someone else's profile page. The profile page shows your own, as others would see it.
- "Share my location with friends" and "Who can see my schedule" are saved, but nothing in the app shares a location or a
  schedule with anyone yet, so turning them on changes nothing today.
- The jersey number shows on the profile avatar only, and the Satellite view's Trojan keeps the default colours.
- Run the rule checks with `node scripts/check-friends.mjs`.

## Security notes (for the "securely" part of the rubric)
- All flyer/email/web text is passed to Claude as delimited untrusted data; system prompts forbid following instructions inside it.
- Structured outputs + zod re-validation; building ids constrained to an enum; hallucinated event ids dropped.
- Privacy: attendee lists never leave the server (only friends by name + counts); invite-only events filtered server-side; crowd data is aggregated with a k=5 threshold.
- Scraper only fetches `https://*.usc.edu`; iCal import blocks localhost/IPs (SSRF guard).

## Demo data
The orgs are real USC orgs and offices, taken from the EngageSC directory and each org's own site (`src/lib/orgs.ts`). The people, the events they appear to host and all headcounts are fictional demo data, generated relative to "now" (`src/lib/seed.ts`); no org listed here is hosting these events or has endorsed USCLive. Building coordinates are approximate.
Demo events follow the clock, not the moment the server started: the set is regenerated when it is 30 minutes old, and straight away when someone opens the app after nobody had it open for 3 minutes, so "in 15 min" is true whenever you present. Who is going, invites, registrations and people's own posts carry over (`refreshDemo` in `src/lib/state.ts`, checked by `node scripts/check-demo-time.mjs`).
In-memory store — resets when the server restarts.
Event photos on the map are freely licensed (Creative Commons / public domain) from Wikimedia Commons, matched to events by what they are (`src/lib/eventPhotos.ts`); credits at `/credits`.
