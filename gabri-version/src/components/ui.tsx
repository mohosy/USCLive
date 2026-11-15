"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { CATEGORY_META } from "@/lib/campus";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-foreground bg-foreground text-white" : "border-line bg-white text-foreground hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

export function CatLabel({ category }: { category: string }) {
  const m = CATEGORY_META[category] ?? CATEGORY_META.student;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "food" | "live" | "class" | "private" | "open" | "closing" }) {
  const t = {
    neutral: "bg-surface text-foreground",
    food: "bg-amber-50 text-amber-800",
    live: "bg-red-50 text-red-700",
    class: "bg-blue-50 text-blue-700",
    private: "bg-violet-50 text-violet-700",
    open: "bg-emerald-50 text-emerald-700",
    closing: "bg-cardinal/10 text-cardinal", // registration closes within 48 hours
  }[tone];
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

export function Button({ children, onClick, variant = "primary", disabled, className, type = "button", title }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string;
}) {
  const v = {
    primary: "bg-cardinal text-white hover:bg-cardinal-hover",
    secondary: "border border-line bg-white text-foreground hover:bg-surface",
    ghost: "text-foreground hover:bg-surface",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40", v, className)}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onMouseDown={onClose}>
      <div className={cx("fade-in flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-xl")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-[15px] font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export const LEVEL_COLOR: Record<string, string> = { quiet: "#16a34a", normal: "#ca8a04", busy: "#ea580c", packed: "#dc2626" };

export function LevelDot({ level }: { level: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[level] ?? "#999" }} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      {children}
    </label>
  );
}

export function Avatar({ initials, size = 24, photo }: { initials: string; size?: number; photo?: string | null }) {
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-semibold text-foreground ring-2 ring-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

/** "Student" / "Student Creator" pill. */
export function AccountBadge({ type, className }: { type?: "student" | "creator"; className?: string }) {
  return type === "creator" ? (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900", className)}>✦ Student Creator</span>
  ) : (
    <span className={cx("inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted", className)}>Student</span>
  );
}

export const inputCls = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-foreground/40";
