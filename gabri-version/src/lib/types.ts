export type Category =
  | "social"
  | "sports"
  | "study"
  | "academic"
  | "career"
  | "club"
  | "arts"
  | "office_hours"
  | "class";

export type Visibility = "public" | "school" | "open" | "invite";

export type EventSource =
  | "seed"
  | "user"
  | "flyer"
  | "scrape"
  | "brightspace"
  | "email"
  | "calendar";

export type SchoolId =
  | "viterbi"
  | "marshall"
  | "dornsife"
  | "annenberg"
  | "sca"
  | "thornton"
  | "roski"
  | "price"
  | "iovine"
  | "all";

export type BuildingKind =
  | "library"
  | "classroom"
  | "dining"
  | "gym"
  | "field"
  | "student_center"
  | "housing"
  | "arena"
  | "outdoor"
  | "parking";

export interface Building {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  kind: BuildingKind;
  /** Typical headcount when "normal-busy". Used to scale hotspot counts. */
  capacity: number;
  /** extra buildings from OpenStreetMap: labeled and taggable, but no crowd tracking */
  minor?: boolean;
  studySpot?: { quiet: boolean; outlets: boolean; openLate: boolean; note: string };
}

export interface Moderation {
  status: "approved" | "flagged" | "rejected";
  reasons: string[];
  riskScore: number; // 0..1
  checkedBy: "claude" | "rules";
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  category: Category;
  buildingId: string;
  room?: string;
  start: string; // ISO
  end: string; // ISO
  host: { kind: "org" | "user" | "usc"; name: string; id?: string };
  visibility: Visibility;
  schools: SchoolId[];
  course?: string;
  invitees: string[];
  attendees: string[];
  capacity?: number;
  freeFood: boolean;
  foodDetail?: string;
  tags: string[];
  source: EventSource;
  moderation: Moderation;
  expectedTurnout?: number;
  createdAt: string;
  game?: GameInfo;
}

export interface ClassMeeting {
  code: string;
  title: string;
  buildingId: string;
  room: string;
  days: number[]; // 0=Sun..6=Sat
  start: string; // "10:00"
  end: string; // "11:50"
  officeHours?: { who: string; buildingId: string; room: string; days: number[]; start: string; end: string };
}

export interface User {
  id: string;
  name: string;
  avatar: string; // emoji
  school: SchoolId;
  year: string;
  major: string;
  friends: string[];
  classes: ClassMeeting[];
  interests: string[];
  orgs: string[];
}

export interface InboxItem {
  id: string;
  source: "gmail" | "brightspace" | "gcal";
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface Notification {
  id: string;
  kind: "event" | "deadline" | "invite" | "hotspot" | "friend" | "food" | "system" | "safety";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  eventId?: string;
  buildingId?: string;
  alertId?: string;
  source?: InboxItem["source"] | "live";
  dueAt?: string;
}

export interface Hotspot {
  buildingId: string;
  count: number; // estimated people now (aggregated, anonymized)
  baseline: number; // typical for this hour
  ratio: number; // count / baseline
  level: "quiet" | "normal" | "busy" | "packed";
  trend: "rising" | "falling" | "steady";
  suppressed: boolean; // k-anonymity: too few people to show
}

/** Live score for a game happening on/near campus (demo: simulated from the start time). */
export interface GameInfo {
  sport: "football" | "basketball" | "volleyball";
  home: string;
  away: string;
  /** points scored per minute of game clock, used to simulate a live score */
  homeRate: number;
  awayRate: number;
}

/** A DPS (Department of Public Safety) alert shown on the map until it expires or is resolved. */
export interface SafetyAlert {
  id: string;
  kind: "crime" | "suspicious" | "hazard" | "police_activity";
  severity: "high" | "medium" | "low";
  title: string; // e.g. "Suspicious activity reported"
  advice: string; // e.g. "Avoid Figueroa & 37th"
  locationText: string;
  lat: number;
  lng: number;
  radiusM: number;
  createdAt: string;
  expiresAt: string;
  source: "dps" | "dps_email" | "dps_log";
  resolved: boolean;
  /** from the DPS Daily Crime Log */
  caseNo?: string;
  disposition?: string;
}

export interface Org {
  id: string;
  name: string;
  school: SchoolId;
  kind: "club" | "usg" | "department";
  members: number;
}
