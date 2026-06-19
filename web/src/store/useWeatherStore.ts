import { create } from 'zustand';
import { shouldFetch, trackInflight } from '../lib/staleness';
import type { Home } from './useHomesStore';

export interface HomeWeather {
  temperature: number;
  weatherCode: number;
}

interface WeatherState {
  weatherByHome: Record<string, HomeWeather>;
  loading: boolean;
  /** Fetch current weather (open-meteo) for the located homes. Cached 15 min. */
  fetchWeather: (homes: Home[], force?: boolean) => Promise<void>;
}

// Cached so navigating back to the dashboard doesn't re-hit the API. The
// dashboard polls every 1 min but weather changes slowly, so this 5-min TTL
// means the open-meteo call actually fires at most once every 5 minutes.
const WEATHER_TTL = 5 * 60_000;

export const useWeatherStore = create<WeatherState>((set, get) => ({
  weatherByHome: {},
  loading: false,

  fetchWeather: async (homes, force = false) => {
    const located = homes.filter(
      (h) =>
        h?.latitude !== undefined &&
        h?.longitude !== undefined &&
        h.latitude !== null &&
        h.longitude !== null,
    );
    if (located.length === 0) return;
    if (!shouldFetch('weather', WEATHER_TTL, force)) return;

    if (Object.keys(get().weatherByHome).length === 0) set({ loading: true });

    const p = (async () => {
      try {
        const results = await Promise.all(
          located.map(async (home) => {
            const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${home.latitude}&longitude=${home.longitude}&current=temperature_2m,weather_code`,
            );
            if (!res.ok) throw new Error('Weather API failed');
            const data = await res.json();
            return {
              homeId: home.id,
              temperature: data.current.temperature_2m as number,
              weatherCode: data.current.weather_code as number,
            };
          }),
        );
        const map: Record<string, HomeWeather> = {};
        results.forEach((r) => {
          map[r.homeId] = {
            temperature: r.temperature,
            weatherCode: r.weatherCode,
          };
        });
        set({ weatherByHome: map, loading: false });
      } catch (error) {
        console.error('Failed to fetch weather for homes', error);
        set({ loading: false });
      }
    })();
    await trackInflight('weather', p);
  },
}));
