import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { getWeather, getStormResponsePlan, isWeatherConfigured, type WeatherCondition } from '@/lib/weather';
import { useAuthStore } from '@/lib/stores/authStore';

interface Props {
  onStormDetected?: (weather: WeatherCondition) => void;
}

export function WeatherWidget({ onStormDetected }: Props) {
  const { company } = useAuthStore();
  const [weather, setWeather] = useState<WeatherCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company?.city && isWeatherConfigured()) {
      load();
    } else {
      setLoading(false);
    }
  }, [company?.city]);

  const load = async () => {
    if (!company?.city) return;
    setLoading(true);
    setError(null);
    try {
      const w = await getWeather(company.city, company.state);
      setWeather(w);
      if (w.isStorm) onStormDetected?.(w);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isWeatherConfigured()) {
    return (
      <View style={[styles.widget, styles.unconfigured]}>
        <Text style={styles.unconfiguredText}>🌤️ Add EXPO_PUBLIC_OPENWEATHER_KEY to enable storm alerts</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.widget}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Checking weather...</Text>
      </View>
    );
  }

  if (!company?.city) {
    return (
      <View style={[styles.widget, styles.unconfigured]}>
        <Text style={styles.unconfiguredText}>🌤️ Add your city in Settings to see local weather & storm alerts</Text>
      </View>
    );
  }

  if (error || !weather) {
    return (
      <TouchableOpacity style={styles.widget} onPress={load}>
        <Text style={styles.errorText}>⚠️ Weather unavailable — tap to retry</Text>
      </TouchableOpacity>
    );
  }

  const plan = getStormResponsePlan(weather);
  const bgColor = weather.severity === 'extreme' ? Colors.dangerBg
    : weather.severity === 'severe' ? Colors.warningBg
    : weather.isStorm ? '#FEF9C3'
    : Colors.surface;
  const borderColor = weather.severity === 'extreme' ? Colors.danger
    : weather.severity === 'severe' ? Colors.warning
    : weather.isStorm ? Colors.warning
    : Colors.border;

  return (
    <TouchableOpacity
      style={[styles.widget, { backgroundColor: bgColor, borderColor }]}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.9}
    >
      <View style={styles.row}>
        <View style={styles.main}>
          <Text style={styles.temp}>{weather.temp}°F</Text>
          <Text style={styles.desc}>{weather.description}</Text>
          <Text style={styles.wind}>💨 {weather.windSpeed}mph{weather.windGust ? ` (gusts ${weather.windGust}mph)` : ''}</Text>
        </View>
        <View style={styles.right}>
          {weather.isStorm && (
            <View style={[styles.stormBadge, { backgroundColor: borderColor }]}>
              <Text style={styles.stormBadgeText}>⚡ STORM</Text>
            </View>
          )}
          <Text style={styles.city}>{weather.city}</Text>
        </View>
      </View>

      {weather.alertMessage && (
        <Text style={styles.alertText}>{weather.alertMessage}</Text>
      )}

      {expanded && weather.isStorm && (
        <View style={styles.plan}>
          <Text style={styles.planTitle}>Storm Response Plan:</Text>
          <Text style={styles.planItem}>📣 {plan.adAction}</Text>
          <Text style={styles.planItem}>🎬 {plan.contentAction}</Text>
          <Text style={styles.planItem}>💰 {plan.pricingSuggestion}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  widget: {
    borderRadius: Theme.radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Theme.shadow.sm,
  },
  unconfigured: { borderStyle: 'dashed' },
  unconfiguredText: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  loadingText: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  errorText: { fontSize: Theme.font.size.small, color: Colors.warning },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  main: { gap: 2 },
  temp: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  desc: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textTransform: 'capitalize' },
  wind: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 6 },
  stormBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Theme.radius.full },
  stormBadgeText: { color: Colors.textInverse, fontSize: Theme.font.size.caption, fontWeight: Theme.font.weight.bold },
  city: { fontSize: Theme.font.size.small, color: Colors.textTertiary },
  alertText: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: '#92400E', marginTop: 8, lineHeight: 20 },
  plan: { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  planTitle: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.bold, color: Colors.text },
  planItem: { fontSize: Theme.font.size.small, color: Colors.textSecondary, lineHeight: 20 },
});
