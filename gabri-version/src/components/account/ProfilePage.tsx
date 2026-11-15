"use client";

import { BadgeCheck, CalendarDays, ChevronRight, GraduationCap, History, Megaphone, Pencil, Plus, Settings, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SCHOOLS } from "@/lib/campus";
import { fmtTime, isLive, type EventView } from "@/lib/client-types";
import FindFriends from "../FindFriends";
import { AccountBadge, Avatar, CatLabel, Tag, cx } from "../ui";
import AccountShell from "./AccountShell";
import { useAccount } from "./useAccount";

type Tab = "upcoming" | "past" | "hosting";

export default function ProfilePage() {
  const { data, status, reload } = useAccount();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [finding, setFinding] = useState(false);
  const settingsLink = (
    <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground">
      <Settings size={15} /> Settings
    </Link>
  );

  return (
    <AccountShell status={status} right={settingsLink}>
      {data && <Profile data={data} tab={tab} setTab={setTab} onFind={() => setFinding(true)} />}
      {finding && <FindFriends me={data?.profile.username} onClose={() => setFinding(false)} onChanged={() => { void reload(); }} />}
    </AccountShell>
  );
}

function Profile({ data, tab, setTab, onFind }: { data: NonNullable<ReturnType<typeof useAccount>["data"]>; tab: Tab; setTab: (t: Tab) => void; onFind: () => void }) {
  const p = data.profile;
  const creator = p.accountType === "creator";
  const school = SCHOOLS.find((s) => s.id === p.school)?.name ?? p.school;
  const tabs: { id: Tab; label: string; icon: React.ReactNode; items: EventView[] }[] = [
    { id: "upcoming", label: "Going", icon: <CalendarDays size={15} />, items: data.upcoming },
    { id: "past", label: "Past", icon: <History size={15} />, items: data.past },
    ...(creator ? [{ id: "hosting" as const, label: "Hosting", icon: <Megaphone size={15} />, items: data.hosting }] : []),
  ];
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <>
      <section className="fade-in overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="relative h-32 sm:h-36" style={{ background: "linear-gradient(115deg, #7a0000 0%, #990000 40%, #c0392b 70%, #ffcc00 135%)" }}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "18px 18px" }} />
        </div>
        <div className="px-5 pb-5 sm:px-7">
          <div className="relative z-10 -mt-12 flex items-end justify-between gap-3">
            <div className="rounded-full bg-white p-1 shadow-sm">
              <Avatar initials={p.avatar} photo={p.photo} size={104} />
            </div>
            <div className="flex gap-2 pb-1">
              <button onClick={onFind} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-surface">
                <UserPlus size={14} /> Find friends
              </button>
              <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-surface">
                <Pencil size={14} /> Edit profile
              </Link>
              {creator && (
                <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-cardinal px-3.5 py-2 text-sm font-medium text-white hover:bg-cardinal-hover max-sm:hidden">
                  <Plus size={14} /> Organizer tools
                </Link>
              )}
            </div>
          </div>

          <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight">
            {p.name}
            {p.pronouns && <span className="ml-2 align-middle text-base font-normal text-muted">{p.pronouns}</span>}
          </h1>
          {p.username && <div className="text-[15px] text-muted">@{p.username}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <AccountBadge type={p.accountType} />
            {creator && <span>Posts for {p.creatorOrgName ?? "themselves"}</span>}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/80">
            <GraduationCap size={16} className="text-muted" />
            <span>{school}</span>
            {p.major && <><span className="text-muted">·</span><span>{p.major}</span></>}
            {p.year && <><span className="text-muted">·</span><span>{p.year}</span></>}
            {p.verified && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cardinal"><BadgeCheck size={13} /> Verified by USC</span>}
          </div>
          {p.bio ? (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed">{p.bio}</p>
          ) : (
            <Link href="/settings" className="mt-3 inline-block text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">Add a short bio</Link>
          )}
          {p.interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.interests.map((i) => <span key={i} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium">{i}</span>)}
            </div>
          )}
        </div>
        <div className={cx("grid border-t border-line text-center", creator ? "grid-cols-4" : "grid-cols-3")}>
          <Stat n={data.upcoming.length} label="Going" />
          <Stat n={data.past.length} label="Attended" />
          {creator && <Stat n={data.hosting.length} label="Hosting" />}
          <Stat n={p.friendsCount} label="Friends" icon={<Users size={12} />} onClick={onFind} />
        </div>
      </section>

      <section className="mt-6">
        <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors", active.id === t.id ? "bg-foreground text-white" : "text-muted hover:text-foreground")}>
              {t.icon} {t.label} <span className={cx("text-xs", active.id === t.id ? "text-white/70" : "text-muted")}>{t.items.length}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2.5">
          {active.items.length === 0 ? (
            <Empty tab={active.id} />
          ) : (
            active.items.map((e) => <EventCard key={e.id} e={e} mode={active.id} />)
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ n, label, icon, onClick }: { n: number; label: string; icon?: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-xl font-semibold tracking-tight">{n}</div>
      <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">{icon}{label}</div>
    </>
  );
  return onClick
    ? <button onClick={onClick} title="See and find friends" className="border-r border-line px-2 py-3.5 transition-colors last:border-r-0 hover:bg-surface">{inner}</button>
    : <div className="border-r border-line px-2 py-3.5 last:border-r-0">{inner}</div>;
}

function EventCard({ e, mode }: { e: EventView; mode: Tab }) {
  const d = new Date(e.start);
  const live = isLive(e);
  const past = mode === "past";
  const status = e.moderation?.status;
  const body = (
    <>
      <div className={cx("w-14 shrink-0 rounded-xl py-2 text-center", past ? "bg-surface text-muted" : "bg-cardinal/[0.07]")}>
        <div className={cx("text-[11px] font-semibold uppercase tracking-wide", past ? "" : "text-cardinal")}>{d.toLocaleDateString("en-US", { month: "short" })}</div>
        <div className="text-[22px] font-semibold leading-none tracking-tight text-foreground">{d.getDate()}</div>
        <div className="mt-0.5 text-[10px] text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CatLabel category={e.category} />
          {live && <Tag tone="live">Live now</Tag>}
          {e.freeFood && <Tag tone="food">Free food</Tag>}
          {past && <Tag tone="open">✓ Attended</Tag>}
          {mode === "hosting" && status && status !== "approved" && <Tag tone="private">{status === "flagged" ? "Under review" : "Not published"}</Tag>}
          {mode === "hosting" && status === "approved" && <Tag tone="open">Published</Tag>}
        </div>
        <div className="mt-1 truncate text-[15px] font-semibold">{e.title}</div>
        <div className="truncate text-sm text-muted">
          {fmtTime(e.start)} – {fmtTime(e.end)} · {e.buildingName}{e.room ? `, ${e.room}` : ""}
        </div>
        <div className="mt-1 text-xs text-muted">
          {e.attendeeCount} {past ? "went" : "going"}
          {e.friendsGoing.length > 0 && ` · ${e.friendsGoing.map((f) => f.name.split(" ")[0]).join(", ")}`}
          {e.host.kind !== "usc" && mode !== "hosting" && ` · hosted by ${e.host.name}`}
        </div>
      </div>
      {!past && <ChevronRight size={18} className="shrink-0 self-center text-muted transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  const cls = "group flex gap-4 rounded-2xl border border-line bg-white p-3.5 transition-shadow";
  return past ? <div className={cls}>{body}</div> : <Link href={`/?event=${e.id}`} className={cx(cls, "hover:shadow-md")} title="Show on the map">{body}</Link>;
}

function Empty({ tab }: { tab: Tab }) {
  const copy = {
    upcoming: { t: "No upcoming events yet", s: "RSVP to something on the map and it shows up here.", cta: "Find events", href: "/" },
    past: { t: "Nothing here yet", s: "Events you go to will be saved here.", cta: "Explore campus", href: "/" },
    hosting: { t: "You haven't posted an event yet", s: "Post your first event from the map's menu.", cta: "Post an event", href: "/" },
  }[tab];
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <div className="font-semibold">{copy.t}</div>
      <p className="mt-1 text-sm text-muted">{copy.s}</p>
      <Link href={copy.href} className="mt-4 inline-flex rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:bg-surface">{copy.cta}</Link>
    </div>
  );
}
