import { writable } from 'svelte/store';
import { supabase } from '../supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  session: null,
  loading: true
};

export const authStore = writable<AuthState>(initialState);

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    return { data, error };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async signInWithProvider(provider: 'github' | 'google') {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    return { data, error };
  }
};

// Initialize auth state listener
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    authStore.update(state => ({
      ...state,
      user: session?.user || null,
      session: session,
      loading: false
    }));
  });

  // Get initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    authStore.update(state => ({
      ...state,
      user: session?.user || null,
      session: session,
      loading: false
    }));
  });
} 