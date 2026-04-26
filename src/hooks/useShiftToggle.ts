/**
 * useShiftToggle — bridges the existing operator online/offline toggle
 * (machine.tsx) to the timesheet tracking layer (dailyLogStore).
 *
 * "Going online" in the morning starts a shift; "Going offline (shift end)"
 * closes it and writes minutes to daily_hours.
 *
 * Other offline reasons (broken, low fuel, maintenance) are NOT shift ends
 * — the machinist is just unavailable for orders, not off the clock. Those
 * cases call the existing setOffline directly (we don't stop tracking).
 *
 * The locationName placeholder is "Operator" because this app doesn't
 * track GPS — daily_hours.location_name is informational only.
 */

import { useCallback } from 'react';
import { useOperatorStore } from '../store/operator';
import { useDailyLogStore } from '../stores/dailyLogStore';

const SHIFT_LOCATION_ID = 'operator-shift';
const SHIFT_LOCATION_NAME = 'Operator';

export function useShiftToggle() {
  const isOnline = useOperatorStore((s) => s.isOnline);
  const setOnline = useOperatorStore((s) => s.setOnline);
  const setOffline = useOperatorStore((s) => s.setOffline);

  const isTracking = useDailyLogStore((s) => s.tracking.isTracking);
  const startTracking = useDailyLogStore((s) => s.startTracking);
  const stopTracking = useDailyLogStore((s) => s.stopTracking);

  /**
   * Begin a shift: machine goes online AND the timesheet timer starts.
   * Used by the morning "Go online" button.
   */
  const startShift = useCallback(() => {
    setOnline();
    if (!isTracking) {
      startTracking(SHIFT_LOCATION_ID, SHIFT_LOCATION_NAME);
    }
  }, [setOnline, isTracking, startTracking]);

  /**
   * End the shift: machine goes offline with reason "shift end" AND the
   * timer stops + minutes are written to daily_hours.
   */
  const endShift = useCallback(() => {
    setOffline('shift end');
    if (isTracking) {
      stopTracking();
    }
  }, [setOffline, isTracking, stopTracking]);

  return {
    isOnline,
    isTracking,
    startShift,
    endShift,
  };
}
