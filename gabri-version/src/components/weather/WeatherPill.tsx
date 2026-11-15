"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun } from "lucide-react";
import { weatherCondition, type CampusWeather } from "@/lib/weather";

export default function WeatherPill({ weather }: { weather: CampusWeather }) {
  const condition = weatherCondition(weather);
  const Symbol = condition === "Thunderstorms" ? CloudLightning : condition === "Rain" ? CloudRain : condition === "Drizzle" ? CloudDrizzle : condition === "Snow" ? Snowflake : condition === "Foggy" ? CloudFog : condition === "Partly cloudy" ? CloudSun : condition === "Cloudy" ? Cloud : weather.isDay ? Sun : Moon;
  return (
    <aside className="weather-pill" aria-label={`Los Angeles weather: ${weather.temperature} degrees Fahrenheit, ${condition}. High ${weather.high}, low ${weather.low}. ${weather.source === "live" ? "Live weather" : weather.source === "saved" ? "Last available weather" : "Demo weather"}.`}>
      <div className="weather-current"><Symbol className={weather.isDay && weather.code <= 1 ? "weather-sun" : ""} size={28} strokeWidth={1.7} aria-hidden="true" /><span className="weather-temperature">{weather.temperature}°</span></div>
      <div className="weather-condition">{condition}</div>
      <div className="weather-range">H:{weather.high}° <span>L:{weather.low}°</span></div>
      <div className="weather-source">{weather.source === "demo" ? "Demo weather" : weather.source === "saved" ? "LA · Last available" : "Los Angeles"}</div>
      <a className="weather-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
    </aside>
  );
}
