/**
 * Snackbar Store - OnSite Operator
 *
 * Lightweight global queue for short-lived toast messages.
 * Triggered from any screen via `useSnackbarStore.getState().show(...)`.
 * Rendered once at root if a SnackbarHost is added; otherwise messages
 * silently land in state with no visual.
 *
 * Ported verbatim from onsite-timekeeper.
 */

import { create } from 'zustand';

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

export interface SnackbarMessage {
  id: number;
  message: string;
  action?: SnackbarAction;
  durationMs: number;
}

interface SnackbarState {
  current: SnackbarMessage | null;
  show: (message: string, options?: { action?: SnackbarAction; durationMs?: number }) => void;
  dismiss: () => void;
}

let nextId = 1;

export const useSnackbarStore = create<SnackbarState>((set) => ({
  current: null,
  show: (message, options) => {
    set({
      current: {
        id: nextId++,
        message,
        action: options?.action,
        durationMs: options?.durationMs ?? 4000,
      },
    });
  },
  dismiss: () => set({ current: null }),
}));
