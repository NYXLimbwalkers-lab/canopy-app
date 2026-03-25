import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
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

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    if (!isSupabaseConfigured) {
      // Dev mode — no env vars set. Show the login screen with a setup notice.
      router.replace('/(auth)/login');
      return;
    }

    if (!session) {
      router.replace('/(auth)/login');
    } else if (company && !company.onboarding_completed_at) {
      router.replace('/(onboarding)/welcome');
    } else {
      router.replace('/(tabs)/');
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
