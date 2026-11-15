"use client";

import { Check, Copy, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "../ui";

/** "Add me on USCLive": a QR code and a link that opens the app with a friend request to you. */
export default function ShareQr({ username, onClose }: { username: string; onClose: () => void }) {
  const [link] = useState(() => (typeof window === "undefined" ? "" : `${window.location.origin}/?add=${encodeURIComponent(username)}`));
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: "#1d1d1f", light: "#ffffff" } })
      .then((url) => { if (live) setQr(url); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the link is still shown below */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share your profile" className="fade-in relative w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted hover:bg-surface hover:text-foreground" aria-label="Close"><X size={18} /></button>
        <div className="text-[15px] font-semibold">Add me on USCLive</div>
        <div className="mx-auto mt-4 grid h-[220px] w-[220px] max-w-full place-items-center rounded-xl border border-line">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code to add @${username}`} width={220} height={220} className="h-full w-full rounded-xl" />
          ) : (
            <span className="px-4 text-sm text-muted">{failed ? "Could not make the QR code. Copy the link instead." : "Making your code…"}</span>
          )}
        </div>
        <div className="mt-3 truncate text-[15px] font-medium">@{username}</div>
        <div className="mt-1 truncate text-xs text-muted">{link}</div>
        <Button onClick={copy} className="mt-4 w-full">
          {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
        </Button>
      </div>
    </div>
  );
}
