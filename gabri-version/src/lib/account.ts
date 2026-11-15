import { z } from "zod";
import { initialsOf, INTERESTS } from "./directory";
import { ORGS } from "./orgs";
import type { User } from "./types";

export const PRONOUNS = ["she/her", "he/him", "they/them", "she/they", "he/they"];

/** Profile fields a student can set themselves (school/major/year/email come from the USC directory). */
export const ProfileInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  pronouns: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(160).optional(),
  // small square image from the browser (resized client-side); null removes it
  photo: z
    .string()
    .max(400_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Photo must be a JPEG, PNG or WebP image")
    .nullable()
    .optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
  accountType: z.enum(["student", "creator"]).optional(),
  creatorOrgId: z.string().max(40).nullable().optional(),
});
export type ProfilePatch = z.infer<typeof ProfileInput>;

/** Apply validated profile fields to a user. Unknown orgs/interests are dropped, never trusted. */
export function applyProfile(u: User, p: ProfilePatch) {
  if (p.name !== undefined) {
    u.name = p.name;
    u.avatar = initialsOf(p.name);
  }
  if (p.pronouns !== undefined) u.pronouns = p.pronouns || undefined;
  if (p.bio !== undefined) u.bio = p.bio || undefined;
  if (p.photo !== undefined) u.photo = p.photo ?? undefined;
  if (p.interests !== undefined) u.interests = p.interests.filter((i) => INTERESTS.includes(i));
  if (p.accountType !== undefined) u.accountType = p.accountType;
  if (p.creatorOrgId !== undefined) u.creatorOrgId = p.creatorOrgId && ORGS.some((o) => o.id === p.creatorOrgId) ? p.creatorOrgId : undefined;
  if (u.accountType !== "creator") u.creatorOrgId = undefined;
}

/** Short stable hash of the photo, so its URL changes only when the photo does (lets the browser cache it). */
export function photoVersion(dataUrl: string) {
  let h = 0;
  for (let i = 0; i < dataUrl.length; i += 7) h = (h * 31 + dataUrl.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}${dataUrl.length.toString(36)}`;
}

export const isCreator = (u: User) => u.accountType === "creator";
export const creatorOrg = (u: User) => ORGS.find((o) => o.id === u.creatorOrgId);
