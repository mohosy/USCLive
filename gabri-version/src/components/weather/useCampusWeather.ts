"use client";

import { useEffect, useState } from "react";
import { parseWeather, WEATHER_DEMOS, WEATHER_URL, type CampusWeather, type WeatherMode } from "@/lib/weather";

const MODES: WeatherMode[] = ["sun", "clouds", "rain", "night"];
const REFRESH_MS = 15 * 60 * 1000;

export function useCampusWeather() {
  const [live, setLive] = useState<CampusWeather>(WEATHER_DEMOS.sun);
  const [demo, setDemo] = useState<WeatherMode | null>(null);
  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let lastAttempt = 0;
    const refresh = async () => {
      if (document.hidden || controller) return;
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 8000);
      lastAttempt = Date.now();
      try {
        const response = await fetch(WEATHER_URL, { signal: request.signal });
        if (!response.ok) throw new Error("Weather unavailable");
        const weather = parseWeather(await response.json());
        if (!stopped) setLive(weather);
      } catch {
        if (!stopped) setLive((previous) => previous.source === "demo" ? previous : { ...previous, source: "saved" });
      } finally { clearTimeout(timeout); controller = null; }
    };
    const back = () => { if (Date.now() - lastAttempt >= REFRESH_MS) void refresh(); };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", refresh);
    return () => { stopped = true; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", back); window.removeEventListener("online", refresh); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || target?.closest("input, textarea, select, [contenteditable], [role='textbox']")) return;
      if (e.key.toLowerCase() !== "w") return;
      e.preventDefault();
      if (e.shiftKey) setDemo(null);
      else setDemo((mode) => mode === null ? "sun" : MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { weather: demo ? WEATHER_DEMOS[demo] : live, demo };
}
