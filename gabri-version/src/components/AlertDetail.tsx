"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { SafetyAlert } from "@/lib/client-types";

const KIND: Record<SafetyAlert["kind"], string> = { crime: "Crime reported", suspicious: "Suspicious activity", hazard: "Hazard", police_activity: "Police activity" };

export default function AlertDetail({ alert, now, onClose }: { alert: SafetyAlert; now: Date; onClose: () => void }) {
  const mins = Math.max(0, Math.round((+now - +new Date(alert.createdAt)) / 60_000));
  const left = Math.max(0, Math.round((+new Date(alert.expiresAt) - +now) / 60_000));
  return (
    <div>
      <button onClick={onClose} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft size={14} /> Back</button>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700"><ShieldAlert size={14} /> DPS · {KIND[alert.kind]}</div>
      <h2 className="mt-1.5 text-xl font-semibold leading-tight">{alert.title}</h2>
      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{alert.advice}</p>
      <div className="mt-4 border-t border-line pt-2 text-sm">
        <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">Where</div><div>{alert.locationText}</div></div>
        <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">Reported</div><div>{new Date(alert.createdAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} ({mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`})</div></div>
        <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">Source</div><div>{alert.source === "dps_email" ? "DPS Trojans Alert email" : alert.source === "dps_log" ? <a className="underline" href="https://dps.usc.edu/alerts/log/" target="_blank" rel="noreferrer">DPS Daily Crime Log</a> : "USC Department of Public Safety"}</div></div>
        {alert.caseNo && <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">Case</div><div>#{alert.caseNo}</div></div>}
        {alert.disposition && <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">Status</div><div className="capitalize">{alert.disposition.toLowerCase()}</div></div>}
        <div className="flex gap-3 py-1.5"><div className="w-20 shrink-0 text-muted">On map</div><div>For {left > 120 ? `${Math.round(left / 60)} more hours` : `${left} more min`}, or until DPS clears it</div></div>
      </div>
      <p className="mt-4 text-sm text-muted">Need a walking escort? Call DPS at <a href="tel:2137404321" className="font-medium text-foreground underline">213-740-4321</a>. In an emergency call 911.</p>
    </div>
  );
}
