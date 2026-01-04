import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Tool para obtener el clima actual de una ubicación
 * Usa Open-Meteo API (gratuita, sin API key necesaria)
 */
export const weatherTool = createTool({
  id: 'get-weather',
  description:
    'Get current weather information for a specific location. Use this when the user asks about weather, temperature, or climate conditions for a city.',
  inputSchema: z.object({
    location: z.string().describe('City name or location (e.g., "Madrid", "New York", "Tokyo")'),
  }),
  outputSchema: z.object({
    temperature: z.number().describe('Current temperature in Celsius'),
    feelsLike: z.number().describe('Feels like temperature in Celsius'),
    humidity: z.number().describe('Relative humidity percentage'),
    windSpeed: z.number().describe('Wind speed in km/h'),
    windGust: z.number().describe('Wind gust speed in km/h'),
    conditions: z.string().describe('Weather conditions description'),
    location: z.string().describe('Resolved location name'),
  }),
  execute: async (inputData, context) => {
    const { location } = inputData;

    console.log(`[WeatherTool] Fetching weather for: ${location}`);

    const userId: string | undefined = context?.requestContext?.get('userId');
    if (!userId) throw new Error('User ID is required for device operations');

    try {
      // 1. Obtener coordenadas de la ciudad usando Geocoding API
      const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geocodingResponse = await fetch(geocodingUrl);

      if (!geocodingResponse.ok) {
        throw new Error(`Geocoding API error: ${geocodingResponse.statusText}`);
      }

      const geocodingData = await geocodingResponse.json();

      if (!geocodingData.results?.[0]) {
        throw new Error(`Location '${location}' not found. Please provide a valid city name.`);
      }

      const { latitude, longitude, name, country } = geocodingData.results[0];
      const resolvedLocation = country ? `${name}, ${country}` : name;

      console.log(`[WeatherTool] Resolved location: ${resolvedLocation} (${latitude}, ${longitude})`);

      // 2. Obtener datos del clima usando Open-Meteo API
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code&timezone=auto`;

      const weatherResponse = await fetch(weatherUrl);

      if (!weatherResponse.ok) {
        throw new Error(`Weather API error: ${weatherResponse.statusText}`);
      }

      const weatherData = await weatherResponse.json();

      // 3. Mapear el código del clima a una descripción legible
      const conditions = getWeatherCondition(weatherData.current.weather_code);

      const result = {
        temperature: weatherData.current.temperature_2m,
        feelsLike: weatherData.current.apparent_temperature,
        humidity: weatherData.current.relative_humidity_2m,
        windSpeed: weatherData.current.wind_speed_10m,
        windGust: weatherData.current.wind_gusts_10m,
        conditions,
        location: resolvedLocation,
      };

      console.log(`[WeatherTool] Weather data fetched successfully:`, result);

      return result;
    } catch (error) {
      console.error(`[WeatherTool] Error fetching weather:`, error);
      throw new Error(
        `Failed to fetch weather for "${location}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
});

/**
 * Convierte el código WMO del clima a una descripción legible
 * https://open-meteo.com/en/docs
 */
function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };

  return conditions[code] || `Unknown weather condition (code: ${code})`;
}
