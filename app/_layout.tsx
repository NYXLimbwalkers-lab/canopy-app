import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const { initialize, isInitialized, session, company } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    if (!isSupabaseConfigured) {
      router.replace('/(auth)/login');
      return;
    }

    const inAuth       = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (company && !company.onboarding_completed_at) {
      // Only jump to welcome if not already somewhere inside onboarding
      if (!inOnboarding) router.replace('/(onboarding)/welcome');
    } else if (session) {
      if (inAuth || inOnboarding) router.replace('/(tabs)/');
    }
  }, [isInitialized, session, company]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
    </Stack>
  );
}
