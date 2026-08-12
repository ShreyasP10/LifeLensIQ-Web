import { describe, it, expect } from 'vitest';
import {
  DAYS,
  normalizeTimetable,
  todayDay,
  minutesFromHHMM,
  todayClasses,
  currentClass,
  sampleTimetable,
} from '../timetable.js';

describe('normalizeTimetable', () => {
  it('accepts an entries array directly', () => {
    const raw = [{ day: 'mon', start: '09:00', end: '10:00', course: 'ML', venue: 'C-1' }];
    const out = normalizeTimetable(raw);
    expect(out[0]).toEqual({
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
      subject: 'ML',
      room: 'C-1',
      faculty: '',
      batch: '',
      elective: false,
    });
  });

  it('accepts an object with an entries key and aliases', () => {
    const out = normalizeTimetable({
      entries: [{ day: 'tue', from: '11:30', to: '12:30', name: 'DSA', teacher: 'Dr. X', e: 1 }],
    });
    expect(out[0].day).toBe('Tuesday');
    expect(out[0].subject).toBe('DSA');
    expect(out[0].faculty).toBe('Dr. X');
  });

  it('maps day prefix matchers', () => {
    for (const [given, want] of [
      ['monday', 'Monday'],
      ['MON', 'Monday'],
      ['wed', 'Wednesday'],
      ['sunday', 'Sunday'],
    ]) {
      expect(normalizeTimetable([{ day: given }])[0].day).toBe(want);
    }
  });

  it('throws on bad input', () => {
    expect(() => normalizeTimetable('nope')).toThrow();
    expect(() => normalizeTimetable({})).toThrow();
  });
});

describe('todayDay', () => {
  it('maps JS getDay to the week starting Monday', () => {
    const tuesday = new Date(2026, 7, 11); // Aug 11 2026 is a Tuesday
    expect(todayDay(tuesday)).toBe('Tuesday');
    const sunday = new Date(2026, 7, 16);
    expect(todayDay(sunday)).toBe('Sunday');
  });
});

describe('minutesFromHHMM', () => {
  it('parses HH:MM', () => {
    expect(minutesFromHHMM('09:30')).toBe(570);
    expect(minutesFromHHMM('23:59')).toBe(1439);
    expect(minutesFromHHMM('garbage')).toBe(0);
  });
});

describe('todayClasses / currentClass', () => {
  const timetable = sampleTimetable();

  it('filters classes to today and sorts by start', () => {
    const monday = new Date(2026, 7, 10, 10); // Monday
    const classes = todayClasses(timetable, monday);
    expect(classes.map((c) => c.subject)).toEqual([
      'Internet Programming',
      'Machine Learning',
    ]);
  });

  it('returns empty list when no classes today', () => {
    const saturday = new Date(2026, 7, 15, 10);
    expect(todayClasses(timetable, saturday)).toEqual([]);
  });

  it('finds the class in progress at a given time', () => {
    const monday = new Date(2026, 7, 10, 10, 0); // within 09:30-10:30
    const c = currentClass(timetable, monday);
    expect(c.subject).toBe('Internet Programming');
    expect(currentClass(timetable, new Date(2026, 7, 10, 13, 0))).toBeUndefined();
  });

  it('sample timetable is valid', () => {
    const entries = normalizeTimetable(sampleTimetable());
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(DAYS).toContain(e.day);
      expect(minutesFromHHMM(e.startTime)).toBeLessThan(minutesFromHHMM(e.endTime));
    }
  });
});