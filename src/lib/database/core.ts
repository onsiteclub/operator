/**
 * Database Core - OnSite Operator
 *
 * SQLite instance, initialization, types and helpers.
 * Adapted from onsite-timekeeper. GPS/AI tables stripped — operator
 * doesn't track location or run AI corrections. Kept tables:
 *   daily_hours, business_profile, invoices, invoice_items, clients,
 *   active_tracking, error_log.
 */

import * as SQLite from 'expo-sqlite';
import { logger } from '../logger';

// ============================================
// DATABASE INSTANCE (Singleton)
// ============================================

export const db = SQLite.openDatabaseSync('onsite-operator.db');

// ============================================
// TYPES - ERROR LOG
// ============================================

export interface ErrorLogDB {
  id: string;
  user_id: string | null;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  error_context: string | null;
  app_version: string | null;
  os: string | null;
  os_version: string | null;
  device_model: string | null;
  occurred_at: string;
  created_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - DAILY HOURS (User-facing consolidated view)
// ============================================

export type DailyHoursSource = 'gps' | 'manual' | 'edited';
export type DailyHoursType = 'work' | 'rain' | 'snow' | 'sick' | 'dayoff' | 'holiday';

export interface DailyHoursDB {
  id: string;
  user_id: string;
  date: string;

  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;

  verified: number;
  source: DailyHoursSource;

  first_entry: string | null;
  last_exit: string | null;

  type: DailyHoursType;

  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - BUSINESS PROFILE
// ============================================

export interface BusinessProfileDB {
  id: string;
  user_id: string;
  business_name: string;
  address_street: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  phone: string | null;
  email: string | null;
  business_number: string | null;
  gst_hst_number: string | null;
  default_hourly_rate: number | null;
  tax_rate: number | null;
  next_invoice_number: number;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - INVOICES
// ============================================

export type InvoiceType = 'hourly' | 'products_services';
export type InvoiceStatus = 'pending' | 'paid';

export interface InvoiceDB {
  id: string;
  user_id: string;
  invoice_number: string;
  type: InvoiceType;
  client_name: string | null;
  client_id: string | null;
  status: InvoiceStatus;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  hourly_rate: number | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  notes: string | null;
  pdf_uri: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

// ============================================
// TYPES - CLIENTS
// ============================================

export interface ClientDB {
  id: string;
  user_id: string;
  client_name: string;
  address_street: string;
  address_city: string;
  address_province: string;
  address_postal_code: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface InvoiceItemDB {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

// ============================================
// TYPES - ACTIVE TRACKING (Singleton)
// ============================================

export interface ActiveTrackingDB {
  id: string;
  location_id: string;
  location_name: string;
  enter_at: string;
  pause_seconds: number;
  pause_start: string | null;
  created_at: string;
}

// ============================================
// INITIALIZATION
// ============================================

let dbInitialized = false;

export async function initDatabase(): Promise<void> {
  if (dbInitialized) {
    logger.debug('database', 'Database already initialized');
    return;
  }

  try {
    logger.info('boot', 'Initializing SQLite (operator)');

    // Error log
    db.execSync(`
      CREATE TABLE IF NOT EXISTS error_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        error_context TEXT,
        app_version TEXT,
        os TEXT,
        os_version TEXT,
        device_model TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `);

    // Daily hours — single source of truth for hours per day per user
    db.execSync(`
      CREATE TABLE IF NOT EXISTS daily_hours (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        total_minutes INTEGER NOT NULL DEFAULT 0,
        break_minutes INTEGER DEFAULT 0,
        location_name TEXT,
        location_id TEXT,
        verified INTEGER DEFAULT 0,
        source TEXT DEFAULT 'manual',
        type TEXT DEFAULT 'work',
        first_entry TEXT,
        last_exit TEXT,
        notes TEXT,
        deleted_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT,
        UNIQUE(user_id, date)
      )
    `);

    // Business profile
    db.execSync(`
      CREATE TABLE IF NOT EXISTS business_profile (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        business_name TEXT NOT NULL,
        address_street TEXT,
        address_city TEXT,
        address_province TEXT,
        address_postal_code TEXT,
        phone TEXT,
        email TEXT,
        business_number TEXT,
        gst_hst_number TEXT,
        default_hourly_rate REAL,
        tax_rate REAL,
        next_invoice_number INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT,
        UNIQUE(user_id)
      )
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_business_profile_user ON business_profile(user_id)`);

    // Active tracking — singleton row holds the in-progress shift
    db.execSync(`
      CREATE TABLE IF NOT EXISTS active_tracking (
        id TEXT PRIMARY KEY DEFAULT 'current',
        location_id TEXT NOT NULL,
        location_name TEXT NOT NULL,
        enter_at TEXT NOT NULL,
        pause_seconds INTEGER DEFAULT 0,
        pause_start TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Invoices
    db.execSync(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'hourly',
        client_name TEXT,
        client_id TEXT,
        status TEXT DEFAULT 'pending',
        subtotal REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        hourly_rate REAL,
        period_start TEXT,
        period_end TEXT,
        due_date TEXT,
        notes TEXT,
        pdf_uri TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT,
        UNIQUE(user_id, invoice_number)
      )
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        unit_price REAL DEFAULT 0,
        total REAL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      )
    `);

    // Clients
    db.execSync(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        address_street TEXT NOT NULL DEFAULT '',
        address_city TEXT NOT NULL DEFAULT '',
        address_province TEXT NOT NULL DEFAULT '',
        address_postal_code TEXT NOT NULL DEFAULT '',
        email TEXT,
        phone TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT,
        UNIQUE(user_id, client_name)
      )
    `);

    // Indexes
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_error_user ON error_log(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_error_type ON error_log(error_type)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_error_occurred ON error_log(occurred_at)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_daily_hours_user ON daily_hours(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_daily_hours_date ON daily_hours(date)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_daily_hours_synced ON daily_hours(synced_at)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(user_id, created_at)`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`);

    dbInitialized = true;
    logger.info('boot', 'SQLite initialized successfully');
  } catch (error) {
    logger.error('database', 'Error initializing SQLite', { error: String(error) });
    throw error;
  }
}

// ============================================
// HELPERS
// ============================================

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now(): string {
  return new Date().toISOString();
}

/**
 * Convert a Date to local YYYY-MM-DD string.
 * Do NOT use toISOString().split('T')[0] — that returns UTC date,
 * which is wrong for users in negative UTC offsets.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getToday(): string {
  return toLocalDateString(new Date());
}

export function calculateDuration(start: string, end: string | null): number {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (isNaN(startTime) || isNaN(endTime)) return 0;
  const diff = Math.round((endTime - startTime) / 60000);
  return diff > 0 ? diff : 0;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return '0min';
  }
  const total = Math.floor(Math.max(0, minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}
