"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { BUILDINGS, CATEGORY_META, EVENT_TYPES, SCHOOLS } from "@/lib/campus";
import { api, type AppState, type EventView } from "@/lib/client-types";
import type { ExtractedEventT, ModerationT } from "@/lib/ai";
import type { Moderation } from "@/lib/types";
import { Button, Field, Modal, cx, inputCls } from "./ui";

type Step = "source" | "form" | "result";
type Form = {
  title: string; description: string; category: string; buildingId: string; room: string; start: string; end: string;
  visibility: "public" | "school" | "open" | "invite"; schools: string[]; course: string; invitees: string[]; capacity: string;
  freeFood: boolean; foodDetail: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function blank(): Form {
  const s = new Date(Date.now() + 60 * 60_000); s.setMinutes(0, 0, 0);
  return { title: "", description: "", category: "student", buildingId: "tcc", room: "", start: local(s), end: local(new Date(+s + 90 * 60_000)), visibility: "public", schools: ["all"], course: "", invitees: [], capacity: "", freeFood: false, foodDetail: "" };
}

const SAMPLES = [
  "Pickup soccer tonight 7pm at Cromwell Field, need 6 more, all levels, bring water",
  "FBE 403 study session tomorrow 4-6pm in JFF 102, going over the practice midterm. I'll bring Insomnia cookies",
  "tiehub: Founders fireside chat Thursday 6:30pm, RTH 526. Free Raising Cane's for the first 80 people",
];

async function fileToJpegBase64(file: File): Promise<{ data: string; mediaType: "image/jpeg"; preview: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const preview = c.toDataURL("image/jpeg", 0.85);
  URL.revokeObjectURL(url);
  return { data: preview.split(",")[1], mediaType: "image/jpeg", preview };
}

const VIS = [["public", "Everyone"], ["school", "My school"], ["open", "Open invite"], ["invite", "Invite only"]] as const;

export default function AddEventModal({ open, onClose, state, onCreated, asOrg }: {
  open: boolean; onClose: () => void; state: AppState; onCreated: (e: EventView) => void; asOrg?: { id: string; name: string };
}) {
  const [step, setStep] = useState<Step>("source");
  // anyone can make an event; campus-wide ("Everyone") is for clubs and departments (creator accounts)
  const creator = state.me.accountType === "creator";
  const [mode, setMode] = useState<"text" | "flyer">("text");
  const [text, setText] = useState("");
  const [img, setImg] = useState<{ data: string; mediaType: "image/jpeg"; preview: string } | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const vis = !creator && form.visibility === "public" ? "open" : form.visibility;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<ModerationT | null>(null);
  const [result, setResult] = useState<{ event: EventView; moderation: Moderation } | null>(null);
  const [fromFlyer, setFromFlyer] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep("source"); setText(""); setImg(null); setForm(blank()); setErr(null); setResult(null); setPrecheck(null); setFromFlyer(false); };
  const close = () => { reset(); onClose(); };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function extract() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ draft: ExtractedEventT; precheck: ModerationT }>("/api/ai/extract", { json: mode === "flyer" && img ? { image: { data: img.data, mediaType: img.mediaType }, text: text || undefined } : { text } });
      const d = r.draft;
      if (!d.isEvent) { setErr("This doesn't look like an event. Try another image or fill it in manually."); setBusy(false); return; }
      setForm({
        title: d.title, description: d.description, category: d.category, buildingId: d.buildingId === "unknown" ? "tcc" : d.buildingId, room: d.room ?? "",
        start: d.start.slice(0, 16), end: d.end.slice(0, 16), visibility: d.course ? "open" : "public", schools: d.schools.length ? d.schools : ["all"],
        course: d.course ?? "", invitees: [], capacity: "", freeFood: d.freeFood, foodDetail: d.foodDetail ?? "",
      });
      setPrecheck(r.precheck); setFromFlyer(true);
      setStep("form");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ event: EventView; moderation: Moderation }>("/api/events", {
        json: {
          title: form.title, description: form.description, category: form.category, buildingId: form.buildingId, room: form.room || null,
          start: form.start, end: form.end, visibility: vis, schools: form.schools, course: form.course || null,
          invitees: form.invitees, capacity: form.capacity ? Number(form.capacity) : null, freeFood: form.freeFood || undefined, foodDetail: form.foodDetail || null,
          hostAs: asOrg ? "org" : "me", orgId: asOrg?.id ?? null, source: fromFlyer ? "flyer" : "user",
        },
      });
      setResult(r); setStep("result");
      if (r.moderation.status === "approved") onCreated(r.event);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Modal open={open} onClose={close} title={asOrg ? `New event for ${asOrg.name}` : "New event"} wide>
      {step === "source" && (
        <div className="space-y-4">
          <div className="flex rounded-lg border border-line p-0.5 text-sm">
            {(["text", "flyer"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("flex-1 rounded-md py-1.5 font-medium", mode === m ? "bg-surface" : "text-muted")}>
                {m === "text" ? "Paste text" : "Upload flyer"}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{mode === "text" ? "Paste an Instagram caption, group chat message or email. We'll fill in the details." : "Upload a photo or screenshot of a flyer. We'll read it and fill in the details."}</p>
          {mode === "flyer" && (
            <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImg(await fileToJpegBase64(f)); }}
              className="flex min-h-40 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4 hover:border-foreground/30">
              {img ? <img src={img.preview} alt="Flyer preview" className="max-h-64 rounded" /> : <div className="flex flex-col items-center gap-2 text-sm text-muted"><ImagePlus size={20} />Drop an image or click to upload</div>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await fileToJpegBase64(f)); }} />
            </div>
          )}
          <textarea className={cx(inputCls, "min-h-28")} placeholder={mode === "flyer" ? "Optional extra context" : "Event text"} value={text} onChange={(e) => setText(e.target.value)} />
          {mode === "text" && (
            <div className="space-y-1">
              <div className="text-xs text-muted">Examples</div>
              {SAMPLES.map((s, i) => <button key={i} onClick={() => setText(s)} className="block w-full truncate text-left text-xs text-foreground/70 hover:text-foreground">{s}</button>)}
            </div>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => { setFromFlyer(false); setStep("form"); }}>Fill in manually</Button>
            <Button disabled={busy || (mode === "text" ? text.trim().length < 5 : !img)} onClick={extract}>{busy ? "Reading..." : "Continue"}</Button>
          </div>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {precheck && precheck.status !== "approved" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This may not pass review: {precheck.reasons[0]}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="Description"><textarea className={cx(inputCls, "min-h-20")} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {EVENT_TYPES.map((k) => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
              </select>
            </Field>
            <Field label="Building">
              <select className={inputCls} value={form.buildingId} onChange={(e) => set("buildingId", e.target.value)}>
                {BUILDINGS.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </Field>
            <Field label="Starts"><input type="datetime-local" className={inputCls} value={form.start} onChange={(e) => set("start", e.target.value)} /></Field>
            <Field label="Ends"><input type="datetime-local" className={inputCls} value={form.end} onChange={(e) => set("end", e.target.value)} /></Field>
            <Field label="Room"><input className={inputCls} value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Optional" /></Field>
            <Field label="Class"><input className={inputCls} value={form.course} onChange={(e) => set("course", e.target.value)} placeholder="Optional, e.g. FBE 403" /></Field>
            <div className="col-span-2">
              <Field label="Visible to">
                <div className="flex rounded-lg border border-line p-0.5 text-sm">
                  {VIS.filter(([v]) => creator || v !== "public").map(([v, l]) => (
                    <button key={v} onClick={() => set("visibility", v)} className={cx("flex-1 rounded-md py-1.5 font-medium", vis === v ? "bg-surface" : "text-muted")}>{l}</button>
                  ))}
                </div>
              </Field>
            </div>
            {vis === "school" && (
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {SCHOOLS.filter((s) => s.id !== "all").map((s) => (
                  <button key={s.id} onClick={() => set("schools", toggle(form.schools.filter((x) => x !== "all"), s.id))}
                    className={cx("rounded-full border px-2.5 py-1 text-xs", form.schools.includes(s.id) ? "border-foreground bg-foreground text-white" : "border-line")}>{s.short}</button>
                ))}
              </div>
            )}
            {(vis === "invite" || vis === "open") && (
              <div className="col-span-2">
                <Field label={vis === "invite" ? "Invite" : "Notify friends (optional)"}>
                  <div className="flex flex-wrap gap-1.5">
                    {state.me.friends.map((f) => (
                      <button key={f.id} onClick={() => set("invitees", toggle(form.invitees, f.id))}
                        className={cx("rounded-full border px-2.5 py-1 text-xs", form.invitees.includes(f.id) ? "border-foreground bg-foreground text-white" : "border-line")}>{f.name}</button>
                    ))}
                  </div>
                </Field>
                {vis === "open" && form.course && <p className="mt-1.5 text-xs text-muted">Students in {form.course.toUpperCase()} will see this marked as their class.</p>}
              </div>
            )}
            <Field label="Capacity"><input type="number" className={inputCls} value={form.capacity} placeholder="Optional" onChange={(e) => set("capacity", e.target.value)} /></Field>
            <Field label="Free food">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.freeFood} onChange={() => set("freeFood", !form.freeFood)} className="h-4 w-4" />
                <input className={inputCls} disabled={!form.freeFood} value={form.foodDetail} placeholder="What food?" onChange={(e) => set("foodDetail", e.target.value)} />
              </div>
            </Field>
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep("source")}>Back</Button>
            <Button disabled={busy || form.title.length < 3} onClick={submit}>{busy ? "Checking..." : "Publish"}</Button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-3 py-4 text-center">
          <h3 className="text-lg font-semibold">
            {result.moderation.status === "approved" ? "Your event is on the map" : result.moderation.status === "flagged" ? "Your event is waiting for review" : "Your event was not published"}
          </h3>
          {result.moderation.status === "flagged" && <p className="text-sm text-muted">A USG reviewer will look at it before it goes live.</p>}
          {result.moderation.reasons.length > 0 && (
            <ul className="mx-auto max-w-md space-y-1 text-left text-sm text-muted">{result.moderation.reasons.map((r, i) => <li key={i}>- {r}</li>)}</ul>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="secondary" onClick={reset}>Add another</Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
