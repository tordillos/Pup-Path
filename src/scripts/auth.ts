import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export const AUTH_CHANGE_EVENT = 'pup:auth-change';

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session.user;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch {
    return null;
  }
}

export async function signUpWithEmail(email: string, password: string, fullName?: string, dogName?: string) {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Añade las variables de entorno PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        dog_name: dogName,
      },
    },
  });

  if (error) throw error;

  // Supabase devuelve user con identities vacío si el email ya existe y hay confirmación activada
  if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
    throw new Error('Ya existe una cuenta con este correo electrónico. Por favor, inicia sesión.');
  }

  // Si hay sesión inmediata, asegurar creación del perfil y del perro en la base de datos
  if (data.user) {
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: email,
        full_name: fullName || null,
        updated_at: new Date().toISOString(),
      });

      if (dogName) {
        await supabase.from('dogs').upsert({
          user_id: data.user.id,
          name: dogName,
          is_current: true,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (dbErr) {
      console.warn('Advertencia al insertar perfil/perro:', dbErr);
    }
  }

  return data;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Añade las variables de entorno PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function resetPasswordForEmail(email: string) {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Añade las variables de entorno PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Por favor, introduce un correo electrónico válido.');
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/login`,
  });

  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Añade las variables de entorno PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/ajustes`,
    },
  });

  if (error) {
    if (error.message?.includes('not enabled') || error.message?.includes('Unsupported provider')) {
      throw new Error('El inicio con Google no está activado aún en tu proyecto de Supabase. Ve a Authentication -> Providers -> Google en supabase.com para activarlo.');
    }
    throw error;
  }

  if (data?.url) {
    window.location.href = data.url;
  }

  return data;
}

import { queryCache } from './query-cache';

export async function signOutUser() {
  if (!supabase || !isSupabaseConfigured) return;
  queryCache.invalidate('');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  if (!supabase || !isSupabaseConfigured) {
    callback(null);
    return () => {};
  }

  getCurrentUser().then(callback);

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
    document.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: session?.user ?? null }));
  });

  return () => {
    subscription.unsubscribe();
  };
}
