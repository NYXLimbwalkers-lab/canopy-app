// Canopy Weather & Storm Intelligence Engine
// Uses OpenWeatherMap API — free tier covers all we need

const BASE = 'https://api.openweathermap.org/data/2.5';
const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

function getKey(): string {
  return process.env.EXPO_PUBLIC_OPENWEATHER_KEY ?? '';
}

export function isWeatherConfigured(): boolean {
  return Boolean(getKey());
}

export interface WeatherCondition {
  description: string;
  icon: string;
  temp: number;
  windSpeed: number;
  windGust?: number;
  humidity: number;
  visibility: number;
  isStorm: boolean;
  stormType: 'none' | 'thunderstorm' | 'heavy_rain' | 'high_wind' | 'snow' | 'ice' | 'tornado';
  severity: 'none' | 'minor' | 'moderate' | 'severe' | 'extreme';
  city: string;
  alertMessage?: string;
}

export interface WeatherAlert {
  event: string;
  description: string;
  start: number;
  end: number;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
}

function classifyStorm(weather: any, wind: any, alerts: any[]): Pick<WeatherCondition, 'isStorm' | 'stormType' | 'severity' | 'alertMessage'> {
  const conditionId = weather[0]?.id ?? 800;
  const windSpeed = wind?.speed ?? 0;
  const windGust = wind?.gust ?? 0;
  const maxWind = Math.max(windSpeed, windGust);

  // Check official alerts first
  if (alerts && alerts.length > 0) {
    const alert = alerts[0];
    const desc = (alert.event ?? '').toLowerCase();
    if (desc.includes('tornado')) return { isStorm: true, stormType: 'tornado', severity: 'extreme', alertMessage: `⚠️ TORNADO WARNING: ${alert.event}` };
    if (desc.includes('hurricane') || desc.includes('tropical')) return { isStorm: true, stormType: 'high_wind', severity: 'extreme', alertMessage: `⚠️ ${alert.event}` };
    if (desc.includes('ice') || desc.includes('freezing')) return { isStorm: true, stormType: 'ice', severity: 'severe', alertMessage: `🧊 ICE WARNING: ${alert.event}` };
    if (desc.includes('wind')) return { isStorm: true, stormType: 'high_wind', severity: 'severe', alertMessage: `💨 WIND ADVISORY: ${alert.event}` };
  }

  // Classify by weather condition codes
  if (conditionId >= 200 && conditionId < 300) {
    const sev = conditionId >= 212 ? 'extreme' : conditionId >= 211 ? 'severe' : 'moderate';
    return { isStorm: true, stormType: 'thunderstorm', severity: sev, alertMessage: `⛈️ Thunderstorm in your area — emergency tree calls incoming` };
  }
  if (conditionId >= 600 && conditionId < 700) {
    return { isStorm: true, stormType: 'snow', severity: 'moderate', alertMessage: `❄️ Snow event — watch for branch breaks and weight damage` };
  }
  if (conditionId >= 300 && conditionId < 400) {
    return { isStorm: false, stormType: 'none', severity: 'none' };
  }
  if (conditionId >= 500 && conditionId < 600) {
    const heavy = conditionId >= 502;
    return heavy
      ? { isStorm: true, stormType: 'heavy_rain', severity: 'moderate', alertMessage: `🌧️ Heavy rain — soft soil increases tree fall risk` }
      : { isStorm: false, stormType: 'none', severity: 'none' };
  }

  // High wind
  if (maxWind >= 20) {
    const sev = maxWind >= 35 ? 'extreme' : maxWind >= 28 ? 'severe' : 'moderate';
    return { isStorm: true, stormType: 'high_wind', severity: sev, alertMessage: `💨 High winds ${Math.round(maxWind)}mph — tree damage likely in your service area` };
  }

  return { isStorm: false, stormType: 'none', severity: 'none' };
}

/** Normalize a city string for OWM lookup.
 *  "springhill" → ["Springhill", "Spring Hill"]
 *  "neworleans" → ["Neworleans", "New Orleans"] (best-effort split)
 */
function normalizeCityVariants(raw: string): string[] {
  const clean = raw.trim();
  // Title-case as-is
  const titled = clean.replace(/\b\w/g, c => c.toUpperCase());
  // Try inserting a space before the last capitalisable chunk if it looks compound
  // e.g. "springhill" → title "Springhill" → also try "Spring Hill"
  const withSpaces = titled.replace(/([a-z])([A-Z])/g, '$1 $2');
  const variants: string[] = [titled];
  if (withSpaces !== titled) variants.push(withSpaces);
  return variants;
}

/** Get current weather + storm status for a city */
export async function getWeather(city: string, state?: string): Promise<WeatherCondition> {
  const key = getKey();
  if (!key) throw new Error('OpenWeatherMap key not configured');

  const stateCode = state && state.length === 2 ? state.toUpperCase() : null;
  const cityVariants = normalizeCityVariants(city);

  let geoData: any[] = [];

  for (const variant of cityVariants) {
    if (geoData.length) break;
    // Try with state code first, then bare city
    const candidates = stateCode
      ? [`${variant},${stateCode},US`, `${variant},US`]
      : [`${variant},US`];
    for (const loc of candidates) {
      if (geoData.length) break;
      const r = await fetch(`${GEO_BASE}/direct?q=${encodeURIComponent(loc)}&limit=1&appid=${key}`);
      const d = await r.json();
      if (Array.isArray(d) && d.length) geoData = d;
    }
  }

  if (!geoData.length) throw new Error(`City not found: ${city}`);

  const { lat, lon } = geoData[0];

  // Get full weather with alerts
  const weatherResp = await fetch(
    `${BASE}/weather?lat=${lat}&lon=${lon}&appid=${key}&units=imperial`
  );
  const w = await weatherResp.json();

  const storm = classifyStorm(w.weather ?? [], w.wind ?? {}, []);

  return {
    description: w.weather?.[0]?.description ?? 'Clear',
    icon: w.weather?.[0]?.icon ?? '01d',
    temp: Math.round(w.main?.temp ?? 70),
    windSpeed: Math.round(w.wind?.speed ?? 0),
    windGust: w.wind?.gust ? Math.round(w.wind.gust) : undefined,
    humidity: w.main?.humidity ?? 50,
    visibility: Math.round((w.visibility ?? 10000) / 1000),
    city,
    ...storm,
  };
}

