/**
 * Timesheet PDF Generator - OnSite Operator
 *
 * Minimal port of the timekeeper module — operator only needs the
 * `generatePDFFileUri` helper that takes pre-built HTML and writes
 * it to the cache directory as a PDF (used by invoicePdf.ts).
 *
 * The session-aggregating "share timesheet" flow from timekeeper is
 * not ported — operator goes straight from daily_hours rows to
 * invoice HTML without an intermediate ComputedSession layer.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { toLocalDateString } from './database/core';

// Dynamic import for expo-print (may not be available without a rebuild
// — e.g. in Expo Go before linking native deps).
let Print: typeof import('expo-print') | null = null;
try {
  Print = require('expo-print');
} catch {
  // expo-print unavailable; PDF generation will throw a clear error.
}

/**
 * Generate a PDF file from HTML and return the file URI.
 * The file lives in the app's cache directory and is named after
 * `<prefix>_<periodStart>.pdf`.
 */
export async function generatePDFFileUri(
  html: string,
  prefix: string,
  periodStart: Date,
): Promise<string> {
  if (!Print) {
    throw new Error('PDF generation requires app rebuild with expo-print');
  }

  let { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  if (!uri.startsWith('file://')) {
    uri = `file://${uri}`;
  }

  const sanitized = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${sanitized}_${toLocalDateString(periodStart)}.pdf`;
  const cacheDir = FileSystem.cacheDirectory?.replace(/\/$/, '') || '';
  const newUri = `${cacheDir}/${fileName}`;

  await FileSystem.moveAsync({ from: uri, to: newUri });
  return newUri;
}

/**
 * Share a PDF file via the native share dialog.
 */
export async function sharePDFFile(fileUri: string, dialogTitle = 'Share PDF'): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle,
    });
  }
}
