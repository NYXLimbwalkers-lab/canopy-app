import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Requests push notification permission, retrieves the Expo push token,
 * and saves it to the user's row in Supabase.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    // Check / request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    // Save token to Supabase
    const { error } = await supabase
      .from('users')
      .update({ push_token: token })
      .eq('id', userId);

    if (error) {
      console.warn('Failed to save push token:', error.message);
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E7D32',
      });
    }

    return token;
  } catch (error) {
    console.warn('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Sets up listeners for incoming notifications (foreground) and
 * notification responses (user tapped a notification).
 * Returns a cleanup function to remove the listeners.
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      onNotificationReceived?.(notification);
    },
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      onNotificationResponse?.(response);
    },
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
