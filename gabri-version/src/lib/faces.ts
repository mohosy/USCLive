/**
 * Demo faces for the fictional students: AI-generated portraits (this-person-does-not-exist.com, StyleGAN), not
 * photos of real people. Stored under /public/img/people.
 */
import type { User } from "./types";

const FACES = new Set(["u_priya", "u_jordan", "u_maya", "u_ethan", "u_sofia", "u_kai", "u_leah", "u_ryan", "u_ava", "u_diego", "u_hannah", "u_omar", "u_zoe", "u_marcus", "u_nina"]);

export function withFaces(users: User[]) {
  for (const u of users) if (FACES.has(u.id) && !u.photo) u.photo = `/img/people/${u.id}.jpg`;
  return users;
}
