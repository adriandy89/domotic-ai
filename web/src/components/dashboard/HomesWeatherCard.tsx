import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { useTranslation } from 'react-i18next';
import { useHomesStore } from '../../store/useHomesStore';
import { useWeatherStore } from '../../store/useWeatherStore';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Sun,
  ThermometerSun,
} from 'lucide-react';
import { formatNumber } from '../../lib/format';

// Map WMO weather codes to lucide icons and descriptions
const getWeatherInfo = (code: number) => {
  const info: Record<number, { icon: React.ElementType; color: string; labelKey: string }> = {
    0: { icon: Sun, color: 'text-amber-500', labelKey: 'clearSky' },
    1: { icon: CloudSun, color: 'text-amber-500', labelKey: 'mainlyClear' },
    2: { icon: CloudSun, color: 'text-blue-400', labelKey: 'partlyCloudy' },
    3: { icon: Cloud, color: 'text-slate-400', labelKey: 'overcast' },
    45: { icon: CloudFog, color: 'text-slate-400', labelKey: 'foggy' },
    48: { icon: CloudFog, color: 'text-slate-400', labelKey: 'depositingRimeFog' },
    51: { icon: CloudDrizzle, color: 'text-blue-300', labelKey: 'lightDrizzle' },
    53: { icon: CloudDrizzle, color: 'text-blue-400', labelKey: 'moderateDrizzle' },
    55: { icon: CloudDrizzle, color: 'text-blue-500', labelKey: 'denseDrizzle' },
    61: { icon: CloudRain, color: 'text-blue-400', labelKey: 'slightRain' },
    63: { icon: CloudRain, color: 'text-blue-500', labelKey: 'moderateRain' },
    65: { icon: CloudRain, color: 'text-blue-600', labelKey: 'heavyRain' },
    66: { icon: CloudRain, color: 'text-cyan-400', labelKey: 'lightFreezingRain' },
    67: { icon: CloudRain, color: 'text-cyan-500', labelKey: 'heavyFreezingRain' },
    71: { icon: CloudSnow, color: 'text-cyan-200', labelKey: 'slightSnowFall' },
    73: { icon: CloudSnow, color: 'text-cyan-300', labelKey: 'moderateSnowFall' },
    75: { icon: CloudSnow, color: 'text-cyan-400', labelKey: 'heavySnowFall' },
    77: { icon: CloudSnow, color: 'text-cyan-200', labelKey: 'snowGrains' },
    80: { icon: CloudRain, color: 'text-blue-400', labelKey: 'slightRainShowers' },
    81: { icon: CloudRain, color: 'text-blue-500', labelKey: 'moderateRainShowers' },
    82: { icon: CloudRain, color: 'text-blue-600', labelKey: 'violentRainShowers' },
    85: { icon: CloudSnow, color: 'text-cyan-300', labelKey: 'slightSnowShowers' },
    86: { icon: CloudSnow, color: 'text-cyan-400', labelKey: 'heavySnowShowers' },
    95: { icon: CloudLightning, color: 'text-amber-400', labelKey: 'thunderstorm' },
    96: { icon: CloudLightning, color: 'text-amber-500', labelKey: 'thunderstormSlightHail' },
    99: { icon: CloudLightning, color: 'text-amber-600', labelKey: 'thunderstormHeavyHail' },
  };

  return info[code] || { icon: Cloud, color: 'text-slate-400', labelKey: 'unknown' };
};

export default function HomesWeatherCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { homes, homeIds } = useHomesStore();
  const weatherByHome = useWeatherStore((s) => s.weatherByHome);
  const loading = useWeatherStore((s) => s.loading);
  const fetchWeather = useWeatherStore((s) => s.fetchWeather);

  // Filter homes that have coordinates
  const homesWithLocation = homeIds
    .map((id) => homes[id])
    .filter(
      (home) =>
        home?.latitude !== undefined &&
        home?.longitude !== undefined &&
        home.latitude !== null &&
        home.longitude !== null,
    );

  // Cached in the store (15 min TTL) and refreshed by the dashboard poller, so
  // navigating back here does not re-hit the API.
  const homeIdsKey = homeIds.join(',');
  useEffect(() => {
    fetchWeather(homesWithLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeIdsKey, fetchWeather]);

  // Don't render anything if no homes have coordinates
  if (homesWithLocation.length === 0) {
    return null;
  }

  return (
    <Card className={`bg-card/40 border-border ${className || ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-sky-400">
          <ThermometerSun className="h-5 w-5" />
          {t('dashboard.weather.title', 'Clima Exterior por Hogar')}
        </CardTitle>
        <CardDescription>
          {t('dashboard.weather.subtitle', 'Condiciones climáticas actuales en las ubicaciones de tus hogares')}
        </CardDescription>
      </CardHeader>
      <CardContent className="@container">
        {loading ? (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 animate-pulse">
            {homesWithLocation.map((home) => (
              <div key={home.id} className="h-20 bg-background/50 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
            {homesWithLocation.map((home) => {
              const w = weatherByHome[home.id];
              if (!w) return null;
              const info = getWeatherInfo(w.weatherCode);
              const Icon = info.icon;
              return (
                <div
                  key={home.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-background/40 border border-border/50 hover:bg-background/60 transition-colors"
                >
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span
                        className="text-sm font-semibold truncate text-foreground"
                        title={home.name}
                      >
                        {home.name}
                      </span>
                    </div>
                    <span
                      className="text-xs text-muted-foreground truncate pl-5"
                      title={t(`dashboard.weather.conditions.${info.labelKey}`)}
                    >
                      {t(`dashboard.weather.conditions.${info.labelKey}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pl-2">
                    <Icon className={`h-8 w-8 ${info.color}`} />
                    <span className="text-xl font-bold text-foreground">
                      {formatNumber(w.temperature, 1)}°
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
