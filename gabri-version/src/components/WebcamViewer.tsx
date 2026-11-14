"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Webcam } from "@/lib/webcams";

/** Full-screen live camera viewer: opens with a zoom-in, shows HLS video or a refreshing still. */
export default function WebcamViewer({ cam, onClose }: { cam: Webcam; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"video" | "image">(cam.hls ? "video" : "image");
  const [stamp, setStamp] = useState(() => Date.now());
  const [clock, setClock] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);

  // live video via hls.js (Safari plays HLS natively)
  useEffect(() => {
    if (mode !== "video" || !cam.hls || !video.current) return;
    const v = video.current;
    let destroy = () => {};
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        // Safari / iOS: native HLS
        if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = cam.hls!; v.play().catch(() => {}); v.onerror = () => setMode("image"); }
        else setMode("image");
        return;
      }
      {
        const hls = new Hls({ lowLatencyMode: true });
        hls.loadSource(cam.hls!);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) { hls.destroy(); setMode("image"); } });
        destroy = () => hls.destroy();
      }
    });
    return () => destroy();
  }, [cam.hls, mode]);

  // still images refresh every 20s; the on-screen clock ticks every second
  useEffect(() => {
    const a = setInterval(() => setStamp(Date.now()), 20_000);
    const b = setInterval(() => setClock(new Date()), 1000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { clearInterval(a); clearInterval(b); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  return (
    <div className="cam-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onMouseDown={onClose}>
      <div className="cam-window relative w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative aspect-video w-full bg-black">
          {mode === "video" ? (
            <video ref={video} muted playsInline autoPlay onPlaying={() => setLoaded(true)} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${cam.image}?t=${stamp}`} alt={cam.view} onLoad={() => setLoaded(true)} className="h-full w-full object-cover" />
          )}
          {!loaded && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Connecting to camera…</div>}
          <div className="cam-scan pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.65)]" />

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wider text-white"><span className="cam-dot h-1.5 w-1.5 rounded-full bg-white" />LIVE</span>
            <span className="rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white/90">{clock.toLocaleTimeString("en-US", { hour12: false })} PT</span>
          </div>
          <div className="absolute bottom-4 left-4 text-white">
            <div className="text-lg font-semibold drop-shadow">{cam.name}</div>
            <div className="text-xs text-white/75 drop-shadow">{cam.view}</div>
            <div className="mt-1 font-mono text-[10px] text-white/55">{cam.lat.toFixed(5)}, {cam.lng.toFixed(5)}</div>
          </div>
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            {cam.page && (
              <a href={cam.page} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-white/90">
                Watch live video on usc.edu <ExternalLink size={12} />
              </a>
            )}
            <span className="rounded bg-black/55 px-2 py-1 text-[10px] text-white/80">{cam.source === "Caltrans" ? "Caltrans CCTV" : "USC"}{mode === "image" ? " · still, updates every ~30 s" : ""}</span>
          </div>
          <button onClick={onClose} className="absolute right-3 top-3 rounded-md bg-black/55 p-1.5 text-white hover:bg-black/75" aria-label="Close"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}