/** Get 5-day forecast to pre-plan content */
export async function getForecast(city: string, state?: string): Promise<Array<{
  date: string;
  temp: number;
  description: string;
  isStorm: boolean;
  severity: string;
}>> {
  const key = getKey();
  if (!key) throw new Error('OpenWeatherMap key not configured');

  const location = state ? `${city},${state},US` : `${city},US`;
  const resp = await fetch(
    `${BASE}/forecast?q=${encodeURIComponent(location)}&cnt=40&appid=${key}&units=imperial`
  );
  const data = await resp.json();

  // Group by day, take noon reading
  const days: Record<string, any> = {};
  for (const item of data.list ?? []) {
    const date = new Date(item.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const hour = new Date(item.dt * 1000).getHours();
    if (!days[date] || Math.abs(hour - 12) < Math.abs(new Date(days[date].dt * 1000).getHours() - 12)) {
      days[date] = item;
    }
  }

  return Object.values(days).slice(0, 5).map(item => {
    const storm = classifyStorm(item.weather ?? [], item.wind ?? {}, []);
    return {
      date: new Date(item.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      temp: Math.round(item.main?.temp ?? 70),
      description: item.weather?.[0]?.description ?? 'Clear',
      isStorm: storm.isStorm,
      severity: storm.severity,
    };
  });
}

/** Determine current season for content calendar */
export function getCurrentSeason(state?: string): 'spring' | 'summer' | 'fall' | 'winter' | 'storm_season' {
  const month = new Date().getMonth(); // 0-11
  const southernStates = ['FL', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC'];
  const isSouth = state && southernStates.includes(state.toUpperCase());

  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return isSouth ? 'storm_season' : 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

/** Storm response action plan */
export function getStormResponsePlan(weather: WeatherCondition): {
  adAction: string;
  contentAction: string;
  pricingSuggestion: string;
  urgencyMessage: string;
} {
  if (!weather.isStorm) {
    return {
      adAction: 'No storm response needed',
      contentAction: 'Post regular content',
      pricingSuggestion: 'Standard pricing',
      urgencyMessage: '',
    };
  }

  const plans = {
    thunderstorm: {
      adAction: 'Increase Google Ads budget 2x for "emergency tree removal" and "storm damage tree" keywords',
      contentAction: 'Post storm safety video immediately + TikTok showing crew on standby',
      pricingSuggestion: 'Emergency rate: +25-40% over standard. Communicate value of 24/7 availability.',
      urgencyMessage: 'Storm detected — emergency leads incoming. Activate surge response.',
    },
    high_wind: {
      adAction: 'Add high-wind emergency keywords: "fallen tree removal", "tree on house emergency"',
      contentAction: 'Post "high winds mean hazard trees" educational content now',
      pricingSuggestion: 'Hazard assessment fee $150-300. Removal at standard rate.',
      urgencyMessage: 'High winds in your area. Position as the hazard assessment experts.',
    },
    heavy_rain: {
      adAction: 'Push "tree leaning after rain" and "waterlogged tree removal" keywords',
      contentAction: 'Post content about soil saturation and root stability',
      pricingSuggestion: 'Standard rates. Upsell root health assessment.',
      urgencyMessage: 'Heavy rain softens soil — trees that seemed stable may now be hazards.',
    },
    snow: {
      adAction: 'Activate "snow damage tree removal" and "broken branch removal" campaigns',
      contentAction: 'Post before/after snow damage content',
      pricingSuggestion: 'Snow removal surcharge $75-150. Standard removal pricing.',
      urgencyMessage: 'Snow loading breaks branches. Push emergency availability.',
    },
    ice: {
      adAction: 'Maximum budget on "ice storm tree damage" — highest CPL season but highest ticket',
      contentAction: 'Post ice damage photos immediately for social proof',
      pricingSuggestion: 'Premium emergency rates. Ice jobs are complex — price accordingly.',
      urgencyMessage: 'Ice storm damage = highest-ticket season. Full surge mode.',
    },
    tornado: {
      adAction: 'All budgets to emergency keywords. Pause brand campaigns.',
      contentAction: 'Post crew mobilization content. Show capacity and professionalism.',
      pricingSuggestion: 'Standard removal rates — do NOT price gouge. Community goodwill = long-term business.',
      urgencyMessage: 'TORNADO — surge mode active. Focus on community service positioning.',
    },
    none: {
      adAction: 'Standard campaign running',
      contentAction: 'Post regular content',
      pricingSuggestion: 'Standard pricing',
      urgencyMessage: '',
    },
  };

  return plans[weather.stormType] ?? plans.none;
}
