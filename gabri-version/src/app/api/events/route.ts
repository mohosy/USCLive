import { z } from "zod";
import { moderateEvent } from "@/lib/ai";
import { BUILDING_BY_ID } from "@/lib/campus";
import { body, safeExternalUrl, toIso } from "@/lib/http";
import { addNotification, db, getMe, newId, orgs, publicEvent } from "@/lib/store";
import type { CampusEvent } from "@/lib/types";
import { withState } from "@/lib/state";

const CreateEvent = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(["sports_play", "sports_watch", "career", "academic", "usc", "student", "community"]),
  buildingId: z.string().refine((id) => !!BUILDING_BY_ID[id], "Unknown building"),
  room: z.string().max(60).nullish(),
  start: z.string(),
  end: z.string(),
  visibility: z.enum(["public", "school", "open", "invite"]),
  schools: z.array(z.enum(["all", "viterbi", "marshall", "dornsife", "annenberg", "sca", "thornton", "roski", "price", "iovine"])).default(["all"]),
  course: z.string().max(20).nullish(),
  invitees: z.array(z.string()).max(200).default([]),
  capacity: z.number().int().positive().max(5000).nullish(),
  hostAs: z.enum(["me", "org"]).default("me"),
  orgId: z.string().nullish(),
  freeFood: z.boolean().optional(),
  foodDetail: z.string().max(80).nullish(),
  source: z.enum(["user", "flyer"]).default("user"),
  // registration (optional): native = one tap in USCLive; the others point at the official page
  registrationType: z.enum(["native", "handshake", "engage", "external"]).nullish(),
  registrationDeadline: z.string().max(40).nullish(),
  registrationUrl: z.string().trim().max(500).nullish(),
});

async function POST_(req: Request) {
  const parsed = await body(req, CreateEvent);
  if (!parsed.ok) return parsed.res;
  const input = parsed.data;
  const me = getMe();
  // any student can make an event (pickup games, study sessions, parties) for their school, an open invite
  // or invite-only; campus-wide "Everyone" posts and posting as an org are for creator accounts (clubs, departments)
  if (me.accountType !== "creator" && (input.visibility === "public" || input.hostAs === "org"))
    return Response.json({ error: "Campus-wide events come from clubs and departments. Share it with your school, as an open invite, or invite people." }, { status: 403 });
  const start = toIso(input.start);
  const end = toIso(input.end);
  if (!start || !end || +new Date(end) <= +new Date(start)) return Response.json({ error: "Invalid start/end time" }, { status: 400 });

  // registration settings: the link must be a public https page; the deadline cannot be after the event ends
  const regUrl = input.registrationUrl ? safeExternalUrl(input.registrationUrl)?.toString() ?? null : undefined;
  if (regUrl === null) return Response.json({ error: "The registration link must be a public https:// address." }, { status: 400 });
  if (input.registrationType && input.registrationType !== "native" && !regUrl) return Response.json({ error: "Add the link to the official registration page." }, { status: 400 });
  const regDeadline = input.registrationType && input.registrationDeadline ? toIso(input.registrationDeadline) : undefined;
  if (regDeadline === null) return Response.json({ error: "Invalid registration deadline" }, { status: 400 });
  if (regDeadline && +new Date(regDeadline) > +new Date(end)) return Response.json({ error: "The registration deadline can't be after the event ends." }, { status: 400 });

  const org = input.hostAs === "org" ? orgs().find((o) => o.id === input.orgId) : undefined;
  const host: CampusEvent["host"] = org ? { kind: "org", name: org.name, id: org.id } : { kind: "user", name: me.name, id: me.id };

  const mod = await moderateEvent({
    title: input.title, description: input.description, buildingName: BUILDING_BY_ID[input.buildingId].name,
    start, hostName: host.name, visibility: input.visibility,
  });

  const ev: CampusEvent = {
    id: newId("ev"),
    title: input.title,
    description: input.description,
    category: input.category,
    buildingId: input.buildingId,
    room: input.room ?? undefined,
    start, end,
    host,
    visibility: input.visibility,
    schools: input.schools.length ? input.schools : ["all"],
    course: input.course?.toUpperCase().replace(/^([A-Z]+)\s*(\d)/, "$1 $2") || undefined,
    invitees: input.invitees,
    attendees: input.registrationType ? [] : [me.id], // registration events start empty: the organizer is not a sign-up
    capacity: input.capacity ?? undefined,
    registrationType: input.registrationType ?? undefined,
    registrationDeadline: regDeadline ?? undefined,
    registrationUrl: input.registrationType ? regUrl ?? undefined : undefined,
    freeFood: input.freeFood ?? mod.data.freeFood,
    foodDetail: input.foodDetail ?? mod.data.foodDetail ?? undefined,
    tags: [],
    source: input.source,
    moderation: { status: mod.data.status, reasons: mod.data.reasons, riskScore: mod.data.riskScore, checkedBy: mod.ai ? "claude" : "rules" },
    expectedTurnout: input.capacity ? Math.round(input.capacity * 0.7) : undefined,
    createdAt: new Date().toISOString(),
  };
  db().events.push(ev);

  // what creating it means for people: the host hears back, each person invited gets their own invite (nobody else sees these)
  if (ev.moderation.status === "approved" && ev.invitees.length) {
    addNotification({ kind: "invite", title: `You sent ${ev.invitees.length} invite${ev.invitees.length > 1 ? "s" : ""}`, body: ev.title, eventId: ev.id, source: "live", userId: me.id });
    const when = new Date(start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
    for (const uid of ev.invitees)
      addNotification({ kind: "invite", title: `${me.name} invited you`, body: `${ev.title} · ${BUILDING_BY_ID[ev.buildingId]?.name ?? ""} · ${when}`, eventId: ev.id, buildingId: ev.buildingId, source: "live", userId: uid });
  }
  if (ev.moderation.status !== "approved")
    addNotification({ userId: me.id, kind: "system", title: ev.moderation.status === "rejected" ? "Your event was blocked" : "Your event is pending review", body: ev.moderation.reasons.join(" ·") ||"A USG reviewer will take a look.", eventId: ev.id, source: "live" });

  return Response.json({ event: publicEvent(ev, me), moderation: ev.moderation, ai: mod.ai });
}

export const POST = withState(POST_);
