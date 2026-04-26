/**
 * Shared Calendar Component
 * Used by Reports tab (single-day mode) and the future Invoice wizard
 * (range mode). Ported from onsite-timekeeper with the only changes
 * being the import paths.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, withOpacity } from '@onsite/tokens';
import { PressableOpacity } from './ui/PressableOpacity';
import { formatCompact } from '../lib/format';
import {
  getMonthCalendarDays,
  formatMonthYear,
  WEEKDAYS_SHORT,
  getDayKey,
  isSameDay,
  isToday as isTodayHelper,
  isFutureDay,
} from '../screens/home/helpers';

// ============================================
// SIZING
// ============================================
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_PADDING = 32;
const CALENDAR_GAP = 2;
const CALENDAR_WIDTH = Platform.OS === 'web' ? Math.min(SCREEN_WIDTH, 500) : SCREEN_WIDTH;
const DAY_SIZE = Math.floor((CALENDAR_WIDTH - CALENDAR_PADDING - (CALENDAR_GAP * 6)) / 7);

// ============================================
// TYPES
// ============================================
export type RangePosition = 'start' | 'end' | 'middle' | 'single' | null;

export interface CalendarProps {
  currentMonth: Date;
  onMonthChange: (date: Date) => void;

  mode: 'single' | 'range';

  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;

  getRangePosition?: (date: Date) => RangePosition;
  onRangeSelect?: (date: Date) => void;

  getDayMinutes?: (date: Date) => number;

  disableFutureDates?: boolean;

  showTodayButton?: boolean;
  onTodayPress?: () => void;

  onDayPress?: (dayKey: string, hasData: boolean) => void;

  showHeader?: boolean;

  containerWidth?: number;

  getDayHasNote?: (date: Date) => boolean;
}

// ============================================
// COMPONENT
// ============================================
export function Calendar({
  currentMonth,
  onMonthChange,
  mode,
  selectedDate,
  onDateSelect,
  getRangePosition,
  onRangeSelect,
  getDayMinutes,
  disableFutureDates = false,
  showTodayButton = false,
  onTodayPress,
  onDayPress,
  showHeader = true,
  containerWidth,
  getDayHasNote,
}: CalendarProps) {
  const daySize = useMemo(() => {
    if (!containerWidth) return DAY_SIZE;
    const w = Platform.OS === 'web' ? Math.min(containerWidth, 500) : containerWidth;
    return Math.floor((w - CALENDAR_PADDING - (CALENDAR_GAP * 6)) / 7);
  }, [containerWidth]);

  const calendarDays = useMemo(
    () => getMonthCalendarDays(currentMonth),
    [currentMonth],
  );

  const goToPrevMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    onMonthChange(prev);
  };

  const goToNextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    onMonthChange(next);
  };

  return (
    <View>
      {showHeader && (
        <View style={s.header}>
          <PressableOpacity style={s.navBtn} onPress={goToPrevMonth} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </PressableOpacity>
          <PressableOpacity onPress={onTodayPress} activeOpacity={0.7}>
            <Text style={s.monthTitle}>{formatMonthYear(currentMonth)}</Text>
          </PressableOpacity>
          <PressableOpacity style={s.navBtn} onPress={goToNextMonth} activeOpacity={0.6}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </PressableOpacity>
        </View>
      )}

      <View style={s.weekdayRow}>
        {WEEKDAYS_SHORT.map((d: string, i: number) => (
          <View key={i} style={[s.weekdayCell, containerWidth ? { width: daySize } : null]}>
            <Text style={s.weekdayText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={s.grid}>
        {calendarDays.map((date: Date, index: number) => {
          const isCurrentMonth =
            date.getMonth() === currentMonth.getMonth() &&
            date.getFullYear() === currentMonth.getFullYear();

          if (!isCurrentMonth) {
            return (
              <View key={`ghost-${index}`} style={[s.cell, s.ghostCell, containerWidth ? { width: daySize, height: daySize + 14 } : null]}>
                <Text style={s.ghostDayNum}>{date.getDate()}</Text>
              </View>
            );
          }

          const dayKey = getDayKey(date);
          const isTodayDate = isTodayHelper(date);
          const isFuture = disableFutureDates && isFutureDay(date);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const totalMinutes = getDayMinutes ? getDayMinutes(date) : 0;
          const hasData = totalMinutes > 0;
          const hasNote = getDayHasNote ? getDayHasNote(date) : false;

          const isSelected = mode === 'single' && selectedDate ? isSameDay(date, selectedDate) : false;
          const rangePosition = mode === 'range' && getRangePosition ? getRangePosition(date) : null;
          const isRangeEndpoint = rangePosition === 'start' || rangePosition === 'end' || rangePosition === 'single';

          return (
            <PressableOpacity
              key={dayKey}
              activeOpacity={0.6}
              disabled={isFuture}
              style={[
                s.cell,
                s.dayCell,
                containerWidth ? { width: daySize, height: daySize + 14 } : null,
                isWeekend && s.weekend,
                isTodayDate && !isSelected && !isRangeEndpoint && s.today,
                hasData && !isSelected && !isRangeEndpoint && s.hasData,
                isSelected && s.selected,
                rangePosition === 'start' && s.rangeStart,
                rangePosition === 'end' && s.rangeEnd,
                rangePosition === 'middle' && s.rangeMiddle,
                rangePosition === 'single' && s.rangeSingle,
                isFuture && { opacity: 0.35 },
              ]}
              onPress={() => {
                if (mode === 'range' && onRangeSelect) {
                  onRangeSelect(date);
                } else if (mode === 'single' && onDateSelect) {
                  onDateSelect(date);
                }
                if (onDayPress) {
                  onDayPress(dayKey, hasData);
                }
              }}
            >
              <Text
                style={[
                  s.dayNum,
                  isTodayDate && !isSelected && !isRangeEndpoint && s.dayNumToday,
                  (isSelected || isRangeEndpoint) && s.dayNumHighlight,
                ]}
              >
                {date.getDate()}
              </Text>
              {getDayMinutes ? (
                totalMinutes > 0 ? (
                  <Text
                    style={[
                      s.dayHours,
                      isTodayDate && !isSelected && !isRangeEndpoint && s.dayHoursToday,
                      (isSelected || isRangeEndpoint) && { color: colors.white },
                    ]}
                  >
                    {formatCompact(totalMinutes)}
                  </Text>
                ) : (
                  <Text style={s.dayHoursEmpty}>-</Text>
                )
              ) : null}
              {hasNote && <View style={s.noteDot} />}
            </PressableOpacity>
          );
        })}
      </View>

      {showTodayButton && onTodayPress && (
        <PressableOpacity style={s.todayBtn} onPress={onTodayPress} activeOpacity={0.7}>
          <Text style={s.todayBtnText}>Today</Text>
        </PressableOpacity>
      )}
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    columnGap: CALENDAR_GAP,
    marginBottom: 4,
  },
  weekdayCell: {
    width: DAY_SIZE,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: CALENDAR_GAP,
    rowGap: 3,
  },
  cell: {
    width: DAY_SIZE,
    height: DAY_SIZE + 14,
  },
  ghostCell: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
    paddingVertical: 6,
  },
  ghostDayNum: {
    fontSize: 13,
    fontWeight: '400',
    color: withOpacity(colors.textMuted, 0.4),
  },
  dayCell: {
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 6,
  },
  weekend: {
    backgroundColor: withOpacity(colors.textMuted, 0.35),
  },
  today: {
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  hasData: {
    backgroundColor: withOpacity(colors.primary, 0.15),
  },
  selected: {
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  rangeStart: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  rangeEnd: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  rangeMiddle: {
    backgroundColor: withOpacity(colors.primary, 0.3),
    borderRadius: 0,
  },
  rangeSingle: {
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dayNumToday: {
    color: colors.white,
    fontWeight: '700',
  },
  dayNumHighlight: {
    color: colors.white,
    fontWeight: '700',
  },
  dayHours: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  dayHoursToday: {
    color: colors.white,
  },
  dayHoursEmpty: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
  },
  noteDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textSecondary,
  },
  todayBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
  },
  todayBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});

export default Calendar;
