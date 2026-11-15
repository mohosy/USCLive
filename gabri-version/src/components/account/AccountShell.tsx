"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Page frame for /profile and /settings: a light top bar, scrollable content, and signed-out / error states. */
export default function AccountShell({ status, right, children }: { status: "loading" | "ready" | "signedout" | "error"; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-screen overflow-y-auto bg-[#f5f5f7]">
      <header className="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground">
            <ArrowLeft size={16} /> Map
          </Link>
          <Link href="/" className="mx-auto text-[17px] font-semibold tracking-tight">USC<span className="text-cardinal">Live</span></Link>
          <div className="flex min-w-[64px] justify-end">{right}</div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        {status === "loading" ? (
          <div className="space-y-3">
            <div className="skeleton h-56 rounded-3xl" />
            <div className="skeleton h-24 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
        ) : status === "signedout" ? (
          <div className="rounded-3xl border border-line bg-white p-8 text-center">
            <div className="text-lg font-semibold">Sign in to see your profile</div>
            <p className="mt-1 text-sm text-muted">Use your USC email on the map page first.</p>
            <Link href="/" className="mt-4 inline-flex rounded-full bg-cardinal px-4 py-2 text-sm font-medium text-white hover:bg-cardinal-hover">Go to sign in</Link>
          </div>
        ) : status === "error" ? (
          <div className="rounded-3xl border border-line bg-white p-8 text-center text-sm text-red-700">Couldn&apos;t load your account. Try refreshing.</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
