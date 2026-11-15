import { scanInbox } from "@/lib/ai";
import { BUILDING_BY_ID, INTERSECTIONS } from "@/lib/campus";
import { toIso } from "@/lib/http";
import { addNotification, currentUserId, db, getMe, newId } from "@/lib/store";
import { fetchGmailItems } from "@/lib/google";
import type { CampusEvent, InboxItem, Notification } from "@/lib/types";
import { withState } from "@/lib/state";

/**
 * Scan an inbox with the AI: the demo inbox (seeded Gmail / Brightspace / Calendar items), or with
 * { source: "gmail" } the student's real Gmail (read-only). Real email is never stored: it is scanned in
 * this request, only message ids are remembered, and what it finds goes to that student only.
 */
async function POST_(req: Request) {
  const d = db();
  const me = getMe();
  const body = (await req.json().catch(() => ({}))) as { source?: string };
  const real = body.source === "gmail";
  let pending: InboxItem[];
  if (real) {
    try { pending = (await fetchGmailItems()).filter((i) => !d.scannedInbox.includes(i.id)); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    if (!pending.length) return Response.json({ results: [], created: [], items: [], ai: false, message: "No new email from the past week." });
  } else {
    pending = d.inbox.filter((i) => !d.scannedInbox.includes(i.id));
    if (!pending.length) return Response.json({ results: [], created: [], ai: false, message: "Inbox already scanned" });
  }
  // real email: what it finds is yours alone (the demo inbox is shared by everyone trying the demo)
  const uid = currentUserId();
  const notify = (n: Parameters<typeof addNotification>[0]) => addNotification(real ? { ...n, userId: uid } : n);

  const res = await scanInbox(pending);
  const created: Notification[] = [];
  const addedEvents: string[] = [];

  for (const r of res.data.items) {
    const item = pending.find((p) => p.id === r.inboxId);
    if (!item) continue;
    d.scannedInbox.push(item.id);
    const src = item.source;

    if (r.kind === "phishing") {
      created.push(notify({ kind: "system", title: " Phishing email detected", body: `"${item.subject}" from ${item.from} — don't click or enter your password.`, source: src }));
      continue;
    }
    if (r.kind === "safety" && r.safety) {
      const spot = INTERSECTIONS.find((x) => x.id === r.safety!.intersectionId) ?? (r.buildingId !== "unknown" ? BUILDING_BY_ID[r.buildingId] : undefined);
      if (spot) {
        const now = Date.now();
        const alert = {
          id: newId("al"), kind: "crime" as const, severity: "high" as const, title: r.safety.title, advice: r.safety.advice,
          locationText: "name" in spot ? spot.name : "", lat: spot.lat, lng: spot.lng, radiusM: 100,
          createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 90 * 60_000).toISOString(), source: "dps_email" as const, resolved: false,
        };
        d.alerts.push(alert);
        created.push(notify({ kind: "safety", title: `DPS: ${alert.title}`, body: `${alert.locationText} · ${alert.advice}`, alertId: alert.id, source: src }));
      } else {
        created.push(notify({ kind: "safety", title: `DPS: ${r.safety.title}`, body: r.safety.advice, source: src }));
      }
      continue;
    }
    if (r.kind === "deadline") {
      created.push(notify({ kind: "deadline", title: r.title, body: r.summary, dueAt: toIso(r.dueAt) ?? undefined, source: src }));
      continue;
    }
    if ((r.kind === "event" || r.kind === "invite") && r.start && r.buildingId !== "unknown") {
      const start = toIso(r.start)!;
      const end = toIso(r.end) ?? new Date(+new Date(start) + 90 * 60_000).toISOString();
      // already on the map? link instead of duplicating
      const existing = d.events.find((e) => e.buildingId === r.buildingId && Math.abs(+new Date(e.start) - +new Date(start)) < 45 * 60_000);
      let eventId = existing?.id;
      if (!existing) {
        const ev: CampusEvent = {
          id: newId("ev"), title: r.title, description: r.summary, category: r.course ? "academic" : "student", buildingId: r.buildingId,
          room: r.room ?? undefined, start, end, host: { kind: "user", name: item.from }, visibility: "invite", schools: ["all"],
          course: r.course ?? undefined, invitees: [me.id], attendees: [], freeFood: r.freeFood, foodDetail: r.foodDetail ?? undefined,
          tags: ["from-" + src], source: src === "gmail" ? "email" : src === "gcal" ? "calendar" : "brightspace",
          moderation: { status: "approved", reasons: [], riskScore: 0.05, checkedBy: res.ai ? "claude" : "rules" }, createdAt: new Date().toISOString(),
        };
        d.events.push(ev);
        eventId = ev.id;
        addedEvents.push(ev.id);
      }
      created.push(notify({
        kind: r.freeFood ? "food" : r.kind === "invite" ? "invite" : "event",
        title: r.title, body: `${r.summary} · ${BUILDING_BY_ID[r.buildingId]?.name ?? ""}`, eventId, buildingId: r.buildingId, source: src,
      }));
      continue;
    }
    if (r.kind === "event" || r.kind === "invite" || r.kind === "announcement")
      created.push(notify({ kind: r.kind === "invite" ? "invite" : "event", title: r.title, body: r.summary, source: src, dueAt: toIso(r.start) ?? undefined }));
  }

  // real email: send back just what the list needs (subject, sender, date), never stored anywhere
  const items = real ? pending.map(({ id, source, from, subject, receivedAt }) => ({ id, source, from, subject, receivedAt, body: "", scanned: true })) : undefined;
  return Response.json({ results: res.data.items, created, addedEvents, items, ai: res.ai, error: res.error });
}

export const POST = withState(POST_);
