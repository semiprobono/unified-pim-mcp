import {
  addDays,
  differenceInMilliseconds,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
} from 'date-fns';

/**
 * Date range value object with validation and utility methods
 */
export class DateRange {
  public readonly start: Date;
  public readonly end: Date;

  constructor(start: Date, end: Date) {
    // Ensure start is before or equal to end
    if (isAfter(start, end)) {
      throw new Error('Start date must be before or equal to end date');
    }

    this.start = new Date(start);
    this.end = new Date(end);
  }

  /**
   * Creates a DateRange for a single day
   */
  static singleDay(date: Date): DateRange {
    return new DateRange(startOfDay(date), endOfDay(date));
  }

  /**
   * Creates a DateRange for today
   */
  static today(): DateRange {
    const now = new Date();
    return DateRange.singleDay(now);
  }

  /**
   * Creates a DateRange for this week
   */
  static thisWeek(): DateRange {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return new DateRange(startOfDay(startOfWeek), endOfDay(endOfWeek));
  }

  /**
   * Creates a DateRange for this month
   */
  static thisMonth(): DateRange {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return new DateRange(startOfDay(startOfMonth), endOfDay(endOfMonth));
  }

  /**
   * Creates a DateRange for the next N days
   */
  static nextDays(days: number): DateRange {
    const now = new Date();
    const end = addDays(now, days);
    return new DateRange(now, end);
  }

  /**
   * Creates a DateRange from ISO strings
   */
  static fromISOStrings(startISO: string, endISO: string): DateRange {
    return new DateRange(new Date(startISO), new Date(endISO));
  }

  /**
   * Creates a DateRange spanning from start of first date to end of second date
   */
  static spanning(startDate: Date, endDate: Date): DateRange {
    return new DateRange(startOfDay(startDate), endOfDay(endDate));
  }

  /**
   * Gets the duration in milliseconds
   */
  get durationMs(): number {
    return differenceInMilliseconds(this.end, this.start);
  }

  /**
   * Gets the duration in minutes
   */
  get durationMinutes(): number {
    return Math.round(this.durationMs / (1000 * 60));
  }

  /**
   * Gets the duration in hours
   */
  get durationHours(): number {
    return Math.round(this.durationMs / (1000 * 60 * 60));
  }

