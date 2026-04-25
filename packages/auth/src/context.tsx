import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import type { User, AuthState, SignInCredentials, SignUpCredentials, Permissions, UserRole } from './types'
import { ROLE_PERMISSIONS } from './types'

interface AuthContextValue extends AuthState {
  signIn: (credentials: SignInCredentials) => Promise<void>
  signUp: (credentials: SignUpCredentials) => Promise<void>
  signOut: () => Promise<void>
  permissions: Permissions
  hasPermission: (permission: keyof Permissions) => boolean
  isRole: (role: UserRole | UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: React.ReactNode
  supabase: SupabaseClient
  /** URL to redirect after email confirmation (e.g. https://myapp.com/auth/callback) */
  emailRedirectTo?: string
}

export function AuthProvider({ children, supabase, emailRedirectTo }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  // Fetch user profile from core_profiles + role from core_org_memberships
  const fetchUserProfile = useCallback(async (session: Session): Promise<User> => {
    // Fallback user from auth session data
    const user: User = {
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.email?.split('@')[0] || 'User',
      role: 'worker',
      createdAt: session.user.created_at || new Date().toISOString(),
    }

    try {
      const { data } = await supabase
        .from('core_profiles')
        .select('full_name, avatar_url, phone')
        .eq('id', session.user.id)
        .maybeSingle()

      if (data) {
        user.name = data.full_name || user.name
        user.avatar = data.avatar_url || undefined
        user.phone = data.phone || undefined
      }

      // Get role from org membership (first active one)
      const { data: membership } = await supabase
        .from('core_org_memberships')
        .select('role')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle()

      if (membership?.role) {
        user.role = membership.role as UserRole
      }
    } catch (error) {
      console.warn('[AuthProvider] Profile fetch failed, using fallback:', error)
    }

    return user
  }, [supabase])

  // Handle auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const profile = await fetchUserProfile(session)
        setState({ user: profile, loading: false, error: null })
      } else {
        setState({ user: null, loading: false, error: null })
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const profile = await fetchUserProfile(session)
        setState({ user: profile, loading: false, error: null })
      } else if (event === 'SIGNED_OUT') {
        setState({ user: null, loading: false, error: null })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchUserProfile])

  // Sign in
  const signIn = async (credentials: SignInCredentials) => {
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const { error } = await supabase.auth.signInWithPassword(credentials)
      if (error) throw error
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      }))
      throw error
    }
  }

  // Sign up
  const signUp = async (credentials: SignUpCredentials) => {
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const userMetadata: Record<string, string> = {
        full_name: credentials.name,
      }
      if (credentials.firstName) userMetadata.first_name = credentials.firstName
      if (credentials.lastName) userMetadata.last_name = credentials.lastName
      if (credentials.gender) userMetadata.gender = credentials.gender
      if (credentials.dateOfBirth) userMetadata.date_of_birth = credentials.dateOfBirth
      if (credentials.trade) userMetadata.trade = credentials.trade

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: userMetadata,
          emailRedirectTo,
        },
      })

      if (authError) throw authError

      // Update user profile in core_profiles (trigger creates row on auth.users insert)
      if (authData.user) {
        const profileUpdate: Record<string, unknown> = {
          full_name: credentials.name,
          phone: credentials.phone || null,
        }

        if (credentials.firstName) profileUpdate.first_name = credentials.firstName
        if (credentials.lastName) profileUpdate.last_name = credentials.lastName
        if (credentials.dateOfBirth) profileUpdate.date_of_birth = credentials.dateOfBirth
        if (credentials.gender) profileUpdate.gender = credentials.gender

        // Trade: if it looks like a UUID, set trade_id; otherwise trade_other
        if (credentials.trade) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentials.trade)
          if (isUuid) {
            profileUpdate.trade_id = credentials.trade
          } else {
            profileUpdate.trade_other = credentials.trade
          }
        }

        const { error: profileError } = await supabase
          .from('core_profiles')
          .update(profileUpdate)
          .eq('id', authData.user.id)

        if (profileError) {
          console.warn('[AuthProvider] Profile update after signup failed:', profileError)
        }
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : 'Sign up failed',
      }))
      throw error
    }
  }

  // Sign out
  const signOut = async () => {
    setState((s) => ({ ...s, loading: true }))
    await supabase.auth.signOut()
    setState({ user: null, loading: false, error: null })
  }

  // Get permissions based on user role
  const permissions: Permissions = state.user
    ? ROLE_PERMISSIONS[state.user.role]
    : ROLE_PERMISSIONS.worker

  // Check if user has a specific permission
  const hasPermission = (permission: keyof Permissions): boolean => {
    return permissions[permission]
  }

  // Check if user has a specific role
  const isRole = (role: UserRole | UserRole[]): boolean => {
    if (!state.user) return false
    if (Array.isArray(role)) {
      return role.includes(state.user.role)
    }
    return state.user.role === role
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        permissions,
        hasPermission,
        isRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Hook for checking permissions
export function usePermission(permission: keyof Permissions) {
  const { hasPermission, loading } = useAuth()
  return { hasPermission: hasPermission(permission), loading }
}

// Hook for checking roles
export function useRole(role: UserRole | UserRole[]) {
  const { isRole, loading } = useAuth()
  return { isRole: isRole(role), loading }
}
