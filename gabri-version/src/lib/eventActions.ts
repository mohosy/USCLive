/** The one main button for an event, picked from its type and who can join. */
import type { EventView } from "./client-types";

export type EventAction =
  | { kind: "link"; label: string; url: string } // tickets, Handshake, outside registration
  | { kind: "rsvp"; label: string } // RSVP / Join / Accept: toggles going
  | { kind: "leave"; label: string }
  | { kind: "full"; label: string };

export function primaryAction(e: EventView): EventAction {
  if (e.link) return { kind: "link", label: e.link.label, url: e.link.url };
  if (e.going) return { kind: "leave", label: "Going" };
  if (e.capacity != null && e.attendeeCount >= e.capacity) return { kind: "full", label: "Full" };
  if (e.visibility === "invite") return { kind: "rsvp", label: e.invited ? "Accept invite" : "Ask to join" };
  if (e.visibility === "open") {
    const left = e.capacity != null ? e.capacity - e.attendeeCount : null;
    return { kind: "rsvp", label: left != null && left <= 10 ? `Join · ${left} spot${left === 1 ? "" : "s"} left` : "Join" };
  }
  return { kind: "rsvp", label: "RSVP" };
}

export const HOST_LABEL: Record<EventView["host"]["kind"], string> = { usc: "USC", org: "Student org", user: "Student", external: "Not USC-run" };
