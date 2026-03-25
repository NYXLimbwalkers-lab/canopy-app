import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'manager' | 'crew_lead' | 'estimator' | 'admin';

export interface Company {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  service_radius_miles?: number;
  services_offered?: string[];
  plan: 'trial' | 'starter' | 'growth' | 'pro';
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
  trial_ends_at?: string;
  onboarding_step: number;
  onboarding_completed_at?: string;
}

export interface UserProfile {
  id: string;
  company_id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  company: Company | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, companyName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  fetchProfile: () => Promise<void>;
  updateCompany: (updates: Partial<Company>) => Promise<{ error: string | null }>;
  updateOnboardingStep: (step: number) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  company: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    // Short-circuit immediately if Supabase isn't configured yet
    if (!isSupabaseConfigured) {
      set({ isInitialized: true });
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        await get().fetchProfile();
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          await get().fetchProfile();
        } else {
          set({ profile: null, company: null });
        }
      });
    } finally {
      set({ isInitialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, name, companyName) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, company_name: companyName },
        },
      });
      if (error) return { error: error.message };
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },

  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, company: null });
  },

  fetchProfile: async () => {
    const user = get().user;
    if (!user) return;

    const [{ data: profile }, { data: company }] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase
        .from('companies')
        .select('*')
        .eq('id',
          // Will be populated after we get profile
          (await supabase.from('users').select('company_id').eq('id', user.id).single()).data?.company_id ?? ''
        )
        .single(),
    ]);

    if (profile) set({ profile });
    if (company) set({ company });
  },

  updateCompany: async (updates) => {
    const company = get().company;
    if (!company) return { error: 'No company found' };

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', company.id);

    if (!error) {
      set({ company: { ...company, ...updates } });
    }
    return { error: error?.message ?? null };
  },

  updateOnboardingStep: async (step) => {
    const company = get().company;
    if (!company) return;
    await get().updateCompany({ onboarding_step: step });
  },
}));
