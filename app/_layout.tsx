import 'react-native-url-polyfill/auto';
import { useEffect, useRef } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { registerForPushNotifications, setupNotificationListeners } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const { initialize, isInitialized, session, company } = useAuthStore();
  const segments = useSegments();
  const notificationsRegistered = useRef(false);

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  // Register for push notifications once the user is authenticated
  useEffect(() => {
    if (!session?.user?.id || notificationsRegistered.current) return;
    notificationsRegistered.current = true;
    registerForPushNotifications(session.user.id);
  }, [session]);

  // Set up notification listeners while the app is running
  useEffect(() => {
    if (!session) return;
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, [session]);

  useEffect(() => {
    if (!isInitialized) return;

    if (!isSupabaseConfigured) {
      router.replace('/(auth)/login');
      return;
    }

    const inAuth       = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inPublic     = segments[0] === 'privacy' || segments[0] === 'terms';

    if (!session) {
      if (!inAuth && !inPublic) router.replace('/(auth)/login');
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
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
    </Stack>
  );
}
