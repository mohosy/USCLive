"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-types";
import { normalizeUsername, usernameProblem, USERNAME_MAX } from "@/lib/username";
import { cx, inputCls } from "./ui";

export type UsernameStatus = { u: string; state: "empty" | "checking" | "ok" | "bad"; msg: string };

/** Format check right away, then asks the server if it's free (debounced). `current` = your own username. */
export function useUsernameStatus(raw: string, current?: string): UsernameStatus {
  const u = normalizeUsername(raw);
  const local = u ? usernameProblem(u) : null;
  const [remote, setRemote] = useState<{ u: string; available: boolean; problem: string | null } | null>(null);
  useEffect(() => {
    if (!u || local || u === current) return;
    let live = true;
    const t = setTimeout(() => {
      api<{ username: string; available: boolean; problem: string | null }>(`/api/users?username=${encodeURIComponent(u)}`)
        .then((r) => { if (live) setRemote({ u: r.username, available: r.available, problem: r.problem }); })
        .catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [u, local, current]);
  if (!u) return { u, state: "empty", msg: "" };
  if (local) return { u, state: "bad", msg: local };
  if (u === current) return { u, state: "ok", msg: "This is your username" };
  if (!remote || remote.u !== u) return { u, state: "checking", msg: "Checking…" };
  if (remote.available) return { u, state: "ok", msg: `@${u} is available` };
  return { u, state: "bad", msg: remote.problem === "Taken" ? `@${u} is taken` : remote.problem ?? "Not available" };
}

export function UsernameInput({ value, onChange, status, autoFocus }: { value: string; onChange: (v: string) => void; status: UsernameStatus; autoFocus?: boolean }) {
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">@</span>
        <input className={cx(inputCls, "!pl-7")} value={value} maxLength={USERNAME_MAX} autoFocus={autoFocus}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder="tommytrojan"
          onChange={(e) => onChange(e.target.value.replace(/^@+/, "").toLowerCase().replace(/\s+/g, ""))} />
      </div>
      <div className={cx("mt-1 flex items-center gap-1 text-[11.5px]", status.state === "ok" ? "text-[#248a3d]" : status.state === "bad" ? "text-red-700" : "text-muted")}>
        {status.state === "ok" && <Check size={12} strokeWidth={2.5} />}
        {status.msg || "Letters, numbers, periods and underscores. Friends find you by this."}
      </div>
    </div>
  );
}
