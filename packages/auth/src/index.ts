// Types
export * from './types'

// Auth Context and Hooks (React)
export { AuthProvider, useAuth, usePermission, useRole } from './context'

// Auth Gate for Expo apps (React hook)
export { useAuthGate } from './mobile'
export type { AuthGateState } from './mobile'

// Core auth (pure JS, no React dependency)
export {
  initAuthCore,
  getSession,
  getUserId,
  getUserEmail,
  signIn as coreSignIn,
  signOut as coreSignOut,
  onAuthStateChange,
} from './core'
export type { StorageAdapter, SupabaseAuthClient } from './core'

// Signature Utilities
export {
  createSignature,
  verifySignature,
  formatSignature,
  signPhoto,
  signDocumentAck,
} from './signature'
