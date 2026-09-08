import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudRainWind,
  CloudSnow, CloudSun, Droplets, Sun,
} from "lucide-react";
import type { RaceWeather } from "@/lib/weather";
import { describeWeather } from "@/lib/weather";

const ICONS = {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow,
  CloudRainWind, CloudLightning,
} as const;

export default function WeatherBadge({ weather }: { weather: RaceWeather }) {
  const { icon, label } = describeWeather(weather.code);
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Cloud;

  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm">
      <Icon className="h-4 w-4 text-white/70" />
      <span className="text-white/80">{label}</span>
      <span className="text-white/40">·</span>
      <span className="tabular-nums text-white/70">
        {weather.tMax}° / {weather.tMin}°
      </span>
      {weather.precip >= 20 && (
        <span className="inline-flex items-center gap-0.5 text-white/50">
          <Droplets className="h-3 w-3" />
          {weather.precip}%
        </span>
      )}
    </div>
  );
}
