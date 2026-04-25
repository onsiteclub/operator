/**
 * Authentication and User Types
 *
 * Roles aligned with core_org_memberships.role in DB.
 *
 * Changes (framing migration):
 *   - Removed 'inspector' (merged into 'supervisor')
 *   - Added 'crew_lead', 'operator', 'builder'
 */

export type UserRole =
  | 'worker'
  | 'crew_lead'
  | 'supervisor'
  | 'operator'
  | 'builder'
  | 'admin'
  | 'owner'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  phone?: string
  createdAt: string
  metadata?: {
    company?: string
    license?: string
    certifications?: string[]
  }
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

export interface SignInCredentials {
  email: string
  password: string
}

export interface SignUpCredentials extends SignInCredentials {
  name: string
  role: UserRole
  phone?: string
  firstName?: string
  lastName?: string
  /** YYYY-MM-DD */
  dateOfBirth?: string
  /** Trade UUID (from ref_trades) or free-text name */
  trade?: string
  /** male | female | undeclared */
  gender?: string
}

// Session for electronic signatures
export interface SignatureSession {
  userId: string
  userName: string
  userRole: UserRole
  timestamp: string // ISO date
  deviceId?: string
  location?: {
    latitude: number
    longitude: number
  }
  hash: string // SHA-256 hash of session data
}

// Permission checks
export interface Permissions {
  canAssignWorkers: boolean
  canApprovePhotos: boolean
  canEditPhases: boolean
  canViewAllSites: boolean
  canManageUsers: boolean
  canExportData: boolean
}

export const ROLE_PERMISSIONS: Record<UserRole, Permissions> = {
  worker: {
    canAssignWorkers: false,
    canApprovePhotos: false,
    canEditPhases: false,
    canViewAllSites: false,
    canManageUsers: false,
    canExportData: false,
  },
  crew_lead: {
    canAssignWorkers: false,
    canApprovePhotos: false,
    canEditPhases: false,
    canViewAllSites: false,
    canManageUsers: false,
    canExportData: false,
  },
  supervisor: {
    canAssignWorkers: true,
    canApprovePhotos: true,
    canEditPhases: true,
    canViewAllSites: true,
    canManageUsers: false,
    canExportData: true,
  },
  operator: {
    canAssignWorkers: false,
    canApprovePhotos: false,
    canEditPhases: false,
    canViewAllSites: false,
    canManageUsers: false,
    canExportData: false,
  },
  builder: {
    canAssignWorkers: false,
    canApprovePhotos: false,
    canEditPhases: false,
    canViewAllSites: true,
    canManageUsers: false,
    canExportData: false,
  },
  admin: {
    canAssignWorkers: true,
    canApprovePhotos: true,
    canEditPhases: true,
    canViewAllSites: true,
    canManageUsers: true,
    canExportData: true,
  },
  owner: {
    canAssignWorkers: true,
    canApprovePhotos: true,
    canEditPhases: true,
    canViewAllSites: true,
    canManageUsers: true,
    canExportData: true,
  },
}
