"use client";

import { BookOpen, Briefcase, Check, ChevronRight, History, Megaphone, Pencil, QrCode, Settings, Trophy, UserPlus, Users, Utensils, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SCHOOLS } from "@/lib/campus";
import { fmtTime, fmtWhen, type EventView } from "@/lib/client-types";
import { tileFor } from "@/lib/eventList";
import FindFriends from "../FindFriends";
import { Avatar, Button, CatLabel, Tag, cx } from "../ui";
import AccountShell from "./AccountShell";
import ShareQr from "./ShareQr";
import TrojanAvatar from "./TrojanAvatar";
import { useAccount } from "./useAccount";

type Data = NonNullable<ReturnType<typeof useAccount>["data"]>;
type Tab = "past" | "hosting";

const card = "rounded-3xl border border-line bg-white";
const cardTitle = "text-sm font-medium text-muted";

/** The tile on the left of each event row, same colors and icons as the map's list. */
const TILE: Record<ReturnType<typeof tileFor>["kind"], { bg: string; icon: LucideIcon }> = {
  sports: { bg: "#2f9e58", icon: Trophy },
  club: { bg: "#7a52d6", icon: Users },
  food: { bg: "#e87a2a", icon: Utensils },
  academic: { bg: "#2f6fde", icon: BookOpen },
  career: { bg: "#990000", icon: Briefcase },
};

export default function ProfilePage() {
  const { data, status, reload } = useAccount();
  const [finding, setFinding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const settingsLink = (
    <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground">
      <Settings size={15} /> Settings
    </Link>
  );

  return (
    <AccountShell status={status} right={settingsLink}>
      {data && <Profile data={data} onFind={() => setFinding(true)} onShare={() => setSharing(true)} />}
      {finding && <FindFriends me={data?.profile.username} onClose={() => setFinding(false)} onChanged={() => { void reload(); }} />}
      {sharing && data && <ShareQr username={data.profile.username} onClose={() => setSharing(false)} />}
    </AccountShell>
  );
}

function Profile({ data, onFind, onShare }: { data: Data; onFind: () => void; onShare: () => void }) {
  const p = data.profile;
  const school = SCHOOLS.find((s) => s.id === p.school)?.name ?? p.school;
  const clubs = p.clubs ?? [];
  const interests = p.interests ?? [];
  const showGoing = p.prefs?.privacy?.showGoing ?? false;
  const goingThisWeek = data.goingThisWeek ?? data.upcoming.length;
  const line = [school, p.major, p.year].filter(Boolean).join(" · ");

  return (
    <div className="fade-in space-y-4">
      <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Profile · what other Trojans see</div>

      {/* header */}
      <section className={cx(card, "p-5")}>
        <div className="flex min-w-0 items-center gap-4">
          <TrojanAvatar look={p.prefs?.trojan} size={104} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">
              {p.name}
              {p.pronouns && <span className="ml-2 align-middle text-sm font-normal text-muted">{p.pronouns}</span>}
            </h1>
            {p.username && <div className="truncate text-[15px] text-muted">@{p.username}</div>}
            {line && <div className="mt-0.5 text-sm text-foreground/80">{line}</div>}
            {p.verified && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Check size={13} /> Verified USC student
              </span>
            )}
          </div>
        </div>
        {p.bio && <p className="mt-3 text-[15px] leading-relaxed">{p.bio}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/settings" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cardinal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cardinal-hover">
            <Pencil size={14} /> Edit profile
          </Link>
          <Button variant="secondary" onClick={onShare}><QrCode size={15} /> Share · QR</Button>
          <Button variant="secondary" onClick={onFind} className="col-span-2"><UserPlus size={15} /> Add friends</Button>
        </div>
      </section>

      {/* stats */}
      <section className={cx(card, "grid grid-cols-3 text-center")}>
        <Stat n={p.friendsCount} label="Friends" onClick={onFind} />
        <Stat n={goingThisWeek} label="Going this week" />
        <Stat n={clubs.length} label="Clubs" />
      </section>

      {interests.length > 0 && (
        <section className={cx(card, "p-5")}>
          <div className={cardTitle}>Interests</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {interests.map((i) => <span key={i} className="rounded-full bg-cardinal px-3 py-1 text-sm font-medium text-white">{i}</span>)}
          </div>
        </section>
      )}

      {/* events I'm going to */}
      <section className={cx(card, "p-5")}>
        <div className={cardTitle}>{showGoing ? "Going to · visible to friends" : "Going to · only you can see this"}</div>
        {!showGoing && <p className="mt-1 text-xs text-muted">Turn on &quot;Show events I&apos;m going to&quot; in Settings to share these with friends.</p>}
        {data.upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Register for something on the map.</p>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {data.upcoming.slice(0, 5).map((e) => <GoingRow key={e.id} e={e} />)}
          </div>
        )}
      </section>

      <section className={cx(card, "p-5")}>
        <div className="flex items-center justify-between gap-3">
          <div className={cardTitle}>Friends · {(data.friends ?? []).length}</div>
          <button type="button" onClick={onFind} className="text-sm font-medium text-cardinal hover:underline">Add friends</button>
        </div>
        {(data.friends ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">No friends yet. Search by name or @username, or share your QR code.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {(data.friends ?? []).slice(0, 8).map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <Avatar initials={f.avatar} photo={f.photo} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="truncate text-xs text-muted">@{f.username}{f.shared ? ` · ${f.shared}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clubs.length > 0 && (
        <section className={cx(card, "p-5")}>
          <div className={cardTitle}>Clubs</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {clubs.map((c) => <ClubPill key={c.id} name={c.name} logo={c.logo} />)}
          </div>
        </section>
      )}

      <PastAndHosting data={data} />
    </div>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-2xl font-bold tracking-tight">{n}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{label}</div>
    </>
  );
  return onClick
    ? <button onClick={onClick} title="See and find friends" className="min-w-0 rounded-3xl px-2 py-4 transition-colors hover:bg-surface">{inner}</button>
    : <div className="min-w-0 px-2 py-4">{inner}</div>;
}

