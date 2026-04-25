/**
 * Electronic Signature Utilities
 * Creates verifiable signatures for documents, photos, and actions
 */

import type { SignatureSession, User } from './types'

// Generate a hash from string data (simplified - use crypto in production)
function generateHash(data: string): string {
  // In production, use crypto.subtle.digest or a proper hashing library
  // This is a simplified version for demo purposes
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + '-' + Date.now().toString(16)
}

/**
 * Creates a signature session for a user action
 */
export function createSignature(
  user: User,
  action: string,
  deviceId?: string,
  location?: { latitude: number; longitude: number }
): SignatureSession {
  const timestamp = new Date().toISOString()

  const signatureData = JSON.stringify({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action,
    timestamp,
    deviceId,
    location,
  })

  const hash = generateHash(signatureData)

  return {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    timestamp,
    deviceId,
    location,
    hash,
  }
}

/**
 * Verifies a signature (simplified version)
 */
export function verifySignature(signature: SignatureSession): boolean {
  // In production, verify against stored hash
  return !!signature.hash && signature.hash.length > 0
}

/**
 * Formats signature for display
 */
export function formatSignature(signature: SignatureSession): string {
  const date = new Date(signature.timestamp)
  const formattedDate = date.toLocaleDateString('pt-BR')
  const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return `Assinado por ${signature.userName} em ${formattedDate} às ${formattedTime}`
}

/**
 * Creates a signature for photo uploads
 */
export function signPhoto(
  user: User,
  photoUri: string,
  phaseId: string,
  houseId: string,
  deviceId?: string,
  location?: { latitude: number; longitude: number }
): SignatureSession & { metadata: Record<string, string> } {
  const signature = createSignature(user, 'photo_upload', deviceId, location)

  return {
    ...signature,
    metadata: {
      photoUri,
      phaseId,
      houseId,
      action: 'photo_upload',
    },
  }
}

/**
 * Creates a signature for document acknowledgment
 */
export function signDocumentAck(
  user: User,
  documentId: string,
  documentType: string
): SignatureSession & { metadata: Record<string, string> } {
  const signature = createSignature(user, 'document_acknowledgment')

  return {
    ...signature,
    metadata: {
      documentId,
      documentType,
      action: 'document_acknowledgment',
    },
  }
}
