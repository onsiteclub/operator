/**
 * @onsite/auth/core — Pure JS auth layer (zero React dependency).
 *
 * Used by background tasks, headless mode, watchdog, and sync engine
 * that need userId/session without a React component tree.
 *
 * Mobile apps: pair with AsyncStorage for persistence.
 * Web apps: use the React Context from @onsite/auth instead.
 */

const SESSION_KEY = 'onsite_auth_session';

/** Storage adapter interface — inject AsyncStorage or localStorage */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Supabase client interface — minimal surface for auth operations */
export interface SupabaseAuthClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { session: unknown; user: unknown };
      error: unknown;
    }>;
    signOut(): Promise<{ error: unknown }>;
    getSession(): Promise<{ data: { session: unknown }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: unknown) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

let _storage: StorageAdapter | null = null;
let _supabase: SupabaseAuthClient | null = null;

/**
 * Initialize the core auth module.
 * Must be called before any other function.
 */
export function initAuthCore(storage: StorageAdapter, supabase: SupabaseAuthClient): void {
  _storage = storage;
  _supabase = supabase;
}

function getStorage(): StorageAdapter {
  if (!_storage) throw new Error('@onsite/auth/core: call initAuthCore() first');
  return _storage;
}

function getSupabase(): SupabaseAuthClient {
  if (!_supabase) throw new Error('@onsite/auth/core: call initAuthCore() first');
  return _supabase;
}

/** Get the cached session from storage */
export async function getSession(): Promise<unknown | null> {
  const raw = await getStorage().getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Get the current user ID from cached session */
export async function getUserId(): Promise<string | null> {
  const session = (await getSession()) as { user?: { id?: string } } | null;
  return session?.user?.id ?? null;
}

/** Get the current user email from cached session */
export async function getUserEmail(): Promise<string | null> {
  const session = (await getSession()) as { user?: { email?: string } } | null;
  return session?.user?.email ?? null;
}

/** Sign in with email/password. Caches session to storage. */
export async function signIn(email: string, password: string): Promise<unknown> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  await getStorage().setItem(SESSION_KEY, JSON.stringify(data.session));
  return data.session;
}

/** Sign out. Clears cached session. */
export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
  await getStorage().removeItem(SESSION_KEY);
}

/**
 * Listen to auth state changes.
 * Automatically caches/clears session in storage.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(callback: (session: unknown | null) => void): () => void {
  const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, session) => {
    if (session) {
      getStorage().setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      getStorage().removeItem(SESSION_KEY);
    }
    callback(session);
  });
  return () => subscription.unsubscribe();
}
