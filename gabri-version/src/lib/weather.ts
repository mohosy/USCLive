import { z } from "zod";

export const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=34.0205&longitude=-118.2856&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/Los_Angeles";
export type WeatherMode = "sun" | "clouds" | "rain" | "night";
export interface CampusWeather {
  temperature: number;
  high: number;
  low: number;
  code: number;
  isDay: boolean;
  source: "live" | "demo" | "saved";
}
const Forecast = z.object({
  current: z.object({ temperature_2m: z.number(), weather_code: z.number().int(), is_day: z.union([z.literal(0), z.literal(1)]) }),
  daily: z.object({ temperature_2m_max: z.array(z.number()).min(1), temperature_2m_min: z.array(z.number()).min(1) }),
});
export function parseWeather(value: unknown): CampusWeather {
  const { current, daily } = Forecast.parse(value);
  return { temperature: Math.round(current.temperature_2m), high: Math.round(daily.temperature_2m_max[0]), low: Math.round(daily.temperature_2m_min[0]), code: current.weather_code, isDay: current.is_day === 1, source: "live" };
}
export function weatherMode(weather: CampusWeather): WeatherMode {
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weather.code)) return "rain";
  if (!weather.isDay) return "night";
  return weather.code <= 1 ? "sun" : "clouds";
}
export function weatherCondition(weather: CampusWeather): string {
  const { code, isDay } = weather;
  if (code === 0 || code === 1) return isDay ? "Sunny" : "Clear night";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 95) return "Thunderstorms";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  return "Cloudy";
}
export const WEATHER_DEMOS: Record<WeatherMode, CampusWeather> = {
  sun: { temperature: 72, high: 76, low: 58, code: 0, isDay: true, source: "demo" },
  clouds: { temperature: 66, high: 70, low: 57, code: 3, isDay: true, source: "demo" },
  rain: { temperature: 61, high: 65, low: 55, code: 61, isDay: true, source: "demo" },
  night: { temperature: 58, high: 76, low: 54, code: 0, isDay: false, source: "demo" },
};