function GoingRow({ e }: { e: EventView }) {
  const { bg, icon: Icon } = TILE[tileFor(e).kind];
  const friends = e.friendsGoing.map((f) => f.name.split(" ")[0]);
  const meta = [
    fmtWhen(e.start, e.end),
    e.buildingCode,
    e.registration?.status === "registered" ? "Registered" : null,
    friends.length ? `with ${friends.join(", ")}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Link href={`/?event=${e.id}`} title="Show on the map" className="flex min-w-0 items-center gap-3 py-2.5 hover:opacity-80">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: bg }}>
        <Icon size={19} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">{e.title}</div>
        <div className="truncate text-[13px] leading-snug text-muted">{meta}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}

function ClubPill({ name, logo }: { name: string; logo?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={16} height={16} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-4 w-4 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded bg-cardinal" />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Past events, and for creators the events they host. */
function PastAndHosting({ data }: { data: Data }) {
  const creator = data.profile.accountType === "creator";
  const [tab, setTab] = useState<Tab>("past");
  const tabs: { id: Tab; label: string; icon: React.ReactNode; items: EventView[] }[] = [
    { id: "past", label: "Past", icon: <History size={15} />, items: data.past },
    ...(creator ? [{ id: "hosting" as const, label: "Hosting", icon: <Megaphone size={15} />, items: data.hosting }] : []),
  ];
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <section className="pt-2">
      <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors", active.id === t.id ? "bg-foreground text-white" : "text-muted hover:text-foreground")}>
            {t.icon} {t.label} <span className={cx("text-xs", active.id === t.id ? "text-white/70" : "text-muted")}>{t.items.length}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2.5">
        {active.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-8 text-center text-sm text-muted">
            {active.id === "past" ? "Events you go to will be saved here." : "You haven't posted an event yet."}
          </div>
        ) : (
          active.items.map((e) => <PastCard key={e.id} e={e} mode={active.id} />)
        )}
      </div>
    </section>
  );
}

function PastCard({ e, mode }: { e: EventView; mode: Tab }) {
  const status = e.moderation?.status;
  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <CatLabel category={e.category} />
        {mode === "past" && <Tag tone="open">Attended</Tag>}
        {mode === "hosting" && status && status !== "approved" && <Tag tone="private">{status === "flagged" ? "Under review" : "Not published"}</Tag>}
        {mode === "hosting" && status === "approved" && <Tag tone="open">Published</Tag>}
      </div>
      <div className="mt-1 truncate text-[15px] font-semibold">{e.title}</div>
      <div className="truncate text-sm text-muted">
        {new Date(e.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtTime(e.start)} · {e.buildingName}
      </div>
    </div>
  );
  const cls = "flex gap-4 rounded-2xl border border-line bg-white p-3.5";
  return mode === "past" ? <div className={cls}>{body}</div> : <Link href={`/?event=${e.id}`} className={cx(cls, "hover:shadow-md")}>{body}</Link>;
}
