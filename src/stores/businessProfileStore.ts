/**
 * Business Profile Store - OnSite Operator
 *
 * In-memory cache of business profile from SQLite.
 * SQLite is the source of truth; the store is a UI-friendly mirror.
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { create } from 'zustand';
import { Alert } from 'react-native';
import { logger } from '../lib/logger';
import {
  getBusinessProfile,
  upsertBusinessProfile,
  deleteBusinessProfile as dbDelete,
  incrementInvoiceNumber as dbIncrementInvoice,
  validateEmail,
  validateCanadianPhone,
  validatePostalCode,
  type UpsertBusinessProfileParams,
} from '../lib/database/businessProfile';
import type { BusinessProfileDB } from '../lib/database/core';

// ============================================
// TYPES
// ============================================

interface BusinessProfileState {
  profile: BusinessProfileDB | null;
  isLoading: boolean;

  loadProfile: (userId: string) => void;
  saveProfile: (userId: string, data: Omit<UpsertBusinessProfileParams, 'userId'>) => boolean;
  incrementInvoiceNumber: (userId: string) => number;
  clearProfile: () => void;
  deleteProfile: (userId: string) => void;
}

// ============================================
// STORE
// ============================================

export const useBusinessProfileStore = create<BusinessProfileState>()((set) => ({
  profile: null,
  isLoading: false,

  loadProfile: (userId: string) => {
    try {
      set({ isLoading: true });
      const profile = getBusinessProfile(userId);
      set({ profile, isLoading: false });
    } catch (error) {
      logger.error('database', 'Error loading business profile', { error: String(error) });
      set({ isLoading: false });
    }
  },

  saveProfile: (userId: string, data: Omit<UpsertBusinessProfileParams, 'userId'>): boolean => {
    const errors: string[] = [];

    if (!data.businessName?.trim()) {
      errors.push('Name is required');
    }

    if (data.email && !validateEmail(data.email)) {
      errors.push('Invalid email format');
    }

    if (data.phone && !validateCanadianPhone(data.phone)) {
      errors.push('Invalid phone format (use 10-digit Canadian number)');
    }

    if (data.addressPostalCode && !validatePostalCode(data.addressPostalCode)) {
      errors.push('Invalid postal code (use A1A 1A1 format)');
    }

    if (data.taxRate !== undefined && data.taxRate !== null) {
      if (data.taxRate < 0 || data.taxRate > 100) {
        errors.push('Tax rate must be between 0 and 100');
      }
    }

    if (errors.length > 0) {
      Alert.alert('Validation Error', errors.join('\n'));
      return false;
    }

    try {
      upsertBusinessProfile({ userId, ...data });
      const profile = getBusinessProfile(userId);
      set({ profile });
      logger.info('database', `Business profile saved: "${data.businessName}"`);
      return true;
    } catch (error) {
      logger.error('database', 'Error saving business profile', { error: String(error) });
      Alert.alert('Error', 'Failed to save business profile');
      return false;
    }
  },

  incrementInvoiceNumber: (userId: string): number => {
    const invoiceNum = dbIncrementInvoice(userId);
    const profile = getBusinessProfile(userId);
    set({ profile });
    return invoiceNum;
  },

  clearProfile: () => {
    set({ profile: null });
  },

  deleteProfile: (userId: string) => {
    try {
      dbDelete(userId);
      set({ profile: null });
      logger.info('database', 'Business profile deleted');
    } catch (error) {
      logger.error('database', 'Error deleting business profile', { error: String(error) });
    }
  },
}));
