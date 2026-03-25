import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured =
  Boolean(supabaseUrl) && Boolean(supabaseAnonKey);

// AsyncStorage uses window.localStorage under the hood on web.
// During SSR (Node.js render), window is not defined — use undefined storage
// so Supabase skips session persistence on the server.
const isBrowser = typeof window !== 'undefined';

const PLACEHOLDER_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldiIsInJvbGUiOiJhbm9uIn0.dev';

export const supabase = createClient(
  supabaseUrl || 'https://dev.supabase.co',
  supabaseAnonKey || PLACEHOLDER_KEY,
  {
    auth: {
      // Only use persistent storage in the browser, never during SSR
      storage: isBrowser ? AsyncStorage : undefined,
      autoRefreshToken: isBrowser && isSupabaseConfigured,
      persistSession: isBrowser && isSupabaseConfigured,
      detectSessionInUrl: false,
    },
  }
);
