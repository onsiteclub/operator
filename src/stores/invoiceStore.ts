/**
 * Invoice Store - OnSite Operator
 *
 * Manages invoice dashboard state, creation flows, and client
 * management. SQLite is the source of truth — this store is an
 * in-memory cache around it.
 *
 * Ported verbatim from onsite-timekeeper. The products/services flow
 * is kept (no semantic changes) even though the operator UI does not
 * surface it — leaving it intact avoids fragmenting the store.
 */

import { create } from 'zustand';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { logger } from '../lib/logger';
import {
  getRecentInvoices,
  getThisMonthTotal,
  getThisMonthCount,
  getDistinctClientNames,
  createInvoice,
  createInvoiceWithItems,
  updateInvoicePdfUri,
  formatInvoiceNumber,
  deleteInvoice as dbDeleteInvoice,
  getInvoiceItems,
  updateInvoice as dbUpdateInvoice,
  replaceInvoiceItems,
  type CreateInvoiceItemParams,
  type UpdateInvoiceParams,
} from '../lib/database/invoices';
import { getClients, upsertClient, deleteClient as dbDeleteClient, getClientByName, type CreateClientParams } from '../lib/database/clients';
import { getDailyHoursByPeriod } from '../lib/database/daily';
import type { InvoiceDB, DailyHoursDB, ClientDB, BusinessProfileDB } from '../lib/database/core';
import { useBusinessProfileStore } from './businessProfileStore';
import { useAuthStore } from './authStore';
import { generateHourlyInvoiceHTML, generateProductsInvoiceHTML, generateInvoicePDF } from '../lib/invoicePdf';
import type { OnsiteInvoiceXmp } from '../lib/invoiceXmp';

// ============================================
// XMP METADATA BUILDER
// ============================================

function toIsoUtc(sqliteTs: string | null | undefined): string {
  if (!sqliteTs) return new Date().toISOString();
  if (sqliteTs.includes('T')) {
    return sqliteTs.endsWith('Z') ? sqliteTs : `${sqliteTs}Z`;
  }
  return `${sqliteTs.replace(' ', 'T')}Z`;
}

function getAppVersion(): string {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    'unknown'
  );
}

function buildOnsiteXmp(params: {
  invoiceNumber: string;
  businessProfile: BusinessProfileDB | null;
  clientName: string;
  siteAddress: string;
  subtotal: number;
  taxAmount: number;
  hoursLogged: number;
  issuedAt: string;
}): OnsiteInvoiceXmp {
  const auth = useAuthStore.getState();
  const bp = params.businessProfile;
  return {
    invoice_number: params.invoiceNumber,
    amount: params.subtotal,
    hst: params.taxAmount,
    currency: 'CAD',
    gc_name: params.clientName || '',
    site_address: params.siteAddress || '',
    issuer_email: bp?.email || auth.user?.email || '',
    issuer_name: auth.cachedFullName || '',
    company_name: bp?.business_name || '',
    company_hst_number: bp?.gst_hst_number || '',
    hours_logged: params.hoursLogged,
    issued_at: params.issuedAt,
    timekeeper_version: getAppVersion(),
  };
}

function firstLocationName(days: DailyHoursDB[]): string {
  for (const d of days) {
    if (d.location_name && d.location_name.trim()) return d.location_name;
  }
  return '';
}

// ============================================
// TYPES
// ============================================

export interface ClientAddress {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  email?: string | null;
  phone?: string | null;
}

interface InvoiceState {
  thisMonthTotal: number;
  thisMonthCount: number;
  recentInvoices: InvoiceDB[];
  isLoading: boolean;
  recentClients: string[];
  clients: ClientDB[];

  loadDashboard: (userId: string) => void;
  loadRecentInvoices: (userId: string) => void;
  loadClientNames: (userId: string) => void;
  loadClients: (userId: string) => void;

  saveClient: (params: CreateClientParams) => ClientDB | null;
  removeClient: (userId: string, clientId: string) => void;

  createHourlyInvoice: (params: {
    userId: string;
    clientName: string;
    clientId?: string | null;
    clientAddress?: ClientAddress | null;
    days: DailyHoursDB[];
    hourlyRate: number;
    taxRate: number;
    periodStart: string;
    periodEnd: string;
    dueDate?: string;
    notes?: string;
  }) => Promise<InvoiceDB | null>;

  createProductsInvoice: (params: {
    userId: string;
    clientName: string;
    clientId?: string | null;
    clientAddress?: ClientAddress | null;
    items: { description: string; quantity: number; unitPrice: number }[];
    taxRate: number;
    dueDate?: string;
    notes?: string;
  }) => Promise<InvoiceDB | null>;

  updateInvoice: (userId: string, invoiceId: string, params: UpdateInvoiceParams, newItems?: CreateInvoiceItemParams[]) => Promise<InvoiceDB | null>;
  deleteInvoice: (userId: string, invoiceId: string) => boolean;
  regeneratePdf: (userId: string, invoice: InvoiceDB) => Promise<string | null>;
  refreshAll: (userId: string) => void;
  clear: () => void;
}

// ============================================
// STORE
// ============================================

