export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function normalizeTimetable(raw) {
  const entries = Array.isArray(raw) ? raw : raw?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Expected an array of entries (or an object with an "entries" array).');
  }
  return entries.map((e) => ({
    day: normalizeDay(e.day),
    startTime: String(e.startTime || e.start || e.from || ''),
    endTime: String(e.endTime || e.end || e.to || ''),
    subject: String(e.subject || e.course || e.name || 'Untitled'),
    room: String(e.room || e.venue || ''),
    faculty: String(e.faculty || e.teacher || ''),
    batch: String(e.batch || ''),
    elective: Boolean(e.elective),
  }));
}

function normalizeDay(day) {
  if (!day) return '';
  const s = String(day).toLowerCase();
  const match = DAYS.find((d) => d.toLowerCase() === s || d.toLowerCase().startsWith(s.slice(0, 3)));
  return match || String(day);
}

export function todayDay(now = new Date()) {
  return DAYS[(now.getDay() + 6) % 7];
}

export function minutesFromHHMM(t) {
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function todayClasses(timetable, now = new Date()) {
  const day = todayDay(now);
  const entries = timetable?.entries || [];
  return entries
    .filter((e) => e.day === day)
    .sort((a, b) => minutesFromHHMM(a.startTime) - minutesFromHHMM(b.startTime));
}

export function currentClass(timetable, now = new Date()) {
  const classes = todayClasses(timetable, now);
  const mins = now.getHours() * 60 + now.getMinutes();
  return classes.find((c) => {
    const s = minutesFromHHMM(c.startTime);
    const e = minutesFromHHMM(c.endTime);
    return mins >= s && mins < e;
  });
}

export function sampleTimetable() {
  return {
    source: 'sample',
    generatedAt: Date.now(),
    batch: 'B1',
    entries: [
      { day: 'Monday', startTime: '09:30', endTime: '10:30', subject: 'Internet Programming', room: 'C-302', faculty: '', batch: 'B1', elective: true },
      { day: 'Monday', startTime: '11:30', endTime: '12:30', subject: 'Machine Learning', room: 'C-401', faculty: '', batch: 'B1', elective: false },
      { day: 'Wednesday', startTime: '09:30', endTime: '10:30', subject: 'Internet Programming', room: 'C-302', faculty: '', batch: 'B1', elective: true },
    ],
  };
}
