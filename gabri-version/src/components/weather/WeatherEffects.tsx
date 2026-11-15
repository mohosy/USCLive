"use client";

import { useEffect, useRef } from "react";
import { weatherMode, type CampusWeather } from "@/lib/weather";

/** Separate canvas: weather never asks either WebGL map to redraw. All UI sits above it. */
export default function WeatherEffects({ weather, active = true }: { weather: CampusWeather; active?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mode = weatherMode(weather);
  const night = !weather.isDay;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !active) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, width = 0, height = 0, last = 0, elapsed = 0;
    const rain = Array.from({ length: 75 }, (_, i) => ({ x: ((i * 37) % 101) / 101, y: ((i * 67) % 103) / 103, speed: 0.8 + (i % 5) * 0.12 }));
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (night) { ctx.fillStyle = "rgba(12,24,38,0.14)"; ctx.fillRect(0, 0, width, height); }
      if (mode === "sun") { ctx.fillStyle = "rgba(255,190,82,0.045)"; ctx.fillRect(0, 0, width, height); }
      if (mode === "clouds") {
        ctx.fillStyle = "rgba(42,53,62,0.075)";
        ctx.filter = "blur(45px)";
        for (let i = 0; i < 4; i++) {
          const x = ((i * width * 0.37 + elapsed * 7) % (width + 600)) - 260;
          const y = height * (0.15 + (i % 3) * 0.3);
          ctx.beginPath(); ctx.ellipse(x, y, Math.max(160, width * 0.18), Math.max(55, height * 0.08), -0.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.filter = "none";
      }
      if (mode === "rain") {
        ctx.fillStyle = "rgba(72,95,112,0.04)"; ctx.fillRect(0, 0, width, height);
        ctx.lineWidth = 1; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(125,157,180,0.42)";
        const count = Math.min(rain.length, Math.max(18, Math.round(width * height / 19000)));
        ctx.beginPath();
        for (const drop of rain.slice(0, count)) {
          const y = (drop.y * (height + 30) + elapsed * 270 * drop.speed) % (height + 30) - 15;
          const x = ((drop.x * (width + 70) - elapsed * 40 * drop.speed) % (width + 70) + width + 70) % (width + 70) - 35;
          ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14);
        }
        ctx.stroke();
      }
    };
    const tick = (now: number) => {
      const delta = last ? now - last : 34;
      if (delta >= 33) { elapsed += Math.min(delta, 70) / 1000; last = now; draw(); }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame); last = 0; draw();
      if (!document.hidden && !reduced.matches && (mode === "rain" || mode === "clouds")) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const bounds = el.getBoundingClientRect(); width = bounds.width; height = bounds.height;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      el.width = Math.round(width * scale); el.height = Math.round(height * scale); ctx.setTransform(scale, 0, 0, scale, 0, 0); draw();
    };
    const observer = new ResizeObserver(resize); observer.observe(el);
    resize(); resume();
    document.addEventListener("visibilitychange", resume); reduced.addEventListener("change", resume);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume); };
  }, [mode, night, active]);
  return <canvas ref={canvas} className="map-weather-effects" aria-hidden="true" data-weather={mode} />;
}
