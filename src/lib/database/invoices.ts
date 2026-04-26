/**
 * Database - Invoices
 *
 * CRUD for invoices + invoice_items tables.
 * Supports hourly (from daily_hours) and products_services (custom line items).
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { logger } from '../logger';
import {
  db,
  generateUUID,
  now,
  toLocalDateString,
  type InvoiceDB,
  type InvoiceItemDB,
  type InvoiceType,
  type InvoiceStatus,
} from './core';

// ============================================
// TYPES
// ============================================

export interface CreateInvoiceParams {
  userId: string;
  invoiceNumber: string;
  type: InvoiceType;
  clientName: string;
  clientId?: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  hourlyRate?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  pdfUri?: string | null;
}

export interface CreateInvoiceItemParams {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sortOrder?: number;
}

// ============================================
// FORMAT HELPERS
// ============================================

export function formatInvoiceNumber(num: number): string {
  return `INV-${String(num).padStart(4, '0')}`;
}

export function isOverdue(invoice: InvoiceDB): boolean {
  if (invoice.status !== 'pending') return false;
  const today = new Date();
  if (invoice.due_date) {
    const due = new Date(invoice.due_date + 'T23:59:59');
    return today > due;
  }
  const created = new Date(invoice.created_at);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return created < thirtyDaysAgo;
}

// ============================================
// READ
// ============================================

export function getInvoice(userId: string, invoiceId: string): InvoiceDB | null {
  try {
    return db.getFirstSync<InvoiceDB>(
      `SELECT * FROM invoices WHERE user_id = ? AND id = ?`,
      [userId, invoiceId]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:invoices] SELECT ERROR', { error: String(error) });
    return null;
  }
}

export function getAllInvoices(userId: string): InvoiceDB[] {
  try {
    return db.getAllSync<InvoiceDB>(
      `SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
  } catch (error) {
    logger.error('database', '[DB:invoices] SELECT ALL ERROR', { error: String(error) });
    return [];
  }
}

export function getRecentInvoices(userId: string, limit: number = 20): InvoiceDB[] {
  try {
    return db.getAllSync<InvoiceDB>(
      `SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  } catch (error) {
    logger.error('database', '[DB:invoices] RECENT ERROR', { error: String(error) });
    return [];
  }
}

export function getInvoiceItems(invoiceId: string): InvoiceItemDB[] {
  try {
    return db.getAllSync<InvoiceItemDB>(
      `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC`,
      [invoiceId]
    );
  } catch (error) {
    logger.error('database', '[DB:invoice_items] SELECT ERROR', { error: String(error) });
    return [];
  }
}

// ============================================
// AGGREGATES
// ============================================

export function getThisMonthTotal(userId: string): number {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startStr = toLocalDateString(firstDay);
    const endStr = toLocalDateString(lastDay);

    const result = db.getFirstSync<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total FROM invoices
       WHERE user_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
      [userId, startStr, endStr]
    );
    return result?.total ?? 0;
  } catch (error) {
    logger.error('database', '[DB:invoices] THIS MONTH TOTAL ERROR', { error: String(error) });
    return 0;
  }
}

export function getPendingTotal(userId: string): number {
  try {
    const result = db.getFirstSync<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total FROM invoices
       WHERE user_id = ? AND status = 'pending'`,
      [userId]
    );
    return result?.total ?? 0;
  } catch (error) {
    logger.error('database', '[DB:invoices] PENDING TOTAL ERROR', { error: String(error) });
    return 0;
  }
}

export function getOverdueTotal(userId: string): number {
  try {
    const todayStr = toLocalDateString(new Date());
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    const result = db.getFirstSync<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total FROM invoices
       WHERE user_id = ? AND status = 'pending'
       AND (
         (due_date IS NOT NULL AND due_date < ?)
         OR (due_date IS NULL AND created_at < ?)
       )`,
      [userId, todayStr, cutoff]
    );
    return result?.total ?? 0;
  } catch (error) {
    logger.error('database', '[DB:invoices] OVERDUE TOTAL ERROR', { error: String(error) });
    return 0;
  }
}

export function getThisMonthCount(userId: string): number {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startStr = toLocalDateString(firstDay);
    const endStr = toLocalDateString(lastDay);

    const result = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM invoices
       WHERE user_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?`,
      [userId, startStr, endStr]
    );
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

export function getPendingCount(userId: string): number {
  try {
    const result = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM invoices
       WHERE user_id = ? AND status = 'pending'`,
      [userId]
    );
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

export function getDistinctClientNames(userId: string): string[] {
  try {
    const rows = db.getAllSync<{ client_name: string }>(
      `SELECT DISTINCT client_name FROM invoices
       WHERE user_id = ? AND client_name IS NOT NULL AND client_name != ''
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => r.client_name);
  } catch (error) {
    logger.error('database', '[DB:invoices] CLIENTS ERROR', { error: String(error) });
    return [];
  }
}

// ============================================
// CREATE
// ============================================

export function createInvoice(params: CreateInvoiceParams): InvoiceDB | null {
  const id = generateUUID();
  const timestamp = now();

  try {
    db.runSync(
      `INSERT INTO invoices (
        id, user_id, invoice_number, type, client_name, client_id, status,
        subtotal, tax_rate, tax_amount, total,
        hourly_rate, period_start, period_end, due_date,
        notes, pdf_uri, created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        params.userId,
        params.invoiceNumber,
        params.type,
        params.clientName,
        params.clientId ?? null,
        params.subtotal,
        params.taxRate,
        params.taxAmount,
        params.total,
        params.hourlyRate ?? null,
        params.periodStart ?? null,
        params.periodEnd ?? null,
        params.dueDate ?? null,
        params.notes ?? null,
        params.pdfUri ?? null,
        timestamp,
        timestamp,
      ]
    );

    logger.info('invoice', `[DB:invoices] CREATED ${params.invoiceNumber} — $${params.total.toFixed(2)}`);
    return getInvoice(params.userId, id);
  } catch (error) {
    logger.error('database', '[DB:invoices] CREATE ERROR', { error: String(error) });
    return null;
  }
}

export function createInvoiceWithItems(
  params: CreateInvoiceParams,
  items: CreateInvoiceItemParams[]
): InvoiceDB | null {
  const invoiceId = generateUUID();
  const timestamp = now();

  try {
    db.runSync(
      `INSERT INTO invoices (
        id, user_id, invoice_number, type, client_name, client_id, status,
        subtotal, tax_rate, tax_amount, total,
        hourly_rate, period_start, period_end, due_date,
        notes, pdf_uri, created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        invoiceId,
        params.userId,
        params.invoiceNumber,
        params.type,
        params.clientName,
        params.clientId ?? null,
        params.subtotal,
        params.taxRate,
        params.taxAmount,
        params.total,
        params.hourlyRate ?? null,
        params.periodStart ?? null,
        params.periodEnd ?? null,
        params.dueDate ?? null,
        params.notes ?? null,
        params.pdfUri ?? null,
        timestamp,
        timestamp,
      ]
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      db.runSync(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(),
          invoiceId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.total,
          item.sortOrder ?? i,
        ]
      );
    }

    logger.info('invoice', `[DB:invoices] CREATED ${params.invoiceNumber} with ${items.length} items — $${params.total.toFixed(2)}`);
    return getInvoice(params.userId, invoiceId);
  } catch (error) {
    logger.error('database', '[DB:invoices] CREATE WITH ITEMS ERROR', { error: String(error) });
    return null;
  }
}

// ============================================
// UPDATE
// ============================================

export function updateInvoiceStatus(userId: string, invoiceId: string, status: InvoiceStatus): boolean {
  try {
    db.runSync(
      `UPDATE invoices SET status = ?, updated_at = ?, synced_at = NULL WHERE user_id = ? AND id = ?`,
      [status, now(), userId, invoiceId]
    );
    logger.info('invoice', `[DB:invoices] STATUS → ${status} (id: ${invoiceId.slice(0, 8)})`);
    return true;
  } catch (error) {
    logger.error('database', '[DB:invoices] STATUS UPDATE ERROR', { error: String(error) });
    return false;
  }
}

export interface UpdateInvoiceParams {
  clientName?: string;
  taxRate?: number;
  hourlyRate?: number | null;
  dueDate?: string | null;
  notes?: string | null;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
}

export function updateInvoice(userId: string, invoiceId: string, params: UpdateInvoiceParams): InvoiceDB | null {
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (params.clientName !== undefined) { fields.push('client_name = ?'); values.push(params.clientName); }
    if (params.taxRate !== undefined) { fields.push('tax_rate = ?'); values.push(params.taxRate); }
    if (params.hourlyRate !== undefined) { fields.push('hourly_rate = ?'); values.push(params.hourlyRate); }
    if (params.dueDate !== undefined) { fields.push('due_date = ?'); values.push(params.dueDate); }
    if (params.notes !== undefined) { fields.push('notes = ?'); values.push(params.notes || null); }
    if (params.subtotal !== undefined) { fields.push('subtotal = ?'); values.push(params.subtotal); }
    if (params.taxAmount !== undefined) { fields.push('tax_amount = ?'); values.push(params.taxAmount); }
    if (params.total !== undefined) { fields.push('total = ?'); values.push(params.total); }

    if (fields.length === 0) return getInvoice(userId, invoiceId);

    fields.push('updated_at = ?', 'synced_at = NULL', 'pdf_uri = NULL');
    values.push(now(), userId, invoiceId);

    db.runSync(
      `UPDATE invoices SET ${fields.join(', ')} WHERE user_id = ? AND id = ?`,
      values
    );
    logger.info('invoice', `[DB:invoices] UPDATED (id: ${invoiceId.slice(0, 8)})`);
    return getInvoice(userId, invoiceId);
  } catch (error) {
    logger.error('database', '[DB:invoices] UPDATE ERROR', { error: String(error) });
    return null;
  }
}

export function replaceInvoiceItems(invoiceId: string, items: CreateInvoiceItemParams[]): boolean {
  try {
    db.runSync(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invoiceId]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      db.runSync(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateUUID(), invoiceId, item.description, item.quantity, item.unitPrice, item.total, item.sortOrder ?? i]
      );
    }
    logger.info('invoice', `[DB:invoices] REPLACED ${items.length} items for ${invoiceId.slice(0, 8)}`);
    return true;
  } catch (error) {
    logger.error('database', '[DB:invoices] REPLACE ITEMS ERROR', { error: String(error) });
    return false;
  }
}

export function updateInvoicePdfUri(invoiceId: string, pdfUri: string): boolean {
  try {
    db.runSync(
      `UPDATE invoices SET pdf_uri = ?, updated_at = ? WHERE id = ?`,
      [pdfUri, now(), invoiceId]
    );
    return true;
  } catch (error) {
    logger.error('database', '[DB:invoices] PDF URI UPDATE ERROR', { error: String(error) });
    return false;
  }
}

export function deleteInvoice(userId: string, invoiceId: string): boolean {
  try {
    db.runSync(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invoiceId]);
    db.runSync(`DELETE FROM invoices WHERE user_id = ? AND id = ?`, [userId, invoiceId]);
    logger.info('invoice', `[DB:invoices] DELETED (id: ${invoiceId.slice(0, 8)})`);
    return true;
  } catch (error) {
    logger.error('database', '[DB:invoices] DELETE ERROR', { error: String(error) });
    return false;
  }
}
