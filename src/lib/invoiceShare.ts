/**
 * Invoice Share - OnSite Operator
 *
 * Hands the local invoice PDF to the OS share sheet via expo-sharing.
 * Recipient apps (WhatsApp, email, Files, Drive, etc.) get a regular
 * PDF attachment named after the invoice number.
 *
 * Ported verbatim from onsite-timekeeper. Sentry breadcrumb is a no-op
 * (see src/lib/sentry shim).
 */

import * as Sharing from 'expo-sharing';
import type { InvoiceDB } from './database/core';
import { logger } from './logger';
import { addSentryBreadcrumb } from './sentry';

export async function shareInvoice(_userId: string, invoice: InvoiceDB): Promise<boolean> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'shareInvoice skipped — no PDF URI on invoice');
    return false;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) {
      logger.warn('invoice', 'Native sharing not available');
      return false;
    }
    await Sharing.shareAsync(invoice.pdf_uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${invoice.invoice_number}`,
      UTI: 'com.adobe.pdf',
    });
    addSentryBreadcrumb('invoice', 'Invoice PDF shared', {
      invoiceNumber: invoice.invoice_number,
    });
    return true;
  } catch (err) {
    logger.warn('invoice', 'Invoice share failed', { error: String(err) });
    return false;
  }
}
