/** Student orgs and departments. Kept apart from the demo seed so browser code can import it without the seed data. */
import type { Org } from "./types";

export const ORGS: Org[] = [
  { id: "org_usg", name: "Undergraduate Student Government", school: "all", kind: "usg", members: 60 },
  { id: "org_startup", name: "Viterbi Startup Garage", school: "viterbi", kind: "club", members: 140 },
  { id: "org_boba", name: "Trojan Boba Society", school: "all", kind: "club", members: 220 },
  { id: "org_finance", name: "Marshall Finance & Investing Club", school: "marshall", kind: "club", members: 180 },
  { id: "org_jazz", name: "Thornton Jazz Collective", school: "thornton", kind: "club", members: 45 },
  { id: "org_dt", name: "Student Newsroom Collective", school: "annenberg", kind: "club", members: 90 },
  { id: "org_career", name: "Career Center", school: "all", kind: "department", members: 0 },
  { id: "org_hacksc", name: "HackSC", school: "all", kind: "club", members: 320 },
];
