/**
 * Invoice PDF Generator - OnSite Operator
 *
 * Generates professional invoice PDFs for both hourly and
 * products/services invoices. Reuses the expo-print plumbing in
 * timesheetPdf.ts. Ported from onsite-timekeeper with the footer
 * line rebranded.
 */

import type { BusinessProfileDB, DailyHoursDB, InvoiceItemDB } from './database/core';
import { generatePDFFileUri } from './timesheetPdf';
import { addSentryBreadcrumb } from './sentry';
import { embedXmpIntoPdf, type OnsiteInvoiceXmp } from './invoiceXmp';

// ============================================
// HELPERS
// ============================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatHoursHM(minutes: number): string {
  if (minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function buildLetterhead(bp: BusinessProfileDB | null): string {
  if (!bp) {
    return `
    <div class="letterhead">
      <div class="company-name">INVOICE</div>
    </div>
    `;
  }

  const addressParts = [bp.address_street, bp.address_city, bp.address_province, bp.address_postal_code].filter(Boolean);
  const contactParts = [
    bp.phone ? `Tel: ${bp.phone}` : '',
    bp.email ? `Email: ${bp.email}` : '',
    bp.business_number ? `BN: ${bp.business_number}` : '',
    bp.gst_hst_number ? `GST/HST: ${bp.gst_hst_number}` : '',
  ].filter(Boolean);

  return `
    <div class="letterhead">
      <div class="company-name">${bp.business_name}</div>
      ${addressParts.length > 0 ? `<div class="company-subtitle">${addressParts.join(', ')}</div>` : ''}
      ${contactParts.length > 0 ? `<div class="company-info">${contactParts.join(' &nbsp;|&nbsp; ')}</div>` : ''}
    </div>
  `;
}

export interface ClientAddressForPDF {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  email?: string | null;
  phone?: string | null;
}

function buildBillTo(clientName: string, addr: ClientAddressForPDF | null | undefined): string {
  let html = `
    <div class="bill-to">
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-name">${escapeHtml(clientName)}</div>`;

  if (addr) {
    if (addr.street) html += `\n      <div class="bill-to-address">${addr.street}</div>`;
    const cityLine = [addr.city, addr.province, addr.postalCode].filter(Boolean).join(', ');
    if (cityLine) html += `\n      <div class="bill-to-address">${cityLine}</div>`;
    if (addr.email) html += `\n      <div class="bill-to-contact">Email: ${addr.email}</div>`;
    if (addr.phone) html += `\n      <div class="bill-to-contact">Tel: ${addr.phone}</div>`;
  }

  html += `\n    </div>`;
  return html;
}

// ============================================
// SHARED CSS
// ============================================

const INVOICE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10px;
    padding: 40px 50px;
    color: #333;
  }

  .letterhead {
    border-bottom: 3px solid #1a365d;
    padding-bottom: 20px;
    margin-bottom: 30px;
  }
  .company-name {
    font-size: 22px;
    font-weight: bold;
    color: #1a365d;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .company-subtitle {
    font-size: 9px;
    color: #666;
    margin-top: 4px;
  }
  .company-info {
    margin-top: 8px;
    font-size: 8px;
    color: #888;
    line-height: 1.6;
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 30px;
  }
  .invoice-title {
    font-size: 24px;
    font-weight: bold;
    color: #1a365d;
    text-transform: uppercase;
    letter-spacing: 3px;
  }
  .invoice-meta {
    text-align: right;
    font-size: 10px;
    color: #555;
    line-height: 1.8;
  }
  .invoice-meta strong {
    color: #1a365d;
  }

  .bill-to {
    margin-bottom: 25px;
    padding: 12px 16px;
    background: #f8f9fa;
    border-left: 3px solid #1a365d;
  }
  .bill-to-label {
    font-size: 8px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .bill-to-name {
    font-size: 14px;
    font-weight: 600;
    color: #1a365d;
  }
  .bill-to-address {
    font-size: 10px;
    color: #555;
    margin-top: 2px;
  }
  .bill-to-contact {
    font-size: 9px;
    color: #888;
    margin-top: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  th {
    background: #f8f9fa;
    color: #1a365d;
    font-weight: 600;
    font-size: 9px;
    padding: 10px 8px;
    text-align: left;
    border-bottom: 2px solid #1a365d;
  }
  th:not(:first-child) { text-align: center; }
  th:last-child { text-align: right; }
  td {
    padding: 8px;
    border-bottom: 1px solid #e9ecef;
    vertical-align: middle;
  }
  .day-col { font-weight: 500; color: #1a365d; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 600; }

  .totals-section {
    margin-top: 10px;
    width: 280px;
    margin-left: auto;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 10px;
    border-bottom: 1px solid #e9ecef;
  }
  .totals-row.grand {
    background: #eef2ff;
    border-top: 2px solid #1a365d;
    border-bottom: 2px solid #1a365d;
    font-weight: bold;
    font-size: 13px;
    color: #1a365d;
    padding: 12px;
  }

  .payment-terms {
    margin-top: 30px;
    padding: 12px 16px;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 9px;
    color: #666;
  }

  .notes-section {
    margin-top: 20px;
    padding: 12px 16px;
    border-left: 3px solid #1a365d;
    background: #fafbfc;
  }
  .notes-label {
    font-size: 8px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .notes-body {
    font-size: 10px;
    color: #444;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .footer {
    margin-top: 32px;
    padding-top: 10px;
    font-size: 6.5px;
    font-style: italic;
    color: #d0d0d0;
    text-align: center;
    letter-spacing: 0.3px;
  }
`;

const FOOTER_LINE = 'this document was generated by onsite operator &middot; onsiteclub.ca';

// ============================================
// HOURLY INVOICE HTML
// ============================================

export function generateHourlyInvoiceHTML(params: {
  invoiceNumber: string;
  businessProfile: BusinessProfileDB | null;
  clientName: string;
  clientAddress?: ClientAddressForPDF | null;
  days: DailyHoursDB[];
  hourlyRate: number;
  taxRate: number;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  notes?: string | null;
}): string {
  const { invoiceNumber, businessProfile, clientName, clientAddress, days, hourlyRate, taxRate, periodStart, periodEnd, dueDate, notes } = params;

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let totalAmount = 0;

  const tableRows = sortedDays.map(day => {
    const hours = day.total_minutes / 60;
    const amount = hours * hourlyRate;
    totalAmount += amount;

    const breakStr = day.break_minutes > 0 ? formatHoursHM(day.break_minutes) : '';

    return `
      <tr>
        <td class="day-col">${formatDateShort(day.date)}</td>
        <td class="center">${day.first_entry || ''}</td>
        <td class="center">${day.last_exit || ''}</td>
        <td class="center">${breakStr}</td>
        <td class="center bold">${formatHoursHM(day.total_minutes)}</td>
        <td class="right">$${amount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const taxAmount = totalAmount * (taxRate / 100);
  const grandTotal = totalAmount + taxAmount;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${INVOICE_CSS}</style>
</head>
<body>
  ${buildLetterhead(businessProfile)}

  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">
    <div>
      <div class="invoice-title">INVOICE</div>
    </div>
    <div class="invoice-meta">
      <strong>${invoiceNumber}</strong><br>
      Date: ${formatDate(new Date())}<br>
      Period: ${formatDateShort(periodStart)} — ${formatDateShort(periodEnd)}
    </div>
  </div>

  ${buildBillTo(clientName, clientAddress)}

  <table>
    <thead>
      <tr>
        <th>Day / Date</th>
        <th>Start</th>
        <th>End</th>
        <th>Break</th>
        <th>Hours</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-row">
      <span>${sortedDays.length} days &times; $${hourlyRate.toFixed(2)}/hr</span>
      <span>$${totalAmount.toFixed(2)}</span>
    </div>
    ${taxRate > 0 ? `
    <div class="totals-row">
      <span>${businessProfile?.gst_hst_number ? 'HST' : 'Tax'} (${taxRate}%)</span>
      <span>$${taxAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    <div class="totals-row grand">
      <span>TOTAL</span>
      <span>$${grandTotal.toFixed(2)}</span>
    </div>
  </div>

  <div class="payment-terms">
    Service period: ${formatDateShort(periodStart)} — ${formatDateShort(periodEnd)}<br>
    Payment due by: ${dueDate ? formatDate(new Date(dueDate + 'T12:00:00')) : formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}
  </div>

  ${notes && notes.trim() ? `
  <div class="notes-section">
    <div class="notes-label">Notes</div>
    <div class="notes-body">${escapeHtml(notes)}</div>
  </div>
  ` : ''}

  <div class="footer">${FOOTER_LINE}</div>
</body>
</html>
  `.trim();
}

// ============================================
// PRODUCTS & SERVICES INVOICE HTML
// ============================================

export function generateProductsInvoiceHTML(params: {
  invoiceNumber: string;
  businessProfile: BusinessProfileDB | null;
  clientName: string;
  clientAddress?: ClientAddressForPDF | null;
  items: InvoiceItemDB[];
  taxRate: number;
  dueDate?: string | null;
  notes?: string | null;
}): string {
  const { invoiceNumber, businessProfile, clientName, clientAddress, items, taxRate, dueDate, notes } = params;

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxAmount;

  const tableRows = items.map((item, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">$${(item.unit_price ?? 0).toFixed(2)}</td>
      <td class="right bold">$${(item.total ?? 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${INVOICE_CSS}</style>
</head>
<body>
  ${buildLetterhead(businessProfile)}

  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">
    <div>
      <div class="invoice-title">INVOICE</div>
    </div>
    <div class="invoice-meta">
      <strong>${invoiceNumber}</strong><br>
      Date: ${formatDate(new Date())}
    </div>
  </div>

  ${buildBillTo(clientName, clientAddress)}

  <table>
    <thead>
      <tr>
        <th style="width:40px; text-align:center">#</th>
        <th>Description</th>
        <th style="width:80px; text-align:center">Qty / Sq Ft</th>
        <th style="width:90px; text-align:right">Unit Price</th>
        <th style="width:90px; text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>$${subtotal.toFixed(2)}</span>
    </div>
    ${taxRate > 0 ? `
    <div class="totals-row">
      <span>${businessProfile?.gst_hst_number ? 'HST' : 'Tax'} (${taxRate}%)</span>
      <span>$${taxAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    <div class="totals-row grand">
      <span>TOTAL</span>
      <span>$${grandTotal.toFixed(2)}</span>
    </div>
  </div>

  <div class="payment-terms">
    Invoice date: ${formatDate(new Date())}<br>
    Payment due by: ${dueDate ? formatDate(new Date(dueDate + 'T12:00:00')) : formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}
  </div>

  ${notes && notes.trim() ? `
  <div class="notes-section">
    <div class="notes-label">Notes</div>
    <div class="notes-body">${escapeHtml(notes)}</div>
  </div>
  ` : ''}

  <div class="footer">${FOOTER_LINE}</div>
</body>
</html>
  `.trim();
}

// ============================================
// HOURS REPORT HTML (simple, no monetary values)
// ============================================

export function generateHoursReportHTML(params: {
  businessProfile: BusinessProfileDB | null;
  clientName: string;
  days: DailyHoursDB[];
  periodStart: string;
  periodEnd: string;
}): string {
  const { businessProfile, clientName, days, periodStart, periodEnd } = params;

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let totalMinutes = 0;

  const tableRows = sortedDays.map(day => {
    totalMinutes += day.total_minutes;
    const breakStr = day.break_minutes > 0 ? formatHoursHM(day.break_minutes) : '';

    return `
      <tr>
        <td class="day-col">${formatDateShort(day.date)}</td>
        <td class="center">${day.first_entry || ''}</td>
        <td class="center">${day.last_exit || ''}</td>
        <td class="center">${breakStr}</td>
        <td class="center bold">${formatHoursHM(day.total_minutes)}</td>
      </tr>
    `;
  }).join('');

  const letterhead = businessProfile ? buildLetterhead(businessProfile) : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${INVOICE_CSS}
    th:last-child { text-align: center; }
  </style>
</head>
<body>
  ${letterhead}

  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">
    <div>
      <div class="invoice-title">HOURS REPORT</div>
    </div>
    <div class="invoice-meta">
      Date: ${formatDate(new Date())}<br>
      Period: ${formatDateShort(periodStart)} — ${formatDateShort(periodEnd)}
    </div>
  </div>

  <div class="bill-to">
    <div class="bill-to-label">Prepared For</div>
    <div class="bill-to-name">${clientName}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Day / Date</th>
        <th>Start</th>
        <th>End</th>
        <th>Break</th>
        <th>Hours</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-row">
      <span>Total Days</span>
      <span>${sortedDays.length}</span>
    </div>
    <div class="totals-row grand">
      <span>TOTAL HOURS</span>
      <span>${formatHoursHM(totalMinutes)}</span>
    </div>
  </div>

  <div class="footer">${FOOTER_LINE}</div>
</body>
</html>
  `.trim();
}

// ============================================
// PDF FILE GENERATION
// ============================================

export async function generateInvoicePDF(
  html: string,
  invoiceNumber: string,
  xmpMetadata?: OnsiteInvoiceXmp,
): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PDF generation timed out after 30s')), 30_000),
  );
  const uri = await Promise.race([
    generatePDFFileUri(html, invoiceNumber, new Date()),
    timeout,
  ]);
  if (xmpMetadata) {
    await embedXmpIntoPdf(uri, xmpMetadata);
  }
  addSentryBreadcrumb('invoice', 'Invoice PDF generated', { type: 'invoice', invoiceNumber });
  return uri;
}
