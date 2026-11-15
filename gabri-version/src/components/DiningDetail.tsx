"use client";

import { ArrowLeft, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { walkMinutes } from "@/lib/campus";
import { api, type Hotspot, type Loc } from "@/lib/client-types";
import { DINING_HALLS, laDate, type DiningPayload, type DietTag, type HallId, type HallMenu, type MealId, type MenuItem } from "@/lib/dining";
import { Button, Chip, LevelDot, Tag, cx } from "./ui";

const DIETS: { id: DietTag; label: string }[] = [
  { id: "vegan", label: "Vegan" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "gluten-free", label: "Gluten-free" },
  { id: "halal", label: "Halal" },
];

/** The day after a YYYY-MM-DD. */
function nextDay(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Tags to show on a dish: a vegan dish says "Vegan", not also "Vegetarian". */
function shownTags(it: MenuItem) {
  return DIETS.filter((d) => it.tags.includes(d.id) && !(d.id === "vegetarian" && it.tags.includes("vegan")));
}

/** Menu, hours and directions for one dining hall. Shown in the side panel instead of the building view. */
export function DiningDetail({ hall, loc, now, hotspot, onClose, onWalk }: {
  hall: HallId; loc: Loc; now: Date; hotspot?: Hotspot; onClose: () => void; onWalk?: (buildingId: string) => void;
}) {
  const info = DINING_HALLS[hall];
  const today = laDate(+now);
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const date = day === "today" ? today : nextDay(today);
  const key = `${hall}|${date}`;

  const [res, setRes] = useState<{ key: string; menu: HallMenu | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  // a slower answer for another hall or day must not overwrite the current one
  useEffect(() => {
    let current = true;
    api<DiningPayload>(`/api/dining/menu?hall=${hall}&date=${date}`)
      .then((d) => { if (current) setRes({ key, menu: d.halls.find((h) => h.hall === hall) ?? null, failed: false }); })
      .catch(() => { if (current) setRes({ key, menu: null, failed: true }); });
    return () => { current = false; };
  }, [hall, date, key, retry]);
  const mine = res?.key === key ? res : null; // never show another day's menu
  const menu = mine?.menu ?? null;

  // the meal being served is picked by default, and again when the day changes
  const [pick, setPick] = useState<{ key: string; meal: MealId } | null>(null);
  const meal = menu?.meals.find((m) => m.id === (pick?.key === key ? pick.meal : menu.currentMeal)) ?? menu?.meals[0];

  const [diets, setDiets] = useState<DietTag[]>([]);
  const toggleDiet = (d: DietTag) => setDiets((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const stations = (meal?.stations ?? [])
    .map((s) => ({ ...s, items: diets.length ? s.items.filter((it) => !it.note && diets.every((d) => it.tags.includes(d))) : s.items }))
    .filter((s) => s.items.length);

  const h = hotspot;
  const there = loc.buildingId === info.buildingId;

  return (
    <div>
      <button onClick={onClose} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="text-xs font-medium text-muted">Dining hall</div>
      <h2 className="text-xl font-semibold">{info.name}</h2>
      {menu && <div className="mt-1 text-sm">{menu.hours.label}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        {h && <span className="inline-flex items-center gap-1.5 text-sm capitalize"><LevelDot level={h.level} />{h.suppressed ? "Very quiet" : h.level}</span>}
        <span className="text-sm text-muted">{walkMinutes(loc, info)} min walk</span>
        {onWalk && !there && (
          <Button variant="secondary" className="whitespace-nowrap !rounded-full !px-3 !py-1.5 !text-xs" onClick={() => onWalk(info.buildingId)}>
            <Navigation size={12} /> Directions
          </Button>
        )}
      </div>

      {/* which day */}
      <div className="mt-5 flex rounded-lg border border-line p-0.5" role="group" aria-label="Day">
        {(["today", "tomorrow"] as const).map((d) => (
          <button key={d} aria-pressed={day === d} onClick={() => setDay(d)} className={cx("flex-1 rounded-md py-1 text-xs font-medium", day === d ? "bg-surface text-foreground" : "text-muted hover:text-foreground")}>
            {d === "today" ? "Today" : "Tomorrow"}
          </button>
        ))}
      </div>

      {!mine ? (
        <div className="mt-4 space-y-2"><div className="skeleton h-8" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
      ) : mine.failed || !menu ? (
        <div className="mt-4 text-sm">
          <p className="text-muted">The menu could not be loaded.</p>
          <Button variant="secondary" className="mt-2" onClick={() => setRetry((n) => n + 1)}>Retry</Button>
        </div>
      ) : !menu.meals.length ? (
        <p className="mt-4 text-sm text-muted">No menu posted for this day.</p>
      ) : (
        <>
          {/* meals that day */}
          {menu.meals.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Meals">
              {menu.meals.map((m) => (
                <button key={m.id} role="tab" aria-selected={meal?.id === m.id} onClick={() => setPick({ key, meal: m.id })}
                  className={cx("rounded-md px-3 py-1 text-sm font-medium", meal?.id === m.id ? "bg-surface text-foreground" : "text-muted hover:text-foreground")}>
                  {m.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Dietary filters">
            {DIETS.map((d) => <Chip key={d.id} active={diets.includes(d.id)} onClick={() => toggleDiet(d.id)}>{d.label}</Chip>)}
          </div>

          <div className="mt-4 space-y-5" role="tabpanel">
            {stations.map((s, si) => (
              <section key={`${si}-${s.name}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name}</h3>
                {s.subtitle && <p className="text-xs text-muted">{s.subtitle}</p>}
                <ul className="mt-1.5 divide-y divide-line">
                  {s.items.map((it, i) => it.note ? (
                    <li key={i} className="py-1.5 text-xs text-muted">{it.name}</li>
                  ) : (
                    <li key={i} className="py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm">{it.name}</span>
                        {shownTags(it).map((t) => <Tag key={t.id}>{t.label}</Tag>)}
                      </div>
                      {it.allergens.length > 0 && <p className="mt-0.5 text-xs text-muted">Contains {it.allergens.join(", ")}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!stations.length && <p className="text-sm text-muted">Nothing on this menu matches those filters.</p>}
          </div>

          <p className="mt-6 text-xs text-muted">
            {menu.sourceLabel}{menu.source === "demo" ? ". The real menu could not be loaded." : ""}
          </p>
          <p className="mt-1 text-xs text-muted">Dietary tags come from the listed ingredients; cross-contact can happen.</p>
        </>
      )}
    </div>
  );
}
