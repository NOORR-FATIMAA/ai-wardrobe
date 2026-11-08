// Free, key-less forecast from Open-Meteo. Coordinates are used for this request only and never stored.
import { z } from "npm:zod@4.6.7";

/** Request coordinates as sent by the app; anything outside the globe is rejected with a 400. */
export const Coordinates = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers",
  82: "violent rain showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * One-line summary of day `index` (0 = today, 1 = tomorrow, in the location's own time zone) from
 * Open-Meteo's `daily` block, or null when any needed value is missing or not a number. The result
 * is part of the prompt, so it never contains "NaN", "undefined" or text from the response.
 */
export function summarizeForecast(daily: unknown, index: 0 | 1): string | null {
  if (!daily || typeof daily !== "object") return null;
  const d = daily as Record<string, unknown>;
  const at = (key: string) => (Array.isArray(d[key]) ? (d[key] as unknown[])[index] : undefined);
  const [code, low, high, rain, wind] = [
    at("weather_code"), at("temperature_2m_min"), at("temperature_2m_max"),
    at("precipitation_probability_max"), at("wind_speed_10m_max"),
  ];
  if (![low, high, rain, wind].every(finite)) return null;
  const conditions = (finite(code) && WEATHER_CODES[code]) || "mixed conditions";
  return `${conditions}, ${Math.round(low as number)}–${Math.round(high as number)}°C, ` +
    `${Math.round(rain as number)}% chance of rain, wind up to ${Math.round(wind as number)} km/h`;
}

/** Returns a one-line forecast summary, or null when the forecast is unavailable. */
export async function fetchForecast(latitude: number, longitude: number, day: "today" | "tomorrow") {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(2)); // ~1 km precision is plenty
  url.searchParams.set("longitude", longitude.toFixed(2));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "2");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const body = await res.json();
    return summarizeForecast(body?.daily, day === "today" ? 0 : 1);
  } catch {
    return null;
  }
}
