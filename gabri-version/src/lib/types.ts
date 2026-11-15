/**
 * Event types. Sports, Career and Academic are sorted by what the event is;
 * everything else by who runs it (USC, students, or an outside organizer).
 * "class" is only used for the personal schedule.
 */
export type Category =
  | "sports_play" // pickup, intramurals, rec classes: join
  | "sports_watch" // USC Athletics games: tickets + live score
  | "career"
  | "academic" // study sessions, reviews, office hours
  | "usc" // run by USC: concerts, talks, exhibits, festivals, USG
  | "student" // run by students or student orgs
  | "community" // non-USC organizers
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

/**
 * How people sign up for an event.
 * - native: one tap in USCLive (capacity, waitlist and deadline are enforced here)
 * - handshake / engage / external: sign-up happens on the official page; USCLive only opens it
 *   and can record "I registered" when the student says so. It never registers anyone there.
 */
export type RegistrationType = "native" | "handshake" | "engage" | "external";
export type RegistrationStatus = "registered" | "waitlisted" | "self-reported" | "cancelled";

/** One per person per event. Cancelling keeps the record (status "cancelled") so re-registering reuses it. */
export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  /** when this person last joined the list (registered, waitlisted or self-reported): the waitlist order */
  createdAt: string;
  updatedAt: string;
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
  host: { kind: "org" | "user" | "usc" | "external"; name: string; id?: string };
  /** where the main button goes for tickets / outside registration */
  link?: { url: string; label: string };
  visibility: Visibility;
  schools: SchoolId[];
  course?: string;
  invitees: string[];
  attendees: string[];
  capacity?: number;
  /** set = this event takes registrations (see RegistrationType); unset = the plain RSVP / Join toggle */
  registrationType?: RegistrationType;
  /** ISO time after which registration is closed */
  registrationDeadline?: string;
  /** handshake / engage / external: the official sign-up page. native: the original listing, shown as "Official page" */
  registrationUrl?: string;
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

/** student: browse, RSVP, join. creator: everything a student can do, plus post events. */
export type AccountType = "student" | "creator";

export interface User {
  id: string;
  name: string;
  avatar: string; // initials
  school: SchoolId;
  year: string;
  major: string;
  friends: string[];
  classes: ClassMeeting[];
  interests: string[];
  orgs: string[];
  // account + profile (set at sign-in / in Settings)
  /** unique @handle (lowercase), how friends find each other */
  username?: string;
  email?: string;
  /** school/major come from the (demo) USC directory rather than what the student typed */
  verified?: boolean;
  /** signed up with Google: only Google sign-in can open this account (typing the email can't) */
  googleAccount?: boolean;
  accountType?: AccountType;
  /** org a creator posts for (one of ORGS), or undefined = posts as themselves */
  creatorOrgId?: string;
  pronouns?: string;
  bio?: string;
  /** small square JPEG/PNG/WebP data URL */
  photo?: string;
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
  /** personal notifications (your calendar, your invites); unset = for everyone (campus-wide) */
  userId?: string;
  /** campus-wide notifications: who has read them (personal ones use `read`) */
  readBy?: string[];
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