export const useInvoiceStore = create<InvoiceState>()((set, get) => ({
  thisMonthTotal: 0,
  thisMonthCount: 0,
  recentInvoices: [],
  isLoading: false,
  recentClients: [],
  clients: [],

  loadDashboard: (userId: string) => {
    try {
      set({ isLoading: true });
      const thisMonthTotal = getThisMonthTotal(userId);
      const thisMonthCount = getThisMonthCount(userId);
      const recentInvoices = getRecentInvoices(userId, 20);
      const recentClients = getDistinctClientNames(userId);
      const clients = getClients(userId);

      set({
        thisMonthTotal,
        thisMonthCount,
        recentInvoices,
        recentClients,
        clients,
        isLoading: false,
      });
    } catch (error) {
      logger.error('invoice', 'Error loading dashboard', { error: String(error) });
      set({ isLoading: false });
    }
  },

  loadRecentInvoices: (userId: string) => {
    try {
      const recentInvoices = getRecentInvoices(userId, 20);
      set({ recentInvoices });
    } catch (error) {
      logger.error('invoice', 'Error loading recent invoices', { error: String(error) });
    }
  },

  loadClientNames: (userId: string) => {
    try {
      const recentClients = getDistinctClientNames(userId);
      set({ recentClients });
    } catch (error) {
      logger.error('invoice', 'Error loading client names', { error: String(error) });
    }
  },

  loadClients: (userId: string) => {
    try {
      const clients = getClients(userId);
      set({ clients });
    } catch (error) {
      logger.error('invoice', 'Error loading clients', { error: String(error) });
    }
  },

  saveClient: (params: CreateClientParams) => {
    try {
      const client = upsertClient(params);
      if (client) {
        const clients = getClients(params.userId);
        set({ clients });
        logger.info('invoice', `Client saved: ${__DEV__ ? params.clientName : 'client'}`);
      }
      return client;
    } catch (error) {
      logger.error('invoice', 'Error saving client', { error: String(error) });
      return null;
    }
  },

  removeClient: (userId: string, clientId: string) => {
    const success = dbDeleteClient(userId, clientId);
    if (success) {
      const clients = getClients(userId);
      set({ clients });
    }
  },

  createHourlyInvoice: async (params) => {
    const { userId, clientName, clientId, clientAddress, days, hourlyRate, taxRate, periodStart, periodEnd, dueDate, notes } = params;

    try {
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;
      const invoiceNum = bpStore.incrementInvoiceNumber(userId);
      const invoiceNumber = formatInvoiceNumber(invoiceNum);

      const totalMinutes = days.reduce((sum, d) => sum + (d.total_minutes || 0), 0);
      const totalHours = totalMinutes / 60;
      const subtotal = Math.round(totalHours * hourlyRate * 100) / 100;
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const invoice = createInvoice({
        userId,
        invoiceNumber,
        type: 'hourly',
        clientName,
        clientId: clientId ?? null,
        subtotal,
        taxRate,
        taxAmount,
        total,
        hourlyRate,
        periodStart,
        periodEnd,
        dueDate: dueDate ?? null,
        notes: notes ?? null,
      });

      if (!invoice) return null;

      try {
        const html = generateHourlyInvoiceHTML({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          clientAddress: clientAddress ?? null,
          days,
          hourlyRate,
          taxRate,
          periodStart,
          periodEnd,
          dueDate: dueDate ?? null,
          notes: notes ?? null,
        });
        const xmp = buildOnsiteXmp({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          siteAddress: firstLocationName(days),
          subtotal,
          taxAmount,
          hoursLogged: totalHours,
          issuedAt: toIsoUtc(invoice.created_at),
        });
        const pdfUri = await generateInvoicePDF(html, invoiceNumber, xmp);
        updateInvoicePdfUri(invoice.id, pdfUri);
        invoice.pdf_uri = pdfUri;
      } catch (pdfError) {
        logger.warn('invoice', 'PDF generation failed (invoice still created)', { error: String(pdfError) });
      }

      get().loadDashboard(userId);
      logger.info('invoice', `Hourly invoice created: ${invoiceNumber}${__DEV__ ? ` — $${total.toFixed(2)}` : ''}`);
      return invoice;
    } catch (error) {
      logger.error('invoice', 'Error creating hourly invoice', { error: String(error) });
      return null;
    }
  },

  createProductsInvoice: async (params) => {
    const { userId, clientName, clientId, clientAddress, items, taxRate, dueDate, notes } = params;

    try {
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;
      const invoiceNum = bpStore.incrementInvoiceNumber(userId);
      const invoiceNumber = formatInvoiceNumber(invoiceNum);

      const lineItems: CreateInvoiceItemParams[] = items.map((item, i) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sortOrder: i,
      }));

      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const invoice = createInvoiceWithItems(
        {
          userId,
          invoiceNumber,
          type: 'products_services',
          clientName,
          clientId: clientId ?? null,
          subtotal,
          taxRate,
          taxAmount,
          total,
          dueDate: dueDate ?? null,
          notes: notes ?? null,
        },
        lineItems
      );

      if (!invoice) return null;

      try {
        const persistedItems = getInvoiceItems(invoice.id);
        const html = generateProductsInvoiceHTML({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          clientAddress: clientAddress ?? null,
          items: persistedItems,
          taxRate,
          dueDate: dueDate ?? null,
          notes: notes ?? null,
        });
        const xmp = buildOnsiteXmp({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          siteAddress: '',
          subtotal,
          taxAmount,
          hoursLogged: 0,
          issuedAt: toIsoUtc(invoice.created_at),
        });
        const pdfUri = await generateInvoicePDF(html, invoiceNumber, xmp);
        updateInvoicePdfUri(invoice.id, pdfUri);
        invoice.pdf_uri = pdfUri;
      } catch (pdfError) {
        logger.warn('invoice', 'PDF generation failed (invoice still created)', { error: String(pdfError) });
      }

      get().loadDashboard(userId);
      logger.info('invoice', `Products invoice created: ${invoiceNumber}${__DEV__ ? ` — $${total.toFixed(2)}` : ''}`);
      return invoice;
    } catch (error) {
      logger.error('invoice', 'Error creating products invoice', { error: String(error) });
      return null;
    }
  },

  updateInvoice: async (userId: string, invoiceId: string, params: UpdateInvoiceParams, newItems?: CreateInvoiceItemParams[]) => {
    try {
      const updated = dbUpdateInvoice(userId, invoiceId, params);
      if (!updated) return null;

      if (newItems) {
        replaceInvoiceItems(invoiceId, newItems);
      }

      await get().regeneratePdf(userId, updated);
      get().loadDashboard(userId);

      logger.info('invoice', `Invoice updated: ${updated.invoice_number}`);
      return updated;
    } catch (error) {
      logger.error('invoice', 'Error updating invoice', { error: String(error) });
      return null;
    }
  },

  deleteInvoice: (userId: string, invoiceId: string) => {
    try {
      const success = dbDeleteInvoice(userId, invoiceId);
      if (success) {
        get().loadDashboard(userId);
        logger.info('invoice', `Invoice deleted: ${invoiceId.slice(0, 8)}`);
      }
      return success;
    } catch (error) {
      logger.error('invoice', 'Error deleting invoice', { error: String(error) });
      return false;
    }
  },

  regeneratePdf: async (userId: string, invoice: InvoiceDB) => {
    try {
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;

      let clientAddress: ClientAddress | null = null;
      if (invoice.client_name) {
        const client = getClientByName(userId, invoice.client_name);
        if (client) {
          clientAddress = {
            street: client.address_street || '',
            city: client.address_city || '',
            province: client.address_province || '',
            postalCode: client.address_postal_code || '',
            email: client.email || null,
            phone: client.phone || null,
          };
        }
      }

      let html: string;
      let siteAddress = '';
      let hoursLogged = 0;

      if (invoice.type === 'products_services') {
        const items = getInvoiceItems(invoice.id);
        html = generateProductsInvoiceHTML({
          invoiceNumber: invoice.invoice_number,
          businessProfile,
          clientName: invoice.client_name || '',
          clientAddress,
          items,
          taxRate: invoice.tax_rate,
          dueDate: invoice.due_date ?? null,
          notes: invoice.notes ?? null,
        });
      } else {
        if (!invoice.period_start || !invoice.period_end) {
          logger.warn('invoice', 'Cannot regenerate hourly PDF — missing period dates');
          return null;
        }
        const days = getDailyHoursByPeriod(userId, invoice.period_start, invoice.period_end) as unknown as DailyHoursDB[];
        siteAddress = firstLocationName(days);
        hoursLogged = days.reduce((sum, d) => sum + (d.total_minutes || 0), 0) / 60;
        html = generateHourlyInvoiceHTML({
          invoiceNumber: invoice.invoice_number,
          businessProfile,
          clientName: invoice.client_name || '',
          clientAddress,
          days,
          hourlyRate: invoice.hourly_rate || 0,
          taxRate: invoice.tax_rate,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          dueDate: invoice.due_date ?? null,
          notes: invoice.notes ?? null,
        });
      }

      const xmp = buildOnsiteXmp({
        invoiceNumber: invoice.invoice_number,
        businessProfile,
        clientName: invoice.client_name || '',
        siteAddress,
        subtotal: invoice.subtotal,
        taxAmount: invoice.tax_amount,
        hoursLogged,
        issuedAt: toIsoUtc(invoice.created_at),
      });
      const pdfUri = await generateInvoicePDF(html, invoice.invoice_number, xmp);
      updateInvoicePdfUri(invoice.id, pdfUri);

      get().loadDashboard(userId);
      logger.info('invoice', `PDF regenerated for ${invoice.invoice_number}`);
      return pdfUri;
    } catch (error) {
      logger.error('invoice', 'Error regenerating PDF', { error: String(error) });
      return null;
    }
  },

  refreshAll: (userId: string) => {
    get().loadDashboard(userId);
  },

  clear: () => {
    set({
      thisMonthTotal: 0,
      thisMonthCount: 0,
      recentInvoices: [],
      recentClients: [],
      clients: [],
      isLoading: false,
    });
  },
}));
