"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun } from "lucide-react";
import { weatherCondition, type CampusWeather } from "@/lib/weather";

/** Compact weather chip in the top row: icon and temperature (condition and high/low in its tooltip) (credit to Open-Meteo is in the map's credits). */
export default function WeatherPill({ weather }: { weather: CampusWeather }) {
  const condition = weatherCondition(weather);
  const Symbol = condition === "Thunderstorms" ? CloudLightning : condition === "Rain" ? CloudRain : condition === "Drizzle" ? CloudDrizzle : condition === "Snow" ? Snowflake : condition === "Foggy" ? CloudFog : condition === "Partly cloudy" ? CloudSun : condition === "Cloudy" ? Cloud : weather.isDay ? Sun : Moon;
  const note = weather.source === "demo" ? " (demo)" : weather.source === "saved" ? " (last available)" : "";
  return (
    <aside className="weather-pill" title={`Los Angeles: ${condition}, high ${weather.high}°, low ${weather.low}°${note}`}
      aria-label={`Los Angeles weather: ${weather.temperature} degrees Fahrenheit, ${condition}. High ${weather.high}, low ${weather.low}.${note}`}>
      <Symbol className={weather.isDay && weather.code <= 1 ? "weather-sun" : ""} size={16} strokeWidth={2} aria-hidden="true" />
      <span className="weather-temperature">{weather.temperature}°</span>
    </aside>
  );
}
