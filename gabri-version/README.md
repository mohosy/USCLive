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

## Security notes (for the "securely" part of the rubric)
- All flyer/email/web text is passed to Claude as delimited untrusted data; system prompts forbid following instructions inside it.
- Structured outputs + zod re-validation; building ids constrained to an enum; hallucinated event ids dropped.
- Privacy: attendee lists never leave the server (only friends by name + counts); invite-only events filtered server-side; crowd data is aggregated with a k=5 threshold.
- Scraper only fetches `https://*.usc.edu`; iCal import blocks localhost/IPs (SSRF guard).

## Demo data
All people, orgs and events are fictional and generated relative to "now" (`src/lib/seed.ts`). Building coordinates are approximate.
In-memory store — resets when the server restarts.
Event photos on the map are freely licensed (Creative Commons / public domain) from Wikimedia Commons, matched to events by what they are (`src/lib/eventPhotos.ts`); credits at `/credits`.
