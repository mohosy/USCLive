"use client";

import { Check } from "lucide-react";
import type { UserPrefs } from "@/lib/types";
import { cx } from "../ui";

/** A change to any part of the settings. It saves straight away; there is no Save button for these. */
export type SavePrefs = (patch: { [K in keyof UserPrefs]?: Partial<UserPrefs[K]> }) => void;

export const PLUME_COLORS: Record<UserPrefs["trojan"]["plume"], string> = { cardinal: "#990000", gold: "#FFCC00", white: "#ffffff", black: "#1d1d1f" };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-3xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      <div className="mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, id, children }: { label: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium" id={id}>{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, onChange, labelledBy }: { on: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} onClick={() => onChange(!on)}
      className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-emerald-600" : "bg-line")}>
      <span className={cx("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform", on && "translate-x-4")} />
    </button>
  );
}

/** One of a few choices, as a segmented control. */
export function Segmented<T extends string>({ value, options, onChange, labelledBy }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; labelledBy: string }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface p-1 text-xs">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cx("h-7 rounded-full px-3 font-medium", value === k ? "bg-white text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground")}>{label}</button>
      ))}
    </div>
  );
}

/** Your Trojan, Privacy and Notifications: the three groups from the Settings design. */
export function PrefsCards({ prefs, save, firstName }: { prefs: UserPrefs; save: SavePrefs; firstName: string }) {
  const { trojan, privacy, notify } = prefs;
  return (
    <>
      <Section title="Your Trojan" note="How you look on your profile and on the map.">
        <Row label="Plume" id="pref-plume">
          <div role="group" aria-labelledby="pref-plume" className="flex shrink-0 gap-2">
            {(Object.keys(PLUME_COLORS) as UserPrefs["trojan"]["plume"][]).map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={trojan.plume === c} title={c[0].toUpperCase() + c.slice(1)} onClick={() => save({ trojan: { plume: c } })}
                className={cx("grid h-8 w-8 place-items-center rounded-full border", trojan.plume === c ? "border-foreground ring-2 ring-foreground/15" : "border-line")} style={{ background: PLUME_COLORS[c] }}>
                {trojan.plume === c && <Check size={14} aria-hidden="true" className={c === "white" || c === "gold" ? "text-foreground" : "text-white"} />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Cape" id="pref-cape">
          <Segmented labelledBy="pref-cape" value={trojan.cape} options={[["cardinal", "Cardinal"], ["gold", "Gold"]] as const} onChange={(cape) => save({ trojan: { cape } })} />
        </Row>
        <Row label="Jersey number" hint="0 to 99" id="pref-jersey">
          <input type="number" inputMode="numeric" min={0} max={99} aria-labelledby="pref-jersey" value={trojan.jersey}
            onChange={(e) => { const n = Math.round(Number(e.target.value)); if (e.target.value !== "" && n >= 0 && n <= 99) save({ trojan: { jersey: n } }); }}
            className="h-9 w-16 shrink-0 rounded-lg border border-line bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-foreground/40" />
        </Row>
      </Section>

      <Section title="Privacy" note="All off until you turn them on.">
        <Row label="Share my location with friends" hint="Only while the app is open" id="pref-loc">
          <Switch labelledBy="pref-loc" on={privacy.shareLocation} onChange={(shareLocation) => save({ privacy: { shareLocation } })} />
        </Row>
        <Row label="Show events I'm going to" hint={`Friends see "${firstName} is going"`} id="pref-going">
          <Switch labelledBy="pref-going" on={privacy.showGoing} onChange={(showGoing) => save({ privacy: { showGoing } })} />
        </Row>
        <Row label="Who can see my schedule" id="pref-sched">
          <Segmented labelledBy="pref-sched" value={privacy.schedule} options={[["nobody", "Nobody"], ["friends", "Friends"], ["all", "All"]] as const} onChange={(schedule) => save({ privacy: { schedule } })} />
        </Row>
      </Section>

      <Section title="Notifications">
        <Row label="Events I registered for" hint="20 min before, with walk time" id="pref-n-reg">
          <Switch labelledBy="pref-n-reg" on={notify.registered} onChange={(registered) => save({ notify: { registered } })} />
        </Row>
        <Row label="Registration deadlines" id="pref-n-dead">
          <Switch labelledBy="pref-n-dead" on={notify.deadlines} onChange={(deadlines) => save({ notify: { deadlines } })} />
        </Row>
        <Row label="Free food near me" id="pref-n-food">
          <Switch labelledBy="pref-n-food" on={notify.food} onChange={(food) => save({ notify: { food } })} />
        </Row>
        <Row label="DPS alerts near me" id="pref-n-dps">
          <Switch labelledBy="pref-n-dps" on={notify.safety} onChange={(safety) => save({ notify: { safety } })} />
        </Row>
      </Section>
    </>
  );
}