  /**
   * Gets the duration in days
   */
  get durationDays(): number {
    return Math.round(this.durationMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Checks if this range is a single day
   */
  get isSingleDay(): boolean {
    return this.start.toDateString() === this.end.toDateString();
  }

  /**
   * Checks if this range spans multiple days
   */
  get isMultiDay(): boolean {
    return !this.isSingleDay;
  }

  /**
   * Checks if the range includes today
   */
  get includesToday(): boolean {
    const now = new Date();
    return this.contains(now);
  }

  /**
   * Checks if the range is in the past
   */
  get isInPast(): boolean {
    const now = new Date();
    return isBefore(this.end, now);
  }

  /**
   * Checks if the range is in the future
   */
  get isInFuture(): boolean {
    const now = new Date();
    return isAfter(this.start, now);
  }

  /**
   * Checks if the range is currently active (now is within the range)
   */
  get isActive(): boolean {
    const now = new Date();
    return this.contains(now);
  }

  /**
   * Checks if a date is within this range
   */
  contains(date: Date): boolean {
    return (
      (isEqual(date, this.start) || isAfter(date, this.start)) &&
      (isEqual(date, this.end) || isBefore(date, this.end))
    );
  }

  /**
   * Checks if this range overlaps with another range
   */
  overlaps(other: DateRange): boolean {
    return isBefore(this.start, other.end) && isAfter(this.end, other.start);
  }

  /**
   * Checks if this range completely contains another range
   */
  fullyContains(other: DateRange): boolean {
    return (
      (isEqual(this.start, other.start) || isBefore(this.start, other.start)) &&
      (isEqual(this.end, other.end) || isAfter(this.end, other.end))
    );
  }

  /**
   * Gets the intersection with another range
   */
  intersection(other: DateRange): DateRange | null {
    if (!this.overlaps(other)) {
      return null;
    }

    const intersectionStart = isAfter(this.start, other.start) ? this.start : other.start;
    const intersectionEnd = isBefore(this.end, other.end) ? this.end : other.end;

    return new DateRange(intersectionStart, intersectionEnd);
  }

  /**
   * Gets the union with another range (if they overlap or are adjacent)
   */
  union(other: DateRange): DateRange | null {
    // Check if ranges overlap or are adjacent
    const gap = Math.abs(differenceInMilliseconds(this.end, other.start));
    const adjacentGap = Math.abs(differenceInMilliseconds(other.end, this.start));

    if (!this.overlaps(other) && gap > 1000 && adjacentGap > 1000) {
      return null; // Ranges are not adjacent or overlapping
    }

    const unionStart = isBefore(this.start, other.start) ? this.start : other.start;
    const unionEnd = isAfter(this.end, other.end) ? this.end : other.end;

    return new DateRange(unionStart, unionEnd);
  }

  /**
   * Extends the range by adding time to start and/or end
   */
  extend(startMs: number = 0, endMs: number = 0): DateRange {
    const newStart = new Date(this.start.getTime() + startMs);
    const newEnd = new Date(this.end.getTime() + endMs);
    return new DateRange(newStart, newEnd);
  }

  /**
   * Shifts the entire range by a time offset
   */
  shift(offsetMs: number): DateRange {
    return new DateRange(
      new Date(this.start.getTime() + offsetMs),
      new Date(this.end.getTime() + offsetMs)
    );
  }

  /**
   * Splits the range into smaller ranges by a given interval
   */
  split(intervalMs: number): DateRange[] {
    const ranges: DateRange[] = [];
    let currentStart = new Date(this.start);

    while (isBefore(currentStart, this.end)) {
      const currentEnd = new Date(
        Math.min(currentStart.getTime() + intervalMs, this.end.getTime())
      );
      ranges.push(new DateRange(currentStart, currentEnd));
      currentStart = new Date(currentEnd.getTime() + 1); // Add 1ms to avoid overlap
    }

    return ranges;
  }

  /**
   * Gets an array of individual days in the range
   */
  getDays(): Date[] {
    const days: Date[] = [];
    let currentDay = startOfDay(this.start);
    const endDay = startOfDay(this.end);

    while (!isAfter(currentDay, endDay)) {
      days.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }

    return days;
  }

  /**
   * Formats the range as a string
   */
  format(dateFormat: string = 'yyyy-MM-dd', separator: string = ' to '): string {
    const startFormatted = format(this.start, dateFormat);
    const endFormatted = format(this.end, dateFormat);

    if (this.isSingleDay) {
      return startFormatted;
    }

    return `${startFormatted}${separator}${endFormatted}`;
  }

  /**
   * Gets a human-readable description
   */
  toHumanString(): string {
    const now = new Date();

    if (this.isSingleDay) {
      if (this.start.toDateString() === now.toDateString()) {
        return 'Today';
      } else if (this.start.toDateString() === addDays(now, 1).toDateString()) {
        return 'Tomorrow';
      } else if (this.start.toDateString() === addDays(now, -1).toDateString()) {
        return 'Yesterday';
      } else {
        return format(this.start, 'MMM d, yyyy');
      }
    }

    const daysDiff = this.durationDays;
    if (daysDiff === 7) {
      return '1 week';
    } else if (daysDiff <= 30) {
      return `${daysDiff} days`;
    } else {
      return this.format('MMM d, yyyy');
    }
  }

  /**
   * Checks equality with another DateRange
   */
  equals(other: DateRange): boolean {
    return isEqual(this.start, other.start) && isEqual(this.end, other.end);
  }

  /**
   * Clones the DateRange
   */
  clone(): DateRange {
    return new DateRange(new Date(this.start), new Date(this.end));
  }

  /**
   * Converts to ISO string representation
   */
  toString(): string {
    return `${this.start.toISOString()}/${this.end.toISOString()}`;
  }

  /**
   * Converts to JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      start: this.start.toISOString(),
      end: this.end.toISOString(),
      durationMs: this.durationMs,
      durationMinutes: this.durationMinutes,
      durationHours: this.durationHours,
      durationDays: this.durationDays,
      isSingleDay: this.isSingleDay,
      isMultiDay: this.isMultiDay,
      includesToday: this.includesToday,
      isInPast: this.isInPast,
      isInFuture: this.isInFuture,
      isActive: this.isActive,
      humanString: this.toHumanString(),
    };
  }

  /**
   * Creates DateRange from JSON object
   */
  static fromJSON(json: any): DateRange {
    return new DateRange(new Date(json.start), new Date(json.end));
  }
}
