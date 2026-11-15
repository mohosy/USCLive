"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { weatherCondition, type CampusWeather } from "@/lib/weather";

type Hour = { time: string; temp: number; code: number; isDay: boolean; rain: number };

/** Next hours at USC (Open-Meteo, same source as the card), fetched only when the card is opened. */
const HOURLY_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=34.0205&longitude=-118.2856&hourly=temperature_2m,weather_code,is_day,precipitation_probability&forecast_hours=10&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles";

function WeatherIcon({ code, isDay, size, className }: { code: number; isDay: boolean; size: number; className?: string }) {
  const c = weatherCondition({ temperature: 0, high: 0, low: 0, code, isDay, source: "live" });
  const p = { size, className, strokeWidth: 2, "aria-hidden": true as const };
  if (c === "Thunderstorms") return <CloudLightning {...p} />;
  if (c === "Rain") return <CloudRain {...p} />;
  if (c === "Drizzle") return <CloudDrizzle {...p} />;
  if (c === "Snow") return <Snowflake {...p} />;
  if (c === "Foggy") return <CloudFog {...p} />;
  if (c === "Partly cloudy") return <CloudSun {...p} />;
  if (c === "Cloudy") return <Cloud {...p} />;
  return isDay ? <Sun {...p} /> : <Moon {...p} />;
}
const hourLabel = (iso: string) => {
  const h = Number(iso.slice(11, 13));
  return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
};

/** Weather on the map: tap it to see the rest of the day (credit to Open-Meteo is in the map's credits). */
export default function WeatherPill({ weather }: { weather: CampusWeather }) {
  const condition = weatherCondition(weather);
  const note = weather.source === "demo" ? " (demo)" : weather.source === "saved" ? " (last available)" : "";
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !hours) {
      setFailed(false);
      fetch(HOURLY_URL)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[]; precipitation_probability: (number | null)[] } }) => {
          const h = d.hourly;
          setHours(h.time.map((t, i) => ({ time: t, temp: Math.round(h.temperature_2m[i]), code: h.weather_code[i], isDay: h.is_day[i] === 1, rain: h.precipitation_probability[i] ?? 0 })).slice(1, 9));
        })
        .catch(() => setFailed(true));
    }
  }
  // tap outside or Escape closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className={"weather-pill" + (open ? " weather-open" : "")}>
      <button type="button" className="weather-now" onClick={toggle} aria-expanded={open}
        aria-label={`Los Angeles weather: ${weather.temperature} degrees Fahrenheit, ${condition}. High ${weather.high}, low ${weather.low}.${note} Show the next hours.`}>
        <WeatherIcon code={weather.code} isDay={weather.isDay} size={18} className={weather.isDay && weather.code <= 1 ? "weather-sun" : ""} />
        <span className="weather-temperature">{weather.temperature}°</span>
        <span className="weather-condition">{condition}</span>
        <span className="weather-range">H{weather.high}° L{weather.low}°</span>
      </button>
      {/* always there, folded to zero height: opening and closing both glide */}
      <div className="weather-drop" aria-hidden={!open}>
        <div>
          <div className="weather-hours" role="list" aria-label="Next hours">
            {!hours && !failed && <div className="weather-hours-note">Loading…</div>}
            {failed && <div className="weather-hours-note">Couldn&apos;t load</div>}
            {hours?.map((h) => (
              <div key={h.time} role="listitem" className="weather-hour">
                <span className="weather-hour-time">{hourLabel(h.time)}</span>
                <span className="weather-hour-sky"><WeatherIcon code={h.code} isDay={h.isDay} size={14} />{h.rain >= 20 && <i>{h.rain}%</i>}</span>
                <span className="weather-hour-temp">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
