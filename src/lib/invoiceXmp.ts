/**
 * Invoice XMP Metadata - OnSite Operator
 *
 * Embeds structured XMP metadata into generated invoice PDFs using the
 * shared OnSite Club namespace so downstream systems (OnSite Ops) can
 * parse invoice fields precisely when the PDF is delivered by email.
 *
 * Ported verbatim from onsite-timekeeper.
 *
 * Namespace: http://schemas.onsiteclub.ca/invoice/1.0/
 */

import * as FileSystem from 'expo-file-system';
import { PDFDocument, PDFName } from 'pdf-lib';
import { logger } from './logger';

// ============================================
// TYPES
// ============================================

export interface OnsiteInvoiceXmp {
  invoice_number: string;
  amount: number;
  hst: number;
  currency: string;
  gc_name: string;
  site_address: string;
  issuer_email: string;
  issuer_name: string;
  company_name: string;
  company_hst_number: string;
  hours_logged: number;
  issued_at: string;
  timekeeper_version: string;
}

// ============================================
// HELPERS
// ============================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function formatHours(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
}

// ============================================
// XMP PACKET BUILDER
// ============================================

export function buildXmpPacket(meta: OnsiteInvoiceXmp): string {
  const fields: [string, string][] = [
    ['invoice_number', escapeXml(meta.invoice_number ?? '')],
    ['amount', formatDecimal(meta.amount)],
    ['hst', formatDecimal(meta.hst)],
    ['currency', escapeXml(meta.currency ?? '')],
    ['gc_name', escapeXml(meta.gc_name ?? '')],
    ['site_address', escapeXml(meta.site_address ?? '')],
    ['issuer_email', escapeXml(meta.issuer_email ?? '')],
    ['issuer_name', escapeXml(meta.issuer_name ?? '')],
    ['company_name', escapeXml(meta.company_name ?? '')],
    ['company_hst_number', escapeXml(meta.company_hst_number ?? '')],
    ['hours_logged', formatHours(meta.hours_logged)],
    ['issued_at', escapeXml(meta.issued_at ?? '')],
    ['timekeeper_version', escapeXml(meta.timekeeper_version ?? '')],
  ];

  const body = fields
    .map(([k, v]) => `      <onsite:${k}>${v}</onsite:${k}>`)
    .join('\n');

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="OnSite Operator">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:onsite="http://schemas.onsiteclub.ca/invoice/1.0/">
${body}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// ============================================
// BASE64 <-> UINT8ARRAY (chunked, RN-safe)
// ============================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
  return bytes;
}

// ============================================
// PDF POST-PROCESSING
// ============================================

export async function embedXmpIntoPdf(
  pdfUri: string,
  meta: OnsiteInvoiceXmp,
): Promise<void> {
  try {
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const pdfBytes = base64ToBytes(base64);

    const pdfDoc = await PDFDocument.load(pdfBytes, {
      updateMetadata: false,
    });

    const xmpPacket = buildXmpPacket(meta);
    const xmpBytes = utf8Encode(xmpPacket);

    const metadataStream = pdfDoc.context.stream(xmpBytes);
    metadataStream.dict.set(PDFName.of('Type'), PDFName.of('Metadata'));
    metadataStream.dict.set(PDFName.of('Subtype'), PDFName.of('XML'));

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    const newBytes = await pdfDoc.save({ useObjectStreams: false });
    const newBase64 = bytesToBase64(newBytes);

    await FileSystem.writeAsStringAsync(pdfUri, newBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    logger.debug('invoice', 'XMP metadata embedded', {
      invoiceNumber: meta.invoice_number,
    });
  } catch (err) {
    logger.warn('invoice', 'Failed to embed XMP metadata', {
      error: String(err),
    });
  }
}
