/**
 * Clients - OnSite Operator
 *
 * CRUD for the clients table. Stores client name + address for reuse
 * across invoices. Ported verbatim from onsite-timekeeper.
 */

import { db, generateUUID, now, type ClientDB } from './core';
import { logger } from '../logger';

// ============================================
// TYPES
// ============================================

export interface CreateClientParams {
  userId: string;
  clientName: string;
  addressStreet: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  email?: string | null;
  phone?: string | null;
}

// ============================================
// QUERIES
// ============================================

export function getClients(userId: string): ClientDB[] {
  try {
    return db.getAllSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? ORDER BY client_name ASC`,
      [userId]
    );
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting clients', { error: String(error) });
    return [];
  }
}

export function getClientByName(userId: string, clientName: string): ClientDB | null {
  try {
    return db.getFirstSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? AND client_name = ? COLLATE NOCASE`,
      [userId, clientName]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting client by name', { error: String(error) });
    return null;
  }
}

export function getClientById(userId: string, clientId: string): ClientDB | null {
  try {
    return db.getFirstSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? AND id = ?`,
      [userId, clientId]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting client by id', { error: String(error) });
    return null;
  }
}

// ============================================
// UPSERT
// ============================================

export function upsertClient(params: CreateClientParams): ClientDB | null {
  const { userId, clientName, addressStreet, addressCity, addressProvince, addressPostalCode, email, phone } = params;

  try {
    const existing = getClientByName(userId, clientName);

    if (existing) {
      const timestamp = now();
      db.runSync(
        `UPDATE clients SET
          address_street = ?, address_city = ?, address_province = ?, address_postal_code = ?,
          email = ?, phone = ?, updated_at = ?, synced_at = NULL
        WHERE id = ?`,
        [
          addressStreet, addressCity, addressProvince, addressPostalCode,
          email ?? null, phone ?? null, timestamp,
          existing.id,
        ]
      );
      logger.info('database', `[DB:clients] Updated client: ${__DEV__ ? clientName : 'id=' + existing.id.slice(0, 8)}`);
      return getClientById(userId, existing.id);
    }

    const id = generateUUID();
    const timestamp = now();

    db.runSync(
      `INSERT INTO clients (
        id, user_id, client_name,
        address_street, address_city, address_province, address_postal_code,
        email, phone, created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id, userId, clientName,
        addressStreet, addressCity, addressProvince, addressPostalCode,
        email ?? null, phone ?? null, timestamp, timestamp,
      ]
    );

    logger.info('database', `[DB:clients] Created client: ${__DEV__ ? clientName : 'id=' + id.slice(0, 8)}`);
    return getClientById(userId, id);
  } catch (error) {
    logger.error('database', '[DB:clients] Error upserting client', { error: String(error) });
    return null;
  }
}

// ============================================
// DELETE
// ============================================

export function deleteClient(userId: string, clientId: string): boolean {
  try {
    db.runSync(
      `DELETE FROM clients WHERE user_id = ? AND id = ?`,
      [userId, clientId]
    );
    logger.info('database', `[DB:clients] Deleted client: ${clientId}`);
    return true;
  } catch (error) {
    logger.error('database', '[DB:clients] Error deleting client', { error: String(error) });
    return false;
  }
}
