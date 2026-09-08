import type { Race } from "./f1";

export type RaceWeather = {
  code: number;
  tMax: number;
  tMin: number;
  precip: number;
};

/** WMO weather code → ไอคอน lucide + ป้ายไทย */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "Sun", label: "แดดใส" };
  if (code <= 2) return { icon: "CloudSun", label: "แดดรำไร" };
  if (code === 3) return { icon: "Cloud", label: "เมฆมาก" };
  if (code <= 48) return { icon: "CloudFog", label: "หมอก" };
  if (code <= 57) return { icon: "CloudDrizzle", label: "ฝนปรอย" };
  if (code <= 67) return { icon: "CloudRain", label: "ฝนตก" };
  if (code <= 77) return { icon: "CloudSnow", label: "หิมะ" };
  if (code <= 82) return { icon: "CloudRainWind", label: "ฝนซู่" };
  if (code <= 86) return { icon: "CloudSnow", label: "หิมะซู่" };
  return { icon: "CloudLightning", label: "พายุฝนฟ้าคะนอง" };
}

/** พยากรณ์อากาศวันแข่ง (null ถ้าไกลเกิน 14 วัน หรือดึงไม่ได้) */
export async function getRaceWeather(race: Race): Promise<RaceWeather | null> {
  const { lat, long } = race.Circuit.Location;
  if (!lat || !long || !race.date) return null;

  const raceDay = new Date(race.date);
  const daysOut = (raceDay.getTime() - Date.now()) / 86_400_000;
  if (daysOut > 14 || daysOut < -1) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&start_date=${race.date}&end_date=${race.date}&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: (number | null)[];
      };
    };
    const day = d.daily;
    if (!day?.weather_code?.length) return null;
    return {
      code: day.weather_code[0],
      tMax: Math.round(day.temperature_2m_max?.[0] ?? 0),
      tMin: Math.round(day.temperature_2m_min?.[0] ?? 0),
      precip: Math.round(day.precipitation_probability_max?.[0] ?? 0),
    };
  } catch {
    return null;
  }
}
