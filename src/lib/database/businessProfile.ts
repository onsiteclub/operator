/**
 * Database - Business Profile
 *
 * CRUD for business profile (one per user) and sync functions.
 * Used for invoice headers and PDF exports.
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { logger } from '../logger';
import {
  db,
  generateUUID,
  now,
  type BusinessProfileDB,
} from './core';

// ============================================
// TYPES
// ============================================

export interface UpsertBusinessProfileParams {
  userId: string;
  businessName: string;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressPostalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  businessNumber?: string | null;
  gstHstNumber?: string | null;
  defaultHourlyRate?: number | null;
  taxRate?: number | null;
  nextInvoiceNumber?: number | null;
}

// ============================================
// VALIDATION
// ============================================

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateCanadianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^(\+?1)?[0-9]{10}$/.test(cleaned);
}

export function validatePostalCode(code: string): boolean {
  return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(code.trim());
}

export function formatPostalCode(code: string): string {
  const cleaned = code.replace(/\s/g, '').toUpperCase();
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  return code.toUpperCase();
}

// ============================================
// CRUD
// ============================================

export function getBusinessProfile(userId: string): BusinessProfileDB | null {
  try {
    const result = db.getFirstSync<BusinessProfileDB>(
      `SELECT * FROM business_profile WHERE user_id = ?`,
      [userId]
    );
    return result ?? null;
  } catch (error) {
    logger.error('database', '[DB:business_profile] SELECT ERROR', { error: String(error) });
    return null;
  }
}

export function upsertBusinessProfile(params: UpsertBusinessProfileParams): string {
  const timestamp = now();
  const existing = getBusinessProfile(params.userId);
  const id = existing?.id || generateUUID();

  try {
    db.runSync(
      `INSERT OR REPLACE INTO business_profile (
        id, user_id, business_name,
        address_street, address_city, address_province, address_postal_code,
        phone, email, business_number, gst_hst_number,
        default_hourly_rate, tax_rate, next_invoice_number,
        created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.userId,
        params.businessName,
        params.addressStreet ?? null,
        params.addressCity ?? null,
        params.addressProvince ?? null,
        params.addressPostalCode ? formatPostalCode(params.addressPostalCode) : null,
        params.phone ?? null,
        params.email ?? null,
        params.businessNumber ?? null,
        params.gstHstNumber ?? null,
        params.defaultHourlyRate ?? null,
        params.taxRate ?? null,
        params.nextInvoiceNumber ?? existing?.next_invoice_number ?? 1,
        existing?.created_at || timestamp,
        timestamp,
      ]
    );

    logger.info('database', `[DB:business_profile] UPSERT OK - "${params.businessName}"`);
    return id;
  } catch (error) {
    logger.error('database', '[DB:business_profile] UPSERT ERROR', { error: String(error) });
    throw error;
  }
}

export function deleteBusinessProfile(userId: string): void {
  try {
    db.runSync(
      `DELETE FROM business_profile WHERE user_id = ?`,
      [userId]
    );
    logger.info('database', '[DB:business_profile] DELETE OK');
  } catch (error) {
    logger.error('database', '[DB:business_profile] DELETE ERROR', { error: String(error) });
  }
}

/**
 * Get the next safe invoice number and increment the counter.
 * Checks both business_profile.next_invoice_number AND the max existing
 * invoice in the DB to avoid UNIQUE constraint collisions.
 */
export function incrementInvoiceNumber(userId: string): number {
  const profile = getBusinessProfile(userId);
  let next = profile?.next_invoice_number ?? 1;

  try {
    const row = db.getFirstSync<{ max_num: number | null }>(
      `SELECT MAX(CAST(REPLACE(invoice_number, 'INV-', '') AS INTEGER)) as max_num FROM invoices WHERE user_id = ?`,
      [userId]
    );
    if (row?.max_num && row.max_num >= next) {
      next = row.max_num + 1;
      logger.warn('database', `[DB:business_profile] Counter was behind, corrected to ${next}`);
    }
  } catch {
    // Non-critical
  }

  try {
    db.runSync(
      `UPDATE business_profile SET next_invoice_number = ?, updated_at = ?, synced_at = NULL WHERE user_id = ?`,
      [next + 1, now(), userId]
    );
  } catch (error) {
    logger.error('database', '[DB:business_profile] INCREMENT INVOICE ERROR', { error: String(error) });
  }
  return next;
}

// ============================================
// SYNC
// ============================================

export function getUnsyncedBusinessProfile(userId: string): BusinessProfileDB | null {
  try {
    return db.getFirstSync<BusinessProfileDB>(
      `SELECT * FROM business_profile WHERE user_id = ? AND synced_at IS NULL`,
      [userId]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:business_profile] GET UNSYNCED ERROR', { error: String(error) });
    return null;
  }
}

export function markBusinessProfileSynced(userId: string): void {
  try {
    db.runSync(
      `UPDATE business_profile SET synced_at = ? WHERE user_id = ?`,
      [now(), userId]
    );
  } catch (error) {
    logger.error('database', '[DB:business_profile] MARK SYNCED ERROR', { error: String(error) });
  }
}

export function upsertBusinessProfileFromSync(remote: BusinessProfileDB): void {
  try {
    const existing = db.getFirstSync<BusinessProfileDB>(
      `SELECT * FROM business_profile WHERE user_id = ?`,
      [remote.user_id]
    );

    if (existing) {
      if (new Date(remote.updated_at) > new Date(existing.updated_at)) {
        db.runSync(
          `UPDATE business_profile SET
            business_name = ?, address_street = ?, address_city = ?,
            address_province = ?, address_postal_code = ?,
            phone = ?, email = ?, business_number = ?, gst_hst_number = ?,
            default_hourly_rate = ?, tax_rate = ?,
            updated_at = ?, synced_at = ?
          WHERE user_id = ?`,
          [
            remote.business_name, remote.address_street, remote.address_city,
            remote.address_province, remote.address_postal_code,
            remote.phone, remote.email, remote.business_number, remote.gst_hst_number,
            remote.default_hourly_rate, remote.tax_rate,
            remote.updated_at, now(),
            remote.user_id,
          ]
        );
      }
    } else {
      db.runSync(
        `INSERT INTO business_profile (
          id, user_id, business_name,
          address_street, address_city, address_province, address_postal_code,
          phone, email, business_number, gst_hst_number,
          default_hourly_rate, tax_rate,
          created_at, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          remote.id, remote.user_id, remote.business_name,
          remote.address_street, remote.address_city, remote.address_province, remote.address_postal_code,
          remote.phone, remote.email, remote.business_number, remote.gst_hst_number,
          remote.default_hourly_rate, remote.tax_rate,
          remote.created_at, remote.updated_at, now(),
        ]
      );
    }
  } catch (error) {
    logger.error('database', '[DB:business_profile] SYNC UPSERT ERROR', { error: String(error) });
  }
}
