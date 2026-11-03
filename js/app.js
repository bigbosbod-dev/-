'use strict';

// =====================================================================
// Storage & helpers
// =====================================================================
const KEYS = {
  schedules: 'schedules_data',
  tasks: 'tasks_data',
  stats: 'study_stats',
  gpaRows: 'gpa_rows',
  gpaSim: 'gpa_sim',
  pomo: 'pomo_settings',
  pomoSubject: 'pomo_subject',
  theme: 'theme',
  tab: 'last_tab',
  exams: 'exams_data',
  semesters: 'semesters_data',
  studyLog: 'study_log',
  reminders: 'reminder_settings',
  notified: 'notified_keys',
  calendar: 'calendar_settings',
  subjectColors: 'subject_colors',
  attendance: 'attendance_data',
  attendSettings: 'attendance_settings',
  subjectInfo: 'subject_info',
  scores: 'scores_data',
  notes: 'notes_data',
  cards: 'flashcards_data',
  flashLog: 'flash_log',
  studyView: 'study_view',
};

// อ่านข้อมูลอย่างปลอดภัย: ถ้าข้อมูลเสียหรือเบราว์เซอร์บล็อก storage จะใช้ค่าเริ่มต้นแทน แอปไม่พัง
function getStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    if (value === null || typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback)) {
      return fallback;
    }
    return value;
  } catch (err) {
    console.warn(`อ่านข้อมูล "${key}" ไม่ได้ ใช้ค่าเริ่มต้นแทน`, err);
    return fallback;
  }
}

// ข้อมูลที่ซิงก์ขึ้นคลาวด์ (ไม่รวมธีม แท็บล่าสุด ฯลฯ ที่เป็นของแต่ละเครื่อง)
const SYNCED_KEYS = new Set([
  'schedules_data', 'tasks_data', 'study_stats', 'study_log', 'gpa_rows', 'gpa_sim',
  'pomo_settings', 'exams_data', 'semesters_data', 'reminder_settings', 'calendar_settings',
  'subject_colors', 'attendance_data', 'attendance_settings', 'subject_info', 'scores_data',
  'notes_data', 'flashcards_data', 'flash_log',
]);
// sync.js จะมาแทนที่ฟังก์ชันนี้ เพื่อรู้ว่าข้อมูลเปลี่ยนแล้วต้องอัปโหลด
let onLocalDataChange = () => {};
let suppressChangeHook = false;

function setStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`บันทึกข้อมูล "${key}" ไม่ได้`, err);
  }
  if (SYNCED_KEYS.has(key) && !suppressChangeHook) {
    try { onLocalDataChange(); } catch (e) { console.warn(e); }
  }
}

// กันข้อความที่ผู้ใช้พิมพ์ (เช่น <script>) ไม่ให้ถูกตีความเป็น HTML
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const $ = (id) => document.getElementById(id);
const uid = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
const toId = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : uid();
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}

// ---------- Toast ----------
const TOAST_STYLES = {
  info: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};

function toast(message, type = 'info', ms = 3000) {
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm ${TOAST_STYLES[type] || TOAST_STYLES.info}`;
  el.textContent = message;
  const container = $('toast-container');
  container.appendChild(el);
  while (container.children.length > 3) container.firstElementChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- แอนิเมชัน ----------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
document.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);

// พลุกระดาษเล็ก ๆ จากจุดที่แตะล่าสุด (หรือกลางจอ)
function confetti({ x = lastPointer.x, y = lastPointer.y, count = 18, spread = 1 } = {}) {
  if (reduceMotion.matches) return;
  const colors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = (60 + Math.random() * 70) * spread;
    piece.className = 'confetti';
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.animationDelay = `${Math.random() * 60}ms`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1200);
}

// ให้เนื้อหาในแท็บค่อย ๆ ลอยขึ้นมาเมื่อสลับแท็บ
function animateIn(el) {
  if (!el || reduceMotion.matches) return;
  el.classList.remove('tab-enter');
  void el.offsetWidth; // เริ่มแอนิเมชันใหม่
  el.classList.add('tab-enter');
}

// ไล่ตัวเลขจากค่าเดิมไปค่าใหม่ (จำค่าเดิมไว้ตาม key จะได้ไม่นับใหม่ทุกครั้งที่วาดหน้าซ้ำ)
const countCache = {};
const COUNT_FORMATS = {
  int: (v) => String(Math.round(v)),
  dec1: (v) => (Math.round(v * 10) / 10).toLocaleString('th-TH', { maximumFractionDigits: 1 }),
  dec2: (v) => v.toFixed(2),
  dur: (v) => formatDuration(Math.round(v)),
};

function countUp(el, key, to, format = 'int', duration = 700) {
  if (!el || !Number.isFinite(to)) return;
  const fmt = COUNT_FORMATS[format] || COUNT_FORMATS.int;
  const from = countCache[key];
  countCache[key] = to;
  if (reduceMotion.matches || from === undefined && to === 0 || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const base = from === undefined ? 0 : from;
  const step = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(base + (to - base) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ใช้กับ HTML ที่สร้างใหม่: <span data-count="47" data-count-key="..." data-count-fmt="dec1">
function runCountUps(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    countUp(el, el.dataset.countKey, parseFloat(el.dataset.count), el.dataset.countFmt);
  });
}

// อีโมจิลอยขึ้นจากจุดที่แตะ
function floatEmoji(emoji, { x = lastPointer.x, y = lastPointer.y } = {}) {
  if (reduceMotion.matches) return;
  const el = document.createElement('span');
  el.className = 'float-emoji';
  el.textContent = emoji;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// อีโมจิโปรยลงมาทั้งจอ
function emojiRain(list, count = 18) {
  if (reduceMotion.matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < count; i++) {
    const e = document.createElement('span');
    e.className = 'rain-emoji';
    e.textContent = list[i % list.length];
    e.style.left = `${Math.random() * 100}%`;
    e.style.animationDelay = `${Math.random() * 600}ms`;
    e.style.animationDuration = `${1600 + Math.random() * 900}ms`;
    e.style.fontSize = `${18 + Math.random() * 18}px`;
    layer.appendChild(e);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}

// คลื่นแผ่ออกจากจุดที่แตะบนปุ่มหลัก ๆ
const RIPPLE_SELECTOR = '.btn-primary, .btn-secondary, .pill, .theme-opt, .bottom-tab';
document.addEventListener('pointerdown', (e) => {
  if (reduceMotion.matches) return;
  const host = e.target.closest(RIPPLE_SELECTOR);
  if (!host || host.disabled) return;
  const r = host.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${e.clientX - r.left - size / 2}px`;
  dot.style.top = `${e.clientY - r.top - size / 2}px`;
  host.appendChild(dot);
  setTimeout(() => dot.remove(), 600);
});

// =====================================================================
// Data sanitizers (ใช้ทั้งตอนโหลดและตอนนำเข้าไฟล์)
// =====================================================================
const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const STATUSES = ['todo', 'progress', 'done'];
const GRADE_POINTS = { 'A': 4.0, 'B+': 3.5, 'B': 3.0, 'C+': 2.5, 'C': 2.0, 'D+': 1.5, 'D': 1.0, 'F': 0.0 };
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POMO_DEFAULT = { focus: 25, short: 5, long: 15, longEvery: 4 };

function sanitizeSchedules(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s === 'object' && DAYS.includes(s.day) && TIME_RE.test(s.start) && TIME_RE.test(s.end))
    .map((s) => ({
      id: toId(s.id),
      name: String(s.name || 'ไม่มีชื่อวิชา').slice(0, 100),
      day: s.day,
      room: String(s.room || '').slice(0, 50),
      start: s.start,
      end: s.end,
    }));
}

function sanitizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t === 'object' && t.title)
    .map((t) => ({
      id: toId(t.id),
      title: String(t.title).slice(0, 200),
      subject: String(t.subject || 'ทั่วไป').slice(0, 100),
      due: DATE_RE.test(t.due) ? t.due : '',
      status: STATUSES.includes(t.status) ? t.status : 'todo',
      doneAt: t.status === 'done' && DATE_RE.test(t.doneAt) ? t.doneAt : '',
      notes: String(t.notes || '').slice(0, 2000),
      subtasks: sanitizeSubtasks(t.subtasks),
    }));
}

const SUBTASK_MAX = 50;

function sanitizeSubtasks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s === 'object' && String(s.text || '').trim())
    .slice(0, SUBTASK_MAX)
    .map((s) => ({
      id: toId(s.id),
      text: String(s.text).trim().slice(0, 200),
      done: s.done === true,
      due: DATE_RE.test(s.due) ? s.due : '',
    }));
}

function sanitizeStats(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0) out[String(k).slice(0, 100)] = Math.round(n);
  });
  return out;
}

function sanitizeGpaRows(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      name: String(r.name || '').slice(0, 100),
      credits: clamp(Number(r.credits) || 0, 0, 12),
      grade: r.grade in GRADE_POINTS ? r.grade : 'A',
    }));
}

function sanitizeGpaSim(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const out = {};
  ['gpax', 'credits', 'target', 'termCredits'].forEach((k) => {
    out[k] = src[k] === undefined || src[k] === null ? '' : String(src[k]).slice(0, 10);
  });
  return out;
}

function sanitizePomo(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const int = (v, d, min, max) => clamp(Math.round(Number(v)) || d, min, max);
  return {
    focus: int(src.focus, POMO_DEFAULT.focus, 1, 120),
    short: int(src.short, POMO_DEFAULT.short, 1, 60),
    long: int(src.long, POMO_DEFAULT.long, 1, 60),
    longEvery: int(src.longEvery, POMO_DEFAULT.longEvery, 2, 10),
  };
}

function sanitizeExams(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === 'object' && e.name && DATE_RE.test(e.date))
    .map((e) => ({
      id: toId(e.id),
      name: String(e.name).slice(0, 100),
      date: e.date,
      time: TIME_RE.test(e.time) ? e.time : '',
      room: String(e.room || '').slice(0, 50),
    }));
}

function sanitizeSemesters(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x === 'object' && Number.isFinite(Number(x.gpa)) && Number(x.credits) > 0)
    .map((x) => ({
      id: toId(x.id),
      name: String(x.name || 'ไม่มีชื่อ').slice(0, 30),
      gpa: clamp(Number(x.gpa), 0, 4),
      credits: clamp(Number(x.credits), 0, 60),
    }));
}

// study log: { 'YYYY-MM-DD': { วิชา: นาที } }
function sanitizeStudyLog(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([date, subjects]) => {
    if (!DATE_RE.test(date)) return;
    const clean = sanitizeStats(subjects);
    if (Object.keys(clean).length) out[date] = clean;
  });
  return out;
}

function sanitizeReminders(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const time = (v, d) => (TIME_RE.test(v) ? v : d);
  return {
    classEnabled: src.classEnabled !== false,
    classMinutes: [5, 10, 15, 30, 60].includes(Number(src.classMinutes)) ? Number(src.classMinutes) : 10,
    taskEnabled: src.taskEnabled !== false,
    taskTime: time(src.taskTime, '08:00'), // เตือนงานที่ต้องส่งวันนี้/พรุ่งนี้
    examEveTime: time(src.examEveTime, '19:00'), // เตือนคืนก่อนสอบ
    examDayTime: time(src.examDayTime, '06:00'), // เตือนเช้าวันสอบ
    weeklyEnabled: src.weeklyEnabled !== false, // สรุปประจำสัปดาห์ (เย็นวันอาทิตย์)
    weeklyTime: time(src.weeklyTime, '19:00'),
  };
}

// ---------- การเข้าเรียน ----------
const ATTEND_STATUSES = ['present', 'late', 'leave', 'absent'];
// { [scheduleId]: { 'YYYY-MM-DD': 'present' | 'late' | 'leave' | 'absent' } }
function sanitizeAttendance(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([id, days]) => {
    if (!/^\d+$/.test(id) || !days || typeof days !== 'object') return;
    const clean = {};
    Object.entries(days).forEach(([d, st]) => { if (DATE_RE.test(d) && ATTEND_STATUSES.includes(st)) clean[d] = st; });
    if (Object.keys(clean).length) out[id] = clean;
  });
  return out;
}

function mondayOf(dateStr) {
  const d = parseDate(dateStr) || new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sanitizeAttendSettings(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  return {
    semesterStart: DATE_RE.test(src.semesterStart) ? src.semesterStart : mondayOf(todayStr()),
    weeks: clamp(Math.round(Number(src.weeks)) || 15, 1, 30),
    required: clamp(Math.round(Number(src.required)) || 80, 50, 100),
  };
}

// ---------- ข้อมูลวิชา (อาจารย์ โน้ต ลิงก์) ----------
// { [subjectKey]: { teacher, notes, links: [{ label, url }] } }
function sanitizeSubjectInfo(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([k, v]) => {
    if (!k || k.length > 100 || !v || typeof v !== 'object') return;
    const links = (Array.isArray(v.links) ? v.links : [])
      .filter((l) => l && /^https?:\/\//i.test(String(l.url || '')))
      .slice(0, 20)
      .map((l) => ({ label: String(l.label || '').slice(0, 60), url: String(l.url).slice(0, 500) }));
    const entry = { teacher: String(v.teacher || '').slice(0, 100), notes: String(v.notes || '').slice(0, 5000), links };
    const place = sanitizePlace(v.place);
    if (place) entry.place = place;
    out[subjectKey(k)] = entry;
  });
  return out;
}

// ตำแหน่งห้องเรียน { lat, lng } (ทศนิยม 6 ตำแหน่ง ≈ 10 ซม.)
function sanitizePlace(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function sanitizeCalendarSettings(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  return {
    until: DATE_RE.test(src.until) ? src.until : '',
    alarm: [0, 5, 10, 15, 30, 60].includes(Number(src.alarm)) ? Number(src.alarm) : 10,
  };
}

// =====================================================================
// สีประจำวิชา (ชุดสี 8 สีที่ตรวจแล้วว่าแยกกันออกแม้ตาบอดสี มีชื่อวิชากำกับเสมอ)
// =====================================================================
const SUBJECT_PALETTE = [
  { key: 'blue', name: 'น้ำเงิน', light: '#2a78d6', dark: '#3987e5' },
  { key: 'orange', name: 'ส้ม', light: '#eb6834', dark: '#d95926' },
  { key: 'aqua', name: 'เขียวมิ้นต์', light: '#1baf7a', dark: '#199e70' },
  { key: 'yellow', name: 'เหลือง', light: '#eda100', dark: '#c98500' },
  { key: 'magenta', name: 'ชมพู', light: '#e87ba4', dark: '#d55181' },
  { key: 'green', name: 'เขียว', light: '#008300', dark: '#008300' },
  { key: 'violet', name: 'ม่วง', light: '#6250d6', dark: '#9085e9' },
  { key: 'red', name: 'แดง', light: '#e34948', dark: '#e66767' },
];
const PALETTE_BY_KEY = Object.fromEntries(SUBJECT_PALETTE.map((c) => [c.key, c]));
const GENERIC_SUBJECTS = new Set(['', 'ทั่วไป', 'วิชาทั่วไป']);
const subjectKey = (name) => String(name || '').trim().toLowerCase();

function sanitizeSubjectColors(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([k, v]) => {
    if (k && k.length <= 100 && PALETTE_BY_KEY[v]) out[subjectKey(k)] = v;
  });
  return out;
}

let subjectColors = sanitizeSubjectColors(getStorage(KEYS.subjectColors, {}));
let attendance = sanitizeAttendance(getStorage(KEYS.attendance, {}));
let attendSettings = sanitizeAttendSettings(getStorage(KEYS.attendSettings, {}));
let subjectInfo = sanitizeSubjectInfo(getStorage(KEYS.subjectInfo, {}));
let scores = sanitizeScores(getStorage(KEYS.scores, {}));
let notes = sanitizeNotes(getStorage(KEYS.notes, []));
let cards = sanitizeCards(getStorage(KEYS.cards, []));
let flashLog = sanitizeFlashLog(getStorage(KEYS.flashLog, {}));

// ให้สีวิชาใหม่ตามลำดับชุดสี (เลือกสีที่ใช้น้อยที่สุด เริ่มจากสีแรก)
function colorFor(name, map = subjectColors, assign = true) {
  const k = subjectKey(name);
  if (GENERIC_SUBJECTS.has(k)) return null;
  if (map[k]) return PALETTE_BY_KEY[map[k]];
  if (!assign) return null;
  const used = Object.values(map);
  const pick = SUBJECT_PALETTE.reduce((best, c) => {
    const n = used.filter((u) => u === c.key).length;
    return n < best.n ? { c, n } : best;
  }, { c: SUBJECT_PALETTE[0], n: Infinity }).c;
  map[k] = pick.key;
  if (map === subjectColors) setStorage(KEYS.subjectColors, subjectColors);
  return pick;
}

// คืน attribute style สำหรับ element ที่มีคลาส .subj (ใช้ตัวแปร --sc ใน CSS)
function subjectStyle(name, map = subjectColors, assign = true) {
  const c = colorFor(name, map, assign);
  return c ? `style="--sc-light:${c.light};--sc-dark:${c.dark}"` : '';
}

// หาว่าข้อความ (เช่นชื่อการสอบ) ตรงกับวิชาไหนในตารางเรียน
function findSubjectIn(text, list = schedules) {
  const t = subjectKey(text);
  const names = [...new Set(list.map((s) => s.name))].sort((a, b) => b.length - a.length);
  return names.find((n) => t.includes(subjectKey(n))) || '';
}

// =====================================================================
// Theme (โหมดมืด)
// =====================================================================
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getThemePref() {
  const t = getStorage(KEYS.theme, 'system');
  return ['light', 'dark', 'system'].includes(t) ? t : 'system';
}

function applyTheme() {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0f172a' : '#4f46e5';
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.classList.toggle('active', b.dataset.themeOpt === pref));
}

function setTheme(pref) {
  setStorage(KEYS.theme, pref);
  applyTheme();
}

function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  if (!document.startViewTransition || reduceMotion.matches) return setTheme(next);
  // สีใหม่กระจายเป็นวงกลมออกจากปุ่มที่กด
  const { x, y } = lastPointer;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = document.startViewTransition(() => setTheme(next));
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

darkQuery.addEventListener?.('change', applyTheme);

// =====================================================================
// Tabs & modals
// =====================================================================
const TABS = ['today', 'schedule', 'kanban', 'pomodoro', 'gpa'];

let currentTab = null;

function moveNavIndicator(tab) {
  const ind = document.getElementById('nav-indicator');
  if (ind) ind.style.transform = `translateX(${TABS.indexOf(tab) * 100}%)`;
}

function switchTab(tab) {
  if (!TABS.includes(tab)) tab = 'today';
  const dir = currentTab && TABS.indexOf(tab) < TABS.indexOf(currentTab) ? 'from-left' : 'from-right';
  const changed = currentTab !== null && currentTab !== tab;
  currentTab = tab;
  moveNavIndicator(tab);
  TABS.forEach((t) => $(`tab-${t}`).classList.toggle('hidden', t !== tab));
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  setStorage(KEYS.tab, tab);
  const section = $(`tab-${tab}`);
  section.classList.remove('from-left', 'from-right');
  if (changed) section.classList.add(dir);
  animateIn(section);
  const scroller = document.getElementById('app-scroll');
  if (scroller) scroller.scrollTop = 0;
}

function openModal(id) {
  const el = $(id);
  el.classList.remove('hidden');
  el.classList.add('flex');
  if (!reduceMotion.matches) {
    el.classList.remove('modal-enter');
    void el.offsetWidth;
    el.classList.add('modal-enter');
  }
  refreshIcons();
}

function closeModal(id) {
  const el = $(id);
  el.classList.add('hidden');
  el.classList.remove('flex');
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (typeof currentNote !== 'undefined' && currentNote) saveNoteNow();
  document.querySelectorAll('.modal').forEach((m) => closeModal(m.id));
});

// =====================================================================
// 1. SCHEDULE
// =====================================================================
const todayIndex = () => (new Date().getDay() + 6) % 7; // 0 = จันทร์
const toMinutes = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const byStart = (a, b) => toMinutes(a.start) - toMinutes(b.start);

let schedules = sanitizeSchedules(getStorage(KEYS.schedules, [
  { id: 1, name: 'Computer Network', day: 'จันทร์', room: 'Lab 301', start: '09:00', end: '12:00' },
  { id: 2, name: 'Web Programming', day: 'พุธ', room: 'Lab 502', start: '13:00', end: '16:00' },
]));
let editingScheduleId = null;
let renderedDayIndex = todayIndex();

function renderSchedule() {
  renderedDayIndex = todayIndex();
  $('schedule-grid').innerHTML = scheduleGridHtml(schedules, { editable: true });
  renderNextClass();
  renderSubjectList();
  renderToday();
  refreshIcons();
}

// สร้าง HTML ตารางเรียน 7 วัน ใช้ทั้งในแอปและหน้าดูตารางที่เพื่อนแชร์มา
function scheduleGridHtml(list, { editable = false, colors = subjectColors } = {}) {
  const today = todayIndex();
  return DAYS.map((day, i) => {
    const items = list.filter((s) => s.day === day).sort(byStart);
    const isToday = i === today;
    return `
      <div class="card p-4 flex flex-col gap-3 xl:min-h-[260px] ${isToday ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}">
        <div class="font-bold text-sm pb-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center heading">
          <span class="flex items-center gap-2">วัน${day}
            ${isToday ? '<span class="text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">วันนี้</span>' : ''}
          </span>
          <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400">${items.length} วิชา</span>
        </div>
        <div class="space-y-2 flex-1">
          ${items.length ? items.map((it) => scheduleCardHtml(it, { editable, colors })).join('') : '<p class="text-xs muted">ไม่มีเรียน</p>'}
        </div>
      </div>`;
  }).join('');
}

function scheduleCardHtml(item, { editable = true, colors = subjectColors } = {}) {
  return `
    <div ${editable ? `onclick="openSubjectSheet(${item.id})"` : ''} ${subjectStyle(item.name, colors, editable)} class="subj subj-tint subj-bar border border-slate-200/70 dark:border-slate-700/60 p-3 rounded-xl relative group ${editable ? 'cursor-pointer hover:shadow-sm pressable' : ''} transition">
      ${editable ? `<button onclick="event.stopPropagation(); deleteSchedule(${item.id})" aria-label="ลบวิชา" class="absolute top-2 right-2 text-slate-400 hover:text-rose-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>` : ''}
      <div class="font-semibold text-xs heading pr-5">${escapeHtml(item.name)}</div>
      ${editable ? attendanceBadgeHtml(item) : ''}
      <div class="text-[11px] muted mt-1 flex items-center gap-1">
        <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i> ${escapeHtml(item.start)} - ${escapeHtml(item.end)}
      </div>
      ${item.room ? `<div class="text-[11px] muted flex items-center gap-1 mt-0.5">
        <i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i> ${escapeHtml(item.room)}
      </div>` : ''}
    </div>`;
}

// หา "คาบที่กำลังเรียน" หรือ "คาบถัดไป" นับจากเวลาปัจจุบัน
function getNextClass(now = new Date()) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayIndex();
  for (let offset = 0; offset <= 7; offset++) {
    const dayIdx = (today + offset) % 7;
    const items = schedules.filter((s) => s.day === DAYS[dayIdx]).sort(byStart);
    for (const s of items) {
      const start = toMinutes(s.start);
      const end = toMinutes(s.end);
      if (offset === 0) {
        if (start <= nowMin && nowMin < end) return { s, status: 'now', minutes: end - nowMin };
        if (start > nowMin) return { s, status: 'today', minutes: start - nowMin };
      } else {
        return { s, status: offset === 1 ? 'tomorrow' : 'later', dayIdx };
      }
    }
  }
  return null;
}

// แถบด้านบนของหน้าตาราง: เด่นเฉพาะตอนที่มีเรียนวันนี้ ถ้าวันนี้ไม่มีเรียน/เรียนครบแล้ว ให้บอกตรง ๆ และเป็นการ์ดสีเรียบ
const BANNER_LOUD = 'rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md';
const BANNER_CALM = 'rounded-2xl p-4 sm:p-5 card';

function renderNextClass() {
  const box = $('next-class');
  const next = getNextClass();
  const loud = !!next && (next.status === 'now' || next.status === 'today');
  box.className = loud ? BANNER_LOUD : BANNER_CALM;
  const sub = loud ? 'text-indigo-100' : 'muted';

  const exam = upcomingExams()[0];
  const examDays = exam ? daysUntil(exam.date) : null;
  const examLine = exam && examDays <= 14
    ? `<div class="mt-3 pt-3 border-t ${loud ? 'border-white/20' : 'border-slate-200 dark:border-slate-800'} text-sm flex items-center gap-2"><i data-lucide="notebook-pen" class="w-4 h-4 shrink-0 ${loud ? '' : 'text-indigo-500'}"></i>
        <span class="truncate">${escapeHtml(examTitle(exam))} · <b>${examDays === 0 ? 'วันนี้!' : examDays === 1 ? 'พรุ่งนี้' : `อีก ${examDays} วัน`}</b></span></div>`
    : '';

  if (!next) {
    box.innerHTML = `<div class="flex items-center gap-3"><i data-lucide="calendar-plus" class="w-6 h-6 shrink-0 text-indigo-500"></i>
      <div><div class="font-semibold heading">ยังไม่มีคาบเรียน</div><div class="text-sm muted">กด "เพิ่มคาบเรียน" เพื่อเริ่มสร้างตารางเรียนของคุณ</div></div></div>${examLine}`;
    refreshIcons();
    return;
  }

  const { s, status } = next;
  const room = s.room ? ` · ห้อง ${escapeHtml(s.room)}` : '';

  if (loud) {
    const label = status === 'now' ? 'กำลังเรียนอยู่' : 'คาบถัดไป · วันนี้';
    const when = status === 'now'
      ? `เลิก ${escapeHtml(s.end)} (อีก ${formatDuration(next.minutes)})`
      : `เริ่ม ${escapeHtml(s.start)} (อีก ${formatDuration(next.minutes)})`;
    box.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="bg-white/15 p-2.5 rounded-xl shrink-0"><i data-lucide="${status === 'now' ? 'book-open' : 'bell'}" class="w-6 h-6"></i></div>
        <div class="min-w-0">
          <div class="text-xs tracking-wide ${sub}">${label}</div>
          <div class="font-semibold text-lg truncate">${escapeHtml(s.name)}</div>
          <div class="text-sm ${sub}">${when}${room}</div>
        </div>
        ${placeFor(s) ? `<a href="${escapeHtml(directionsUrl(placeFor(s)))}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
          class="ml-auto shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-sm font-medium"><i data-lucide="navigation" class="w-4 h-4"></i> นำทาง</a>` : ''}
      </div>${examLine}`;
    refreshIcons();
    return;
  }

  // วันนี้ไม่มีเรียน หรือเรียนครบแล้ว
  const hadClassToday = schedules.some((x) => x.day === DAYS[todayIndex()]);
  const headline = hadClassToday ? 'วันนี้เรียนครบแล้ว ✅' : 'วันนี้ไม่มีเรียน 🎉';
  const whenDay = status === 'tomorrow' ? `พรุ่งนี้ (${DAYS[next.dayIdx]})` : `วัน${DAYS[next.dayIdx]}`;
  box.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 p-2.5 rounded-xl shrink-0"><i data-lucide="${hadClassToday ? 'circle-check' : 'coffee'}" class="w-6 h-6"></i></div>
      <div class="min-w-0">
        <div class="font-semibold text-lg heading">${headline}</div>
        <div class="text-sm muted">คาบถัดไป: <b class="heading">${whenDay} ${escapeHtml(s.start)}</b> · ${escapeHtml(s.name)}${room}</div>
      </div>
    </div>${examLine}`;
  refreshIcons();
}

function renderSubjectList() {
  const names = new Set([...schedules.map((s) => s.name), ...Object.keys(studyStats), ...tasks.map((t) => t.subject).filter((x) => x !== 'ทั่วไป')]);
  $('subject-list').innerHTML = [...names].map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
}

let pickedColor = '';

function renderColorPicker() {
  const nameColor = colorFor($('sched-name').value, subjectColors, false);
  const active = pickedColor || (nameColor ? nameColor.key : '');
  $('sched-colors').innerHTML = `
    <button type="button" onclick="pickColor('')" class="h-8 px-2.5 rounded-full text-xs border ${!pickedColor ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-600 muted'}">อัตโนมัติ</button>
    ${SUBJECT_PALETTE.map((c) => `<button type="button" onclick="pickColor('${c.key}')" aria-label="สี${c.name}" title="${c.name}" style="--sc-light:${c.light};--sc-dark:${c.dark}"
      class="subj subj-dot w-8 h-8 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ${active === c.key ? 'ring-2 ring-slate-900 dark:ring-white' : ''}"></button>`).join('')}`;
}

function pickColor(key) {
  pickedColor = key;
  renderColorPicker();
}

function openScheduleModal(id = null) {
  const item = id ? schedules.find((s) => s.id === id) : null;
  editingScheduleId = item ? item.id : null;
  pickedColor = '';
  $('schedule-modal-title').textContent = item ? 'แก้ไขคาบเรียน' : 'เพิ่มคาบเรียนใหม่';
  $('sched-name').value = item ? item.name : '';
  $('sched-day').value = item ? item.day : DAYS[todayIndex()];
  $('sched-room').value = item ? item.room : '';
  $('sched-start').value = item ? item.start : '09:00';
  $('sched-end').value = item ? item.end : '12:00';
  renderColorPicker();
  openModal('schedule-modal');
}

function saveSchedule() {
  const name = $('sched-name').value.trim();
  const day = $('sched-day').value;
  const room = $('sched-room').value.trim();
  const start = $('sched-start').value;
  const end = $('sched-end').value;

  if (!name) return toast('กรุณากรอกชื่อวิชา', 'error');
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return toast('กรุณาระบุเวลาเริ่มและเวลาเลิก', 'error');
  if (toMinutes(end) <= toMinutes(start)) return toast('เวลาเลิกต้องหลังเวลาเริ่ม', 'error');
  if (pickedColor && PALETTE_BY_KEY[pickedColor]) {
    subjectColors[subjectKey(name)] = pickedColor;
    setStorage(KEYS.subjectColors, subjectColors);
  }

  if (editingScheduleId) {
    schedules = schedules.map((s) => (s.id === editingScheduleId ? { ...s, name, day, room, start, end } : s));
    toast('แก้ไขคาบเรียนแล้ว', 'success');
  } else {
    schedules.push({ id: uid(), name, day, room, start, end });
    toast('เพิ่มคาบเรียนแล้ว', 'success');
  }
  setStorage(KEYS.schedules, schedules);
  closeModal('schedule-modal');
  renderSchedule();
  renderTasks();
  renderExams();
  renderStudyStats();
}

function deleteSchedule(id) {
  const item = schedules.find((s) => s.id === id);
  if (!item || !confirm(`ลบวิชา "${item.name}" (วัน${item.day}) ใช่ไหม?`)) return;
  schedules = schedules.filter((s) => s.id !== id);
  setStorage(KEYS.schedules, schedules);
  renderSchedule();
}

// =====================================================================
// 1b. EXAMS (นับถอยหลังวันสอบ)
// =====================================================================
let exams = sanitizeExams(getStorage(KEYS.exams, []));
let editingExamId = null;

function compareExams(a, b) {
  return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
}

// ถ้าชื่อขึ้นต้นด้วย "สอบ" อยู่แล้ว ไม่ต้องเติมซ้ำ
const examTitle = (e) => (e.name.trim().startsWith('สอบ') ? e.name : `สอบ ${e.name}`);

function upcomingExams() {
  return exams.filter((e) => daysUntil(e.date) >= 0).sort(compareExams);
}

function renderExams() {
  const upcoming = upcomingExams();
  const past = exams.filter((e) => daysUntil(e.date) < 0).sort(compareExams).reverse();
  const card = (e, isPast) => {
    const n = daysUntil(e.date);
    let badge;
    let tone;
    if (isPast) { badge = 'สอบแล้ว'; tone = DUE_BADGE.done; }
    else if (n === 0) { badge = 'วันนี้!'; tone = DUE_BADGE.overdue; }
    else if (n === 1) { badge = 'พรุ่งนี้'; tone = DUE_BADGE.urgent; }
    else if (n <= 7) { badge = `อีก ${n} วัน`; tone = DUE_BADGE.soon; }
    else { badge = `อีก ${n} วัน`; tone = DUE_BADGE.normal; }
    const detail = [formatThaiDate(e.date), e.time, e.room].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div onclick="openExamModal(${e.id})" class="pressable relative p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-400/50 cursor-pointer transition ${isPast ? 'opacity-60' : ''}">
        <button onclick="event.stopPropagation(); deleteExam(${e.id})" aria-label="ลบวันสอบ" class="absolute top-3 right-3 text-slate-400 hover:text-rose-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <div class="flex items-center gap-3 pr-6">
          ${!isPast && n > 1 ? `<div class="text-center shrink-0 w-14"><div class="text-2xl font-black text-indigo-600 dark:text-indigo-300 leading-none">${n}</div><div class="text-[10px] muted">วัน</div></div>` : ''}
          <div class="min-w-0">
            <div class="font-semibold text-sm heading truncate flex items-center gap-1.5">${subjDot(findSubjectIn(e.name))}${escapeHtml(e.name)}</div>
            <div class="text-xs muted mt-0.5">${detail}</div>
            <span class="inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${tone}">${badge}</span>
          </div>
        </div>
      </div>`;
  };
  const html = upcoming.map((e) => card(e, false)).concat(past.slice(0, 3).map((e) => card(e, true)));
  $('exam-list').innerHTML = html.join('') || '<p class="text-xs muted">ยังไม่มีวันสอบ</p>';
  renderToday();
  refreshIcons();
}

// จุดสีประจำวิชา (ถ้าไม่ใช่วิชาทั่วไป)
function subjDot(name, map = subjectColors, assign = true) {
  const st = name ? subjectStyle(name, map, assign) : '';
  return st ? `<span ${st} class="subj subj-dot inline-block w-2.5 h-2.5 rounded-full shrink-0"></span>` : '';
}

function openExamModal(id = null) {
  const e = id ? exams.find((x) => x.id === id) : null;
  editingExamId = e ? e.id : null;
  $('exam-modal-title').textContent = e ? 'แก้ไขวันสอบ' : 'เพิ่มวันสอบ';
  $('exam-name').value = e ? e.name : '';
  $('exam-date').value = e ? e.date : '';
  $('exam-time').value = e ? e.time : '';
  $('exam-room').value = e ? e.room : '';
  openModal('exam-modal');
}

function saveExam() {
  const name = $('exam-name').value.trim();
  const date = $('exam-date').value;
  const time = $('exam-time').value;
  const room = $('exam-room').value.trim();
  if (!name) return toast('กรุณากรอกชื่อการสอบ', 'error');
  if (!DATE_RE.test(date)) return toast('กรุณาเลือกวันที่สอบ', 'error');
  const data = { name, date, time: TIME_RE.test(time) ? time : '', room };
  if (editingExamId) {
    exams = exams.map((e) => (e.id === editingExamId ? { ...e, ...data } : e));
    toast('แก้ไขวันสอบแล้ว', 'success');
  } else {
    exams.push({ id: uid(), ...data });
    toast('เพิ่มวันสอบแล้ว สู้ ๆ นะ! 💪', 'success');
  }
  setStorage(KEYS.exams, exams);
  closeModal('exam-modal');
  renderExams();
  renderNextClass();
}

function deleteExam(id) {
  const e = exams.find((x) => x.id === id);
  if (!e || !confirm(`ลบวันสอบ "${e.name}" ใช่ไหม?`)) return;
  exams = exams.filter((x) => x.id !== id);
  setStorage(KEYS.exams, exams);
  renderExams();
  renderNextClass();
}

// =====================================================================
// 1c. CALENDAR EXPORT (.ics)
// =====================================================================
let calSettings = sanitizeCalendarSettings(getStorage(KEYS.calendar, {}));
const ICS_DAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// บรรทัดในไฟล์ .ics ต้องยาวไม่เกิน 75 ไบต์ (ภาษาไทย 1 ตัว = 3 ไบต์) ถ้าเกินให้ขึ้นบรรทัดใหม่ตามด้วยช่องว่าง
function icsFold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + b > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const icsDate = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const icsDateTime = (d) => `${icsDate(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
const icsStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function icsAlarm(trigger, text) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

function buildCalendar({ includeClasses, includeTasks, includeExams, until, alarm }) {
  const stamp = icsStamp();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyFlow//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:StudyFlow'];
  let count = 0;

  if (includeClasses) {
    const untilDate = parseDate(until);
    schedules.forEach((s) => {
      const dayIdx = DAYS.indexOf(s.day);
      const first = new Date();
      first.setHours(0, 0, 0, 0);
      first.setDate(first.getDate() + ((dayIdx - todayIndex() + 7) % 7));
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = s.end.split(':').map(Number);
      const start = new Date(first); start.setHours(sh, sm);
      const end = new Date(first); end.setHours(eh, em);
      const rrule = untilDate ? `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY[dayIdx]};UNTIL=${icsDate(untilDate)}T235959` : `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY[dayIdx]}`;
      lines.push('BEGIN:VEVENT', `UID:studyflow-class-${s.id}@studyflow`, `DTSTAMP:${stamp}`,
        `DTSTART:${icsDateTime(start)}`, `DTEND:${icsDateTime(end)}`, rrule,
        `SUMMARY:${icsEscape(s.name)}`);
      const place = placeFor(s);
      if (s.room || place) lines.push(`LOCATION:${icsEscape(s.room || s.name)}`);
      if (place) lines.push(`GEO:${place.lat};${place.lng}`);
      if (alarm > 0) lines.push(...icsAlarm(`-PT${alarm}M`, `อีก ${alarm} นาทีเข้าเรียน ${s.name}`));
      lines.push('END:VEVENT');
      count++;
    });
  }

  if (includeTasks) {
    tasks.filter((t) => t.status !== 'done' && t.due).forEach((t) => {
      const d = parseDate(t.due);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      lines.push('BEGIN:VEVENT', `UID:studyflow-task-${t.id}@studyflow`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(next)}`,
        `SUMMARY:${icsEscape(`📌 ส่งงาน: ${t.title}`)}`, `DESCRIPTION:${icsEscape(`วิชา ${t.subject}`)}`,
        'TRANSP:TRANSPARENT',
        ...icsAlarm('-PT15H', `พรุ่งนี้ต้องส่ง ${t.title}`), // 9 โมงเช้าของวันก่อนส่ง
        'END:VEVENT');
      count++;
    });
  }

  if (includeExams) {
    exams.filter((e) => daysUntil(e.date) >= 0).forEach((e) => {
      const d = parseDate(e.date);
      lines.push('BEGIN:VEVENT', `UID:studyflow-exam-${e.id}@studyflow`, `DTSTAMP:${stamp}`);
      if (e.time) {
        const [h, m] = e.time.split(':').map(Number);
        d.setHours(h, m);
        lines.push(`DTSTART:${icsDateTime(d)}`, 'DURATION:PT2H');
      } else {
        const next = new Date(d); next.setDate(next.getDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
      }
      lines.push(`SUMMARY:${icsEscape(`📝 ${examTitle(e)}`)}`);
      if (e.room) lines.push(`LOCATION:${icsEscape(e.room)}`);
      lines.push(...icsAlarm(e.time ? '-P1D' : '-PT15H', `พรุ่งนี้${examTitle(e)}`));
      if (e.time) lines.push(...icsAlarm('-PT1H', `อีก 1 ชั่วโมง${examTitle(e)}`));
      lines.push('END:VEVENT');
      count++;
    });
  }

  lines.push('END:VCALENDAR');
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', count };
}

function openCalendarModal() {
  if (!calSettings.until) calSettings.until = todayStr(16 * 7);
  $('cal-until').value = calSettings.until;
  $('cal-alarm').value = String(calSettings.alarm);
  $('cal-count-classes').textContent = `(${schedules.length})`;
  $('cal-count-tasks').textContent = `(${tasks.filter((t) => t.status !== 'done' && t.due).length})`;
  $('cal-count-exams').textContent = `(${exams.filter((e) => daysUntil(e.date) >= 0).length})`;
  openModal('calendar-modal');
}

function downloadFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportCalendar() {
  calSettings = sanitizeCalendarSettings({ until: $('cal-until').value, alarm: $('cal-alarm').value });
  setStorage(KEYS.calendar, calSettings);
  const { text, count } = buildCalendar({
    includeClasses: $('cal-classes').checked,
    includeTasks: $('cal-tasks').checked,
    includeExams: $('cal-exams').checked,
    until: calSettings.until,
    alarm: calSettings.alarm,
  });
  if (!count) return toast('ไม่มีรายการให้ส่งออก ลองเลือกหัวข้ออื่นหรือเพิ่มข้อมูลก่อน', 'error', 4000);
  downloadFile(text, 'studyflow-calendar.ics', 'text/calendar;charset=utf-8');
  toast(`สร้างไฟล์ปฏิทินแล้ว (${count} รายการ) เปิดไฟล์เพื่อเพิ่มเข้าปฏิทิน`, 'success', 5000);
}

// =====================================================================
// 2. KANBAN
// =====================================================================
let tasks = sanitizeTasks(getStorage(KEYS.tasks, [
  { id: 101, title: 'ส่งรายงานวิชา Network', subject: 'Computer Network', due: todayStr(2), status: 'todo' },
  { id: 102, title: 'ทำ Prototype หน้าเว็บ', subject: 'Web Programming', due: todayStr(5), status: 'progress' },
]));
let editingTaskId = null;

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function daysUntil(str) {
  const d = parseDate(str);
  if (!d) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function formatThaiDate(str) {
  const d = parseDate(str);
  return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
}

function dueInfo(task) {
  const n = daysUntil(task.due);
  if (task.status === 'done') return { level: 'done', text: task.due ? `กำหนดส่ง ${formatThaiDate(task.due)}` : 'เสร็จแล้ว' };
  if (n === null) return { level: 'none', text: 'ไม่ระบุวันส่ง' };
  if (n < 0) return { level: 'overdue', text: `เลยกำหนด ${-n} วัน` };
  if (n === 0) return { level: 'urgent', text: 'ส่งวันนี้!' };
  if (n === 1) return { level: 'urgent', text: 'ส่งพรุ่งนี้' };
  if (n <= 3) return { level: 'soon', text: `อีก ${n} วัน` };
  return { level: 'normal', text: `อีก ${n} วัน` };
}

const DUE_BADGE = {
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  urgent: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  none: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};
const DUE_BORDER = {
  overdue: 'border-l-4 border-l-rose-500',
  urgent: 'border-l-4 border-l-orange-500',
  soon: 'border-l-4 border-l-amber-400',
};

function compareTasks(a, b) {
  const da = parseDate(a.due);
  const db = parseDate(b.due);
  if (da && db && da - db !== 0) return da - db;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.id - b.id;
}

const MOVE_BUTTONS = {
  todo: [{ to: 'progress', label: 'เริ่มทำ →' }],
  progress: [{ to: 'todo', label: '← ยังไม่เริ่ม' }, { to: 'done', label: 'เสร็จแล้ว ✓' }],
  done: [{ to: 'progress', label: '← ทำต่อ' }],
};

function renderTasks() {
  const count = { todo: 0, progress: 0, done: 0 };
  const html = { todo: [], progress: [], done: [] };
  let overdue = 0;
  let soon = 0;

  [...tasks].sort(compareTasks).forEach((task) => {
    count[task.status]++;
    const info = dueInfo(task);
    if (info.level === 'overdue') overdue++;
    if (info.level === 'urgent' || info.level === 'soon') soon++;
    const dateText = task.due && info.level !== 'done' ? ` · ${formatThaiDate(task.due)}` : '';
    html[task.status].push(`
      <div onclick="openTaskModal(${task.id})" class="${task.id === lastMovedTaskId ? 'card-pop ' : ''}pressable bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 ${DUE_BORDER[info.level] || ''} shadow-sm hover:shadow transition space-y-2 cursor-pointer ${task.status === 'done' ? 'opacity-70' : ''}">
        <div class="flex justify-between items-start gap-2">
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 truncate inline-flex items-center gap-1.5">${subjDot(task.subject)}${escapeHtml(task.subject)}</span>
          <button onclick="event.stopPropagation(); deleteTask(${task.id})" aria-label="ลบงาน" class="text-slate-400 hover:text-rose-500 shrink-0">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
        <div class="text-sm font-medium heading ${task.status === 'done' ? 'line-through' : ''}">${escapeHtml(task.title)}</div>
        ${task.notes ? `<div class="text-xs muted whitespace-pre-line line-clamp-2">${escapeHtml(task.notes)}</div>` : ''}
        ${subtaskCardHtml(task)}
        <div class="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <span class="text-[11px] font-medium px-2 py-0.5 rounded-full ${DUE_BADGE[info.level]}">${escapeHtml(info.text + dateText)}</span>
          <div class="flex gap-1">
            ${MOVE_BUTTONS[task.status].map((b) => `<button onclick="event.stopPropagation(); moveTask(${task.id}, '${b.to}')" class="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">${b.label}</button>`).join('')}
          </div>
        </div>
      </div>`);
  });

  STATUSES.forEach((s) => {
    $(`col-${s}`).innerHTML = html[s].join('') || '<p class="text-xs muted text-center py-6">ไม่มีงาน</p>';
    countUp($(`count-${s}`), `kanban-${s}`, count[s]);
  });

  const parts = [];
  if (overdue) parts.push(`<span class="px-3 py-1.5 rounded-full ${DUE_BADGE.overdue} font-medium">⚠️ เลยกำหนด ${overdue} งาน</span>`);
  if (soon) parts.push(`<span class="px-3 py-1.5 rounded-full ${DUE_BADGE.urgent} font-medium">⏰ ต้องส่งภายใน 3 วัน ${soon} งาน</span>`);
  if (!parts.length && count.todo + count.progress > 0) parts.push(`<span class="px-3 py-1.5 rounded-full ${DUE_BADGE.done} font-medium">👍 ไม่มีงานเร่งด่วน</span>`);
  $('task-summary').innerHTML = parts.join('');

  const urgentCount = overdue + soon;
  document.querySelectorAll('.kanban-badge').forEach((b) => {
    b.textContent = urgentCount > 9 ? '9+' : String(urgentCount);
    b.classList.toggle('hidden', urgentCount === 0);
  });
  renderToday();
  refreshIcons();
}

function openTaskModal(id = null) {
  const task = id ? tasks.find((t) => t.id === id) : null;
  editingTaskId = task ? task.id : null;
  $('task-modal-title').textContent = task ? 'แก้ไขงาน' : 'เพิ่มการบ้าน / โครงงาน';
  $('task-title').value = task ? task.title : '';
  $('task-subject').value = task ? task.subject : '';
  $('task-due').value = task ? task.due : '';
  $('task-notes').value = task ? task.notes : '';
  editingSubtasks = task ? task.subtasks.map((s) => ({ ...s, showDate: !!s.due })) : [];
  $('subtask-input').value = '';
  renderSubtaskEditor();
  renderTaskSubjectChips();
  openModal('task-modal');
}

// ---------- งานย่อย (Checklist) ----------
// แก้ไขในสำเนา editingSubtasks แล้วบันทึกจริงตอนกด "บันทึก" (กดยกเลิกแล้วไม่เปลี่ยน)
let editingSubtasks = [];

function subtaskProgress(list) {
  const done = list.filter((s) => s.done).length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

function progressBarHtml({ done, total, pct }) {
  const full = total > 0 && done === total;
  return `<div class="flex items-center gap-2">
    <div class="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div class="h-full rounded-full ${full ? 'bg-emerald-500' : 'bg-indigo-500'} transition-all duration-300" style="width:${pct}%"></div>
    </div>
    <span class="text-[11px] font-medium tabular-nums ${full ? 'text-emerald-600 dark:text-emerald-400' : 'muted'}">☑ ${done}/${total}</span>
  </div>`;
}

function subtaskCardHtml(task) {
  if (!task.subtasks.length) return '';
  const next = task.status === 'done' ? null : task.subtasks.find((s) => !s.done);
  const nextDue = next && next.due ? ` · ${formatThaiDate(next.due)}` : '';
  return `${progressBarHtml(subtaskProgress(task.subtasks))}
    ${next ? `<button onclick="event.stopPropagation(); toggleSubtaskOnCard(${task.id}, ${next.id})" title="ติ๊กว่าเสร็จ"
      class="w-full flex items-start gap-2 text-left text-xs px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
      <span class="mt-0.5 w-3.5 h-3.5 shrink-0 rounded border border-slate-400 dark:border-slate-500"></span>
      <span class="min-w-0"><span class="muted">ถัดไป:</span> ${escapeHtml(next.text)}<span class="muted">${escapeHtml(nextDue)}</span></span>
    </button>` : ''}`;
}

function renderSubtaskEditor() {
  const list = editingSubtasks;
  $('subtask-progress').innerHTML = list.length ? progressBarHtml(subtaskProgress(list)) : '';
  const btn = 'p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none';
  $('subtask-list').innerHTML = list.map((s, i) => `
    <li class="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 space-y-1.5">
      <div class="flex items-center gap-2">
        <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleEditingSubtask(${i})" aria-label="ทำเสร็จแล้ว" class="w-4 h-4 shrink-0 accent-indigo-600" />
        <input type="text" value="${escapeHtml(s.text)}" maxlength="200" oninput="editingSubtasks[${i}].text = this.value" aria-label="ชื่องานย่อย"
          class="flex-1 min-w-0 bg-transparent text-sm outline-none ${s.done ? 'line-through text-slate-400' : 'heading'}" />
        <button type="button" onclick="toggleSubtaskDate(${i})" aria-label="กำหนดวัน" class="${btn} ${s.due ? 'text-indigo-500' : ''}"><i data-lucide="calendar" class="w-3.5 h-3.5"></i></button>
        <button type="button" onclick="moveEditingSubtask(${i}, -1)" aria-label="เลื่อนขึ้น" class="${btn}" ${i === 0 ? 'disabled' : ''}><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>
        <button type="button" onclick="moveEditingSubtask(${i}, 1)" aria-label="เลื่อนลง" class="${btn}" ${i === list.length - 1 ? 'disabled' : ''}><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>
        <button type="button" onclick="removeEditingSubtask(${i})" aria-label="ลบงานย่อย" class="${btn} hover:!text-rose-500"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>
      ${s.showDate ? `<div class="flex items-center gap-2 pl-6 text-xs muted">กำหนด
        <input type="date" value="${s.due}" onchange="editingSubtasks[${i}].due = this.value" class="input !py-1 !px-2 !text-xs !w-auto" /></div>` : ''}
    </li>`).join('');
  refreshIcons();
}

function addSubtask() {
  const input = $('subtask-input');
  const text = input.value.trim().slice(0, 200);
  if (!text) return;
  if (editingSubtasks.length >= SUBTASK_MAX) return toast(`ใส่งานย่อยได้ไม่เกิน ${SUBTASK_MAX} รายการ`, 'error');
  editingSubtasks.push({ id: uid(), text, done: false, due: '', showDate: false });
  input.value = '';
  renderSubtaskEditor();
  input.focus();
}

function toggleEditingSubtask(i) {
  if (!editingSubtasks[i]) return;
  editingSubtasks[i].done = !editingSubtasks[i].done;
  renderSubtaskEditor();
}

function toggleSubtaskDate(i) {
  const s = editingSubtasks[i];
  if (!s) return;
  s.showDate = !s.showDate;
  if (!s.showDate) s.due = '';
  renderSubtaskEditor();
}

function moveEditingSubtask(i, dir) {
  const j = i + dir;
  if (!editingSubtasks[i] || !editingSubtasks[j]) return;
  [editingSubtasks[i], editingSubtasks[j]] = [editingSubtasks[j], editingSubtasks[i]];
  renderSubtaskEditor();
}

function removeEditingSubtask(i) {
  editingSubtasks.splice(i, 1);
  renderSubtaskEditor();
}

// ทำงานย่อยครบทุกอันแล้ว → ถามว่าจะย้ายงานไป "เสร็จแล้ว" เลยไหม
function offerFinishTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.status === 'done' || !task.subtasks.length || task.subtasks.some((s) => !s.done)) return;
  setTimeout(() => {
    if (confirm(`ทำงานย่อยของ "${task.title}" ครบแล้ว 🎉\nย้ายไปช่อง "เสร็จแล้ว" เลยไหม?`)) moveTask(id, 'done');
  }, 350);
}

function toggleSubtaskOnCard(taskId, subId) {
  tasks = tasks.map((t) => (t.id === taskId
    ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) }
    : t));
  setStorage(KEYS.tasks, tasks);
  renderTasks();
  offerFinishTask(taskId);
}

// ปุ่มเลือกวิชาจากตารางเรียน (แตะแทนการพิมพ์)
let taskSubjectOptions = [];

function renderTaskSubjectChips() {
  taskSubjectOptions = [...new Set(schedules.map((x) => x.name))].sort((a, b) => a.localeCompare(b, 'th'));
  taskSubjectOptions.push('ทั่วไป');
  const current = subjectKey($('task-subject').value);
  $('task-subject-chips').innerHTML = taskSubjectOptions.map((name, i) => {
    const on = subjectKey(name) === current;
    return `<button type="button" onclick="pickTaskSubject(${i})" title="${escapeHtml(name)}"
      class="max-w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition ${on
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
      ${subjDot(name, subjectColors, false)}<span class="truncate">${escapeHtml(name)}</span></button>`;
  }).join('');
}

function pickTaskSubject(i) {
  const name = taskSubjectOptions[i];
  if (name === undefined) return;
  $('task-subject').value = name;
  renderTaskSubjectChips();
}

function saveTask() {
  const title = $('task-title').value.trim();
  const subject = $('task-subject').value.trim() || 'ทั่วไป';
  const due = $('task-due').value;
  const notes = $('task-notes').value.trim().slice(0, 2000);
  if (!title) return toast('กรุณากรอกชื่องาน', 'error');
  // ข้อความที่พิมพ์ค้างไว้ในช่องงานย่อยแต่ยังไม่ได้กดเพิ่ม ให้นับเป็นงานย่อยด้วย
  if ($('subtask-input').value.trim()) addSubtask();
  const subtasks = sanitizeSubtasks(editingSubtasks);
  let savedId = editingTaskId;

  if (editingTaskId) {
    tasks = tasks.map((t) => (t.id === editingTaskId ? { ...t, title, subject, due, notes, subtasks } : t));
    toast('แก้ไขงานแล้ว', 'success');
  } else {
    const newId = uid();
    savedId = newId;
    tasks.push({ id: newId, title, subject, due, status: 'todo', notes, subtasks });
    lastMovedTaskId = newId;
    setTimeout(() => { if (lastMovedTaskId === newId) lastMovedTaskId = null; }, 600);
    toast('เพิ่มงานแล้ว', 'success');
  }
  setStorage(KEYS.tasks, tasks);
  closeModal('task-modal');
  renderTasks();
  offerFinishTask(savedId);
}

let lastMovedTaskId = null;

function moveTask(id, nextStatus) {
  if (!STATUSES.includes(nextStatus)) return;
  lastMovedTaskId = id;
  setTimeout(() => { if (lastMovedTaskId === id) lastMovedTaskId = null; }, 600);
  tasks = tasks.map((t) => (t.id === id ? { ...t, status: nextStatus, doneAt: nextStatus === 'done' ? todayStr() : '' } : t));
  setStorage(KEYS.tasks, tasks);
  renderTasks();
  if (nextStatus === 'done') {
    confetti();
    toast('เยี่ยม! ทำงานเสร็จไปอีกหนึ่งชิ้น 🎉', 'success');
  }
}

function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || !confirm(`ลบงาน "${task.title}" ใช่ไหม?`)) return;
  tasks = tasks.filter((t) => t.id !== id);
  setStorage(KEYS.tasks, tasks);
  renderTasks();
}

// =====================================================================
// 3. POMODORO
// =====================================================================
const MODE_LABEL = { focus: 'โฟกัส', short: 'พักสั้น', long: 'พักยาว' };
const MODE_RING = { focus: 'stroke-indigo-600', short: 'stroke-emerald-500', long: 'stroke-sky-500' };
const RING_CIRCUMFERENCE = 2 * Math.PI * 108;

let pomo = sanitizePomo(getStorage(KEYS.pomo, POMO_DEFAULT));
let studyStats = sanitizeStats(getStorage(KEYS.stats, {}));
let studyLog = sanitizeStudyLog(getStorage(KEYS.studyLog, {}));
const SHORT_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']; // ตาม Date.getDay()
let mode = 'focus';
let totalTime = pomo.focus * 60;
let timeLeft = totalTime;
let endAt = 0;
let timerInterval = null;
let isRunning = false;
let focusCount = 0;
let audioCtx = null;

function updateTimerUI() {
  const ringBox = $('timer-ring-box');
  if (ringBox) ringBox.classList.toggle('timer-running', isRunning);
  $('timer-display').classList.toggle('timer-final', isRunning && timeLeft > 0 && timeLeft <= 10);
  const breakBtn = $('break-review');
  if (breakBtn) {
    const due = mode !== 'focus' && typeof cards !== 'undefined' ? dueCards().length : 0;
    breakBtn.classList.toggle('hidden', !due);
    if (due) breakBtn.textContent = `☕ พักอยู่ ทบทวนแฟลชการ์ด ${due} ใบไหม?`;
  }
  const mins = pad2(Math.floor(timeLeft / 60));
  const secs = pad2(timeLeft % 60);
  $('timer-display').textContent = `${mins}:${secs}`;
  $('timer-status').textContent = MODE_LABEL[mode];
  $('timer-round').textContent = mode === 'focus'
    ? `รอบที่ ${focusCount + 1} · ทำไปแล้ว ${focusCount} รอบ`
    : `ทำไปแล้ว ${focusCount} รอบ`;

  const ring = $('timer-ring');
  ring.setAttribute('class', `${MODE_RING[mode]} transition-[stroke-dashoffset] duration-500`);
  ring.style.strokeDasharray = RING_CIRCUMFERENCE;
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - timeLeft / totalTime);

  $('btn-toggle-timer').textContent = isRunning ? 'หยุดชั่วคราว' : timeLeft < totalTime ? 'ทำต่อ' : 'เริ่มจับเวลา';
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.title = isRunning ? `${mins}:${secs} · ${MODE_LABEL[mode]} – StudyFlow` : 'StudyFlow – Study & Schedule Organizer';
}

function setMode(m) {
  clearInterval(timerInterval);
  isRunning = false;
  mode = m;
  totalTime = pomo[m] * 60;
  timeLeft = totalTime;
  updateTimerUI();
}

function selectMode(m) {
  if (isRunning && !confirm('ตัวจับเวลากำลังทำงานอยู่ ต้องการเปลี่ยนโหมดใช่ไหม?')) return;
  setMode(m);
}

function tick() {
  timeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  updateTimerUI();
  if (timeLeft <= 0) completeSession();
}

function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    updateTimerUI();
    return;
  }
  unlockAudio();
  requestNotificationPermission();
  isRunning = true;
  const box = $('timer-ring-box');
  if (box && !reduceMotion.matches) { box.classList.remove('pop-once'); void box.offsetWidth; box.classList.add('pop-once'); }
  // อิงเวลาจริงแทนการนับทีละวินาที เพราะเบราว์เซอร์จะชะลอ timer เมื่อสลับไปแท็บอื่น
  endAt = Date.now() + timeLeft * 1000;
  timerInterval = setInterval(tick, 1000);
  updateTimerUI();
}

function resetTimer() {
  setMode(mode);
}

function completeSession() {
  clearInterval(timerInterval);
  isRunning = false;
  if (mode === 'focus') {
    focusCount++;
    const subject = logStudyTime(pomo.focus);
    if (!document.hidden) {
      confetti({ x: window.innerWidth / 2, y: window.innerHeight / 2, count: 32, spread: 1.6 });
      emojiRain(['🎉', '📚', '✨', '🔥', '💪'], 22);
    }
    notify('หมดเวลาโฟกัส! 🎉', `อ่าน ${subject} ไปอีก ${pomo.focus} นาที ได้เวลาพักแล้ว`);
    setMode(focusCount % pomo.longEvery === 0 ? 'long' : 'short');
  } else {
    notify('หมดเวลาพัก ⏰', 'กลับมาโฟกัสกันต่อ!');
    setMode('focus');
  }
}

function skipSession() {
  if (mode === 'focus') setMode((focusCount + 1) % pomo.longEvery === 0 ? 'long' : 'short');
  else setMode('focus');
}

function logStudyTime(minutes) {
  const subject = $('pomodoro-subject').value.trim() || 'วิชาทั่วไป';
  studyStats[subject] = (studyStats[subject] || 0) + minutes;
  setStorage(KEYS.stats, studyStats);
  const day = todayStr();
  studyLog[day] = studyLog[day] || {};
  studyLog[day][subject] = (studyLog[day][subject] || 0) + minutes;
  setStorage(KEYS.studyLog, studyLog);
  renderStudyStats();
  renderSubjectList();
  return subject;
}

const minutesOn = (date) => Object.values(studyLog[date] || {}).reduce((a, b) => a + b, 0);

function studyStreak() {
  // นับวันติดต่อกันที่ได้อ่าน (ถ้าวันนี้ยังไม่ได้อ่าน ให้นับต่อจากเมื่อวาน)
  let offset = minutesOn(todayStr()) > 0 ? 0 : -1;
  let streak = 0;
  while (minutesOn(todayStr(offset)) > 0) {
    streak++;
    offset--;
  }
  return streak;
}

function renderStudySummary() {
  const week = [];
  for (let i = -6; i <= 0; i++) {
    const date = todayStr(i);
    const d = parseDate(date);
    week.push({ label: formatThaiDate(date), short: i === 0 ? 'วันนี้' : SHORT_DAYS[d.getDay()], value: minutesOn(date), highlight: i === 0 });
  }
  const weekTotal = week.reduce((a, b) => a + b.value, 0);
  const streak = studyStreak();
  const tile = (value, label) => `
    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
      <div class="text-lg font-bold heading leading-tight">${value}</div>
      <div class="text-[11px] muted mt-0.5">${label}</div>
    </div>`;
  $('study-summary').innerHTML = tile(formatDuration(minutesOn(todayStr())), 'วันนี้')
    + tile(formatDuration(weekTotal), '7 วันล่าสุด')
    + tile(`${streak} วัน${streak >= 3 ? ' <span class="flame">🔥</span>' : ''}`, 'อ่านติดต่อกัน');
  $('study-week-chart').innerHTML = barChartHtml(week, { label: `นาทีที่อ่านใน 7 วันล่าสุด รวม ${weekTotal} นาที`, format: (v) => formatDuration(v) });
}

function renderStudyStats() {
  renderStudySummary();
  renderToday();
  const container = $('study-stats-list');
  const entries = Object.entries(studyStats).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = '<p class="muted">ยังไม่มีประวัติ จับเวลาโฟกัสครบ 1 รอบแล้วสถิติจะขึ้นที่นี่</p>';
    return;
  }
  const max = entries[0][1];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  container.innerHTML = entries.map(([k, v]) => `
    <div>
      <div class="flex justify-between items-center mb-1">
        <span class="text-slate-700 dark:text-slate-200 font-medium truncate pr-2 flex items-center gap-1.5">${subjDot(k)}${escapeHtml(k)}</span>
        <span class="text-indigo-600 dark:text-indigo-300 font-semibold whitespace-nowrap">${formatDuration(v)}</span>
      </div>
      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div class="h-full rounded-full ${colorFor(k, subjectColors, false) ? 'subj subj-fill' : 'bg-slate-400 dark:bg-slate-500'}" ${subjectStyle(k, subjectColors, false).replace('style="', `style="width:${Math.max(4, (v / max) * 100)}%;`) || `style="width:${Math.max(4, (v / max) * 100)}%"`}></div>
      </div>
    </div>`).join('') + `<p class="text-xs muted pt-2 border-t border-slate-100 dark:border-slate-800">รวมทั้งหมด ${formatDuration(total)}</p>`;
}

function clearStudyStats() {
  if (!Object.keys(studyStats).length || !confirm('ล้างสถิติเวลาอ่านทั้งหมดใช่ไหม?')) return;
  studyStats = {};
  studyLog = {};
  setStorage(KEYS.stats, studyStats);
  setStorage(KEYS.studyLog, studyLog);
  renderStudyStats();
  renderSubjectList();
}

function savePomoSubject() {
  setStorage(KEYS.pomoSubject, $('pomodoro-subject').value);
}

function fillPomoSettings() {
  $('pomo-focus').value = pomo.focus;
  $('pomo-short').value = pomo.short;
  $('pomo-long').value = pomo.long;
  $('pomo-every').value = pomo.longEvery;
  $('long-every-label').textContent = pomo.longEvery;
}

function savePomoSettings() {
  pomo = sanitizePomo({
    focus: $('pomo-focus').value,
    short: $('pomo-short').value,
    long: $('pomo-long').value,
    longEvery: $('pomo-every').value,
  });
  setStorage(KEYS.pomo, pomo);
  fillPomoSettings();
  if (!isRunning) setMode(mode);
  toast('บันทึกการตั้งค่าเวลาแล้ว', 'success', 1500);
}

// ---------- เสียงและการแจ้งเตือน ----------
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* ไม่มีเสียงก็ใช้งานต่อได้ */ }
}

function beep() {
  if (!audioCtx) return;
  try {
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch (e) { /* ignore */ }
}

async function requestNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch (e) { /* ignore */ }
  renderNotifyStatus();
}

function renderNotifyStatus() {
  const el = $('notify-status');
  if (!('Notification' in window)) {
    el.textContent = 'เบราว์เซอร์นี้ยังเด้งแจ้งเตือนไม่ได้ (บน iPhone ต้องติดตั้งเป็นแอปก่อน) จะใช้เสียงและข้อความบนจอแทน';
    return;
  }
  const p = Notification.permission;
  if (p === 'granted') el.textContent = '🔔 เปิดการแจ้งเตือนแล้ว จะเด้งเตือนเมื่อหมดเวลา';
  else if (p === 'denied') el.textContent = '🔕 การแจ้งเตือนถูกปิดในเบราว์เซอร์ เปิดได้ที่การตั้งค่าของเว็บไซต์';
  else el.innerHTML = '<button onclick="requestNotificationPermission()" class="underline text-indigo-600 dark:text-indigo-300">เปิดการแจ้งเตือน</button> เพื่อให้เด้งเตือนเมื่อหมดเวลา';
}

async function notify(title, body) {
  toast(`${title} ${body}`, 'success', 6000);
  beep();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'studyflow-pomodoro' };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch (e) { /* ignore */ }
}

// =====================================================================
// 3b. REMINDERS (เตือนเข้าเรียน / งานใกล้ส่ง ขณะเปิดแอป)
// =====================================================================
let reminders = sanitizeReminders(getStorage(KEYS.reminders, {}));

function fillReminderSettings() {
  $('rem-class').checked = reminders.classEnabled;
  $('rem-class-minutes').value = String(reminders.classMinutes);
  $('rem-task').checked = reminders.taskEnabled;
  $('rem-task-time').value = reminders.taskTime;
  $('rem-exam-eve-time').value = reminders.examEveTime;
  $('rem-exam-day-time').value = reminders.examDayTime;
  $('rem-weekly').checked = reminders.weeklyEnabled;
  $('rem-weekly-time').value = reminders.weeklyTime;
}

function saveReminderSettings(askPermission = false) {
  reminders = sanitizeReminders({
    classEnabled: $('rem-class').checked,
    classMinutes: $('rem-class-minutes').value,
    taskEnabled: $('rem-task').checked,
    taskTime: $('rem-task-time').value,
    examEveTime: $('rem-exam-eve-time').value,
    examDayTime: $('rem-exam-day-time').value,
    weeklyEnabled: $('rem-weekly').checked,
    weeklyTime: $('rem-weekly-time').value,
  });
  setStorage(KEYS.reminders, reminders);
  if (askPermission && (reminders.classEnabled || reminders.taskEnabled)) {
    unlockAudio();
    requestNotificationPermission();
  }
}

// จำว่าเตือนอะไรไปแล้ววันนี้ จะได้ไม่เตือนซ้ำ (เก็บเฉพาะของวันนี้)
function alreadyNotified(key) {
  const today = todayStr();
  let keys = getStorage(KEYS.notified, []).filter((k) => typeof k === 'string' && k.startsWith(today));
  if (keys.includes(`${today}|${key}`)) return true;
  keys.push(`${today}|${key}`);
  setStorage(KEYS.notified, keys);
  return false;
}

function checkReminders() {
  // ถ้าเครื่องนี้เปิดแจ้งเตือนผ่านเซิร์ฟเวอร์แล้ว ให้เซิร์ฟเวอร์เตือนอย่างเดียว จะได้ไม่เด้งซ้ำ
  if (getStorage('push_enabled', false) === true) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (reminders.classEnabled) {
    schedules.filter((s) => s.day === DAYS[todayIndex()]).forEach((s) => {
      const diff = toMinutes(s.start) - nowMin;
      if (diff > 0 && diff <= reminders.classMinutes && !alreadyNotified(`class-${s.id}`)) {
        notify(`อีก ${diff} นาทีเข้าเรียน 📚`, `${s.name}${s.room ? ` ห้อง ${s.room}` : ''} เริ่ม ${s.start}`);
      }
    });
  }

  if (reminders.taskEnabled && nowMin >= toMinutes(reminders.taskTime)) {
    const pending = tasks.filter((t) => t.status !== 'done');
    const overdue = pending.filter((t) => daysUntil(t.due) !== null && daysUntil(t.due) < 0);
    const today = pending.filter((t) => daysUntil(t.due) === 0);
    const tomorrow = pending.filter((t) => daysUntil(t.due) === 1);
    if ((overdue.length || today.length || tomorrow.length) && !alreadyNotified('tasks')) {
      const parts = [];
      if (overdue.length) parts.push(`เลยกำหนด ${overdue.length} งาน`);
      if (today.length) parts.push(`ส่งวันนี้: ${today.map((t) => t.title).join(', ')}`);
      if (tomorrow.length) parts.push(`ส่งพรุ่งนี้: ${tomorrow.map((t) => t.title).join(', ')}`);
      notify('งานใกล้ถึงกำหนดส่ง ⏰', parts.join(' · '));
    }
  }
}

// =====================================================================
// Mini bar chart (ชุดข้อมูลเดียว สีเดียว มี tooltip เมื่อแตะ/ชี้)
// =====================================================================
function barChartHtml(items, { max, label, format }) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  const bars = items.map((i) => {
    const pct = i.value > 0 ? Math.max(3, (i.value / top) * 100) : 0;
    const tip = `${i.label}: ${format(i.value)}`;
    return `
      <div class="group relative flex-1 h-full flex flex-col justify-end items-center outline-none" tabindex="0" aria-label="${escapeHtml(tip)}">
        <div class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition z-10">${escapeHtml(tip)}</div>
        <div class="w-full max-w-[28px] rounded-t ${i.highlight ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-indigo-400/70 dark:bg-indigo-500/60'} group-hover:bg-indigo-600 dark:group-hover:bg-indigo-300 transition-colors" style="height:${pct}%"></div>
      </div>`;
  }).join('');
  const labels = items.map((i) => `<div class="flex-1 text-center text-[10px] muted truncate ${i.highlight ? 'font-semibold !text-indigo-600 dark:!text-indigo-300' : ''}">${escapeHtml(i.short || i.label)}</div>`).join('');
  return `
    <div role="img" aria-label="${escapeHtml(label)}">
      <div class="flex items-end gap-1.5 h-28 pt-8 border-b border-slate-200 dark:border-slate-700">${bars}</div>
      <div class="flex gap-1.5 mt-1">${labels}</div>
    </div>`;
}

// =====================================================================
// 4. GPA
// =====================================================================
let gpaRows = sanitizeGpaRows(getStorage(KEYS.gpaRows, [
  { name: 'Data Structure', credits: 3, grade: 'A' },
  { name: 'Algorithm Analysis', credits: 3, grade: 'B+' },
  { name: 'English for Tech', credits: 2, grade: 'A' },
]));
let gpaSim = sanitizeGpaSim(getStorage(KEYS.gpaSim, {}));

function renderGpaRows() {
  const tbody = $('gpa-rows');
  if (!gpaRows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs muted">ยังไม่มีวิชา กด "+ เพิ่มวิชา" เพื่อเริ่ม</td></tr>';
  } else {
    tbody.innerHTML = gpaRows.map((r, i) => `
      <tr>
        <td class="py-2 pr-2"><input type="text" value="${escapeHtml(r.name)}" placeholder="ชื่อวิชา" oninput="updateGpaRow(${i}, 'name', this.value)" class="input !p-1.5 min-w-[110px]" /></td>
        <td class="py-2 pr-2"><input type="number" value="${r.credits}" min="0" max="12" inputmode="numeric" oninput="updateGpaRow(${i}, 'credits', this.value)" class="input !p-1.5 !w-16" /></td>
        <td class="py-2 pr-2">
          <select onchange="updateGpaRow(${i}, 'grade', this.value)" class="input !p-1.5 !w-24">
            ${Object.keys(GRADE_POINTS).map((g) => `<option value="${g}" ${g === r.grade ? 'selected' : ''}>${g} (${GRADE_POINTS[g].toFixed(1)})</option>`).join('')}
          </select>
        </td>
        <td class="py-2 text-right"><button onclick="removeGpaRow(${i})" aria-label="ลบวิชา" class="text-slate-400 hover:text-rose-500 p-1">✕</button></td>
      </tr>`).join('');
  }
  calculateGPA();
}

function addGpaRow() {
  gpaRows.push({ name: '', credits: 3, grade: 'A' });
  setStorage(KEYS.gpaRows, gpaRows);
  renderGpaRows();
  const inputs = $('gpa-rows').querySelectorAll('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
}

function removeGpaRow(i) {
  gpaRows.splice(i, 1);
  setStorage(KEYS.gpaRows, gpaRows);
  renderGpaRows();
}

function updateGpaRow(i, field, value) {
  if (!gpaRows[i]) return;
  if (field === 'credits') value = clamp(Number(value) || 0, 0, 12);
  if (field === 'grade' && !(value in GRADE_POINTS)) return;
  gpaRows[i][field] = value;
  setStorage(KEYS.gpaRows, gpaRows);
  calculateGPA();
}

function calculateGPA() {
  let totalPoints = 0;
  let totalCredits = 0;
  gpaRows.forEach((r) => {
    totalCredits += r.credits;
    totalPoints += r.credits * GRADE_POINTS[r.grade];
  });
  const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  countUp($('gpa-result'), 'gpa', gpa, 'dec2');
  $('gpa-total-credits').textContent = `รวมทั้งหมด ${totalCredits} หน่วยกิต`;

  // ถ้ากรอก GPAX เดิมไว้ใน Simulator ให้ประมาณ GPAX ใหม่ให้ด้วย
  const curGpax = parseFloat(gpaSim.gpax);
  const curCredits = parseFloat(gpaSim.credits);
  const projected = $('gpa-projected');
  if (totalCredits > 0 && Number.isFinite(curGpax) && Number.isFinite(curCredits) && curCredits >= 0) {
    const newGpax = (curGpax * curCredits + totalPoints) / (curCredits + totalCredits);
    projected.textContent = `ถ้าได้ตามนี้ GPAX ใหม่จะประมาณ ${newGpax.toFixed(2)}`;
    projected.classList.remove('hidden');
  } else {
    projected.classList.add('hidden');
  }
}

const SIM_FIELDS = { gpax: 'sim-current-gpax', credits: 'sim-current-credits', target: 'sim-target-gpax', termCredits: 'sim-term-credits' };

function fillGpaSim() {
  Object.entries(SIM_FIELDS).forEach(([k, id]) => { $(id).value = gpaSim[k]; });
}

function saveGpaSim() {
  Object.entries(SIM_FIELDS).forEach(([k, id]) => { gpaSim[k] = $(id).value; });
  setStorage(KEYS.gpaSim, gpaSim);
  calculateGPA();
}

function simulateTarget() {
  const curGpax = parseFloat(gpaSim.gpax);
  const curCredits = parseFloat(gpaSim.credits);
  const targetGpax = parseFloat(gpaSim.target);
  const termCredits = parseFloat(gpaSim.termCredits);
  const resultDiv = $('sim-result');

  if ([curGpax, curCredits, targetGpax, termCredits].some((n) => !Number.isFinite(n))) {
    resultDiv.innerHTML = '<span class="text-rose-500">กรุณากรอกข้อมูลตัวเลขให้ครบทุกช่อง</span>';
    return;
  }
  if (termCredits <= 0) {
    resultDiv.innerHTML = '<span class="text-rose-500">หน่วยกิตเทอมนี้ต้องมากกว่า 0</span>';
    return;
  }

  // Term GPA = (Target GPAX × หน่วยกิตรวม − GPAX เดิม × หน่วยกิตเดิม) ÷ หน่วยกิตเทอมนี้
  const totalCredits = curCredits + termCredits;
  const required = ((targetGpax * totalCredits) - (curGpax * curCredits)) / termCredits;
  const requiredText = required.toFixed(2);

  if (required > 4.0) {
    resultDiv.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-semibold">เป็นไปไม่ได้ในเทอมนี้:</span> ต้องได้เกรดเฉลี่ยเทอมนี้สูงถึง <b>${requiredText}</b> (เกิน 4.00) ลองปรับเป้าหมายหรือวางแผนระยะยาวเพิ่มขึ้นครับ`;
  } else if (required <= 0) {
    resultDiv.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400 font-semibold">ทำได้สบายมาก:</span> เกรดเฉลี่ยเดิมสูงพออยู่แล้ว เทอมนี้เพียงแค่ประคองไม่ให้ติด F ก็ถึงเป้าหมาย';
  } else {
    resultDiv.innerHTML = `คุณต้องทำเกรดเฉลี่ยในเทอมนี้ให้ได้อย่างน้อย <span class="text-indigo-600 dark:text-indigo-300 font-bold text-sm">${requiredText}</span> เพื่อให้เกรดเฉลี่ยรวมถึงเป้า <b>${targetGpax.toFixed(2)}</b>`;
  }
}

// =====================================================================
// การเข้าเรียน (เช็กชื่อ / นับวันขาด)
// =====================================================================
const ATTEND_LABEL = { present: 'มา', late: 'สาย', leave: 'ลา', absent: 'ขาด' };
const ATTEND_ACTIVE = {
  present: 'bg-emerald-600 text-white border-emerald-600',
  late: 'bg-amber-500 text-white border-amber-500',
  leave: 'bg-sky-600 text-white border-sky-600',
  absent: 'bg-rose-600 text-white border-rose-600',
};

// วันที่มีเรียนของคาบนี้ ตั้งแต่เปิดเทอมจนถึงวันนี้ (ใหม่สุดก่อน)
function classDates(sched) {
  const out = [];
  const start = parseDate(attendSettings.semesterStart);
  if (!start) return out;
  const dayIdx = DAYS.indexOf(sched.day);
  const d = new Date(start);
  d.setDate(d.getDate() + ((dayIdx - ((d.getDay() + 6) % 7) + 7) % 7));
  const today = parseDate(todayStr());
  const limit = attendSettings.weeks + 2;
  while (d <= today && out.length < limit) {
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    d.setDate(d.getDate() + 7);
  }
  return out.reverse();
}

function attendanceSummary(sched) {
  const marks = attendance[sched.id] || {};
  const count = { present: 0, late: 0, leave: 0, absent: 0 };
  Object.values(marks).forEach((st) => { count[st]++; });
  const missed = count.leave + count.absent;
  const max = Math.floor((attendSettings.weeks * (100 - attendSettings.required)) / 100);
  return { ...count, missed, max, remaining: max - missed, marked: Object.keys(marks).length };
}

function attendanceBadgeHtml(sched) {
  const a = attendanceSummary(sched);
  if (!a.marked) return '';
  let tone = 'muted';
  let text = `ขาด/ลา ${a.missed}/${a.max}`;
  if (a.remaining < 0) { tone = 'text-rose-600 dark:text-rose-400 font-semibold'; text = `⚠️ ขาดเกิน ${a.missed}/${a.max} เสี่ยงหมดสิทธิ์สอบ`; }
  else if (a.remaining === 0) { tone = 'text-rose-600 dark:text-rose-400 font-semibold'; text = `⚠️ ขาดครบ ${a.max} ครั้งแล้ว ห้ามขาดอีก`; }
  else if (a.remaining === 1) { tone = 'text-orange-600 dark:text-orange-400 font-medium'; text = `ขาดได้อีก 1 ครั้ง (${a.missed}/${a.max})`; }
  return `<div class="text-[11px] mt-1 ${tone}">${text}</div>`;
}

function attendanceButtonsHtml(schedId, date) {
  const cur = (attendance[schedId] || {})[date];
  return ATTEND_STATUSES.map((st) => `
    <button onclick="event.stopPropagation(); setAttendance(${schedId}, '${date}', '${st}')"
      class="px-2.5 py-1 rounded-lg text-[11px] font-medium border ${cur === st ? ATTEND_ACTIVE[st] : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${ATTEND_LABEL[st]}</button>`).join('');
}

function setAttendance(schedId, date, status) {
  if (!ATTEND_STATUSES.includes(status) || !DATE_RE.test(date)) return;
  const marks = { ...(attendance[schedId] || {}) };
  if (marks[date] === status) delete marks[date]; // แตะซ้ำ = ยกเลิก
  else marks[date] = status;
  attendance = { ...attendance, [schedId]: marks };
  if (!Object.keys(marks).length) delete attendance[schedId];
  setStorage(KEYS.attendance, attendance);
  if (marks[date]) floatEmoji({ present: '✅', late: '⏰', leave: '📝', absent: '😢' }[status]);
  const sched = schedules.find((x) => x.id === schedId);
  const a = sched ? attendanceSummary(sched) : null;
  if (a && (status === 'absent' || status === 'leave') && marks[date]) {
    if (a.remaining < 0) toast(`⚠️ ${sched.name} ขาดเกินเกณฑ์แล้ว (${a.missed}/${a.max}) ควรติดต่ออาจารย์`, 'error', 6000);
    else if (a.remaining === 0) toast(`⚠️ ${sched.name}: ขาดครบ ${a.max} ครั้งแล้ว ห้ามขาดอีก`, 'error', 6000);
    else if (a.remaining === 1) toast(`${sched.name}: ขาดได้อีก 1 ครั้งเท่านั้น`, 'error', 5000);
  }
  renderSchedule();
  if (currentSheetId === schedId) renderSubjectSheet();
}

// =====================================================================
// หน้ารายละเอียดวิชา (การเข้าเรียน + อาจารย์ โน้ต ลิงก์)
// =====================================================================
let currentSheetId = null;
let infoSaveTimer = null;

function infoFor(name) {
  return subjectInfo[subjectKey(name)] || { teacher: '', notes: '', links: [] };
}

function openSubjectSheet(id) {
  const sched = schedules.find((x) => x.id === id);
  if (!sched) return;
  currentSheetId = id;
  pickingPlace = false;
  const info = infoFor(sched.name);
  $('sheet-teacher').value = info.teacher;
  $('sheet-notes').value = info.notes;
  $('sheet-link-label').value = '';
  $('sheet-link-url').value = '';
  $('attend-start').value = attendSettings.semesterStart;
  $('attend-weeks').value = attendSettings.weeks;
  $('attend-required').value = attendSettings.required;
  resetScoreForm();
  renderSubjectSheet();
  openModal('subject-modal');
}

function renderSubjectSheet() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  renderScoreSection(sched);
  const k = subjectKey(sched.name);
  const nNotes = notes.filter((n) => subjectKey(n.subject) === k).length;
  const subjCards = cards.filter((c) => subjectKey(c.subject) === k);
  const nDue = subjCards.filter((c) => c.due <= todayStr()).length;
  $('sheet-study-links').innerHTML = `
    <button onclick="openSubjectNotes()" class="btn-secondary text-sm !py-2"><i data-lucide="notebook-pen" class="w-4 h-4"></i> โน้ต (${nNotes})</button>
    <button onclick="openSubjectDeck()" class="btn-secondary text-sm !py-2"><i data-lucide="layers" class="w-4 h-4"></i> การ์ด (${subjCards.length})${nDue ? ` <span class="badge-dot !static !inline-block">${nDue}</span>` : ''}</button>`;
  $('sheet-head').innerHTML = `
    <div ${subjectStyle(sched.name)} class="subj subj-bar pl-3">
      <h3 class="text-lg font-bold heading leading-snug">${escapeHtml(sched.name)}</h3>
      <p class="text-xs muted">วัน${sched.day} ${escapeHtml(sched.start)} - ${escapeHtml(sched.end)}${sched.room ? ` · ห้อง ${escapeHtml(sched.room)}` : ''}</p>
    </div>`;

  const a = attendanceSummary(sched);
  const pct = a.marked ? Math.round(((a.present + a.late) / a.marked) * 100) : null;
  const tile = (v, l, cls = 'heading') => `<div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center"><div class="text-lg font-bold ${cls}" data-count="${v}" data-count-key="att-${sched.id}-${l}">${v}</div><div class="text-[10px] muted">${l}</div></div>`;
  $('sheet-attend-summary').innerHTML = `
    <div class="grid grid-cols-4 gap-2">
      ${tile(a.present, 'มา')}${tile(a.late, 'สาย')}${tile(a.leave, 'ลา')}${tile(a.absent, 'ขาด', a.absent ? 'text-rose-600 dark:text-rose-400' : 'heading')}
    </div>
    <p class="text-xs mt-2 ${a.remaining <= 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : a.remaining === 1 ? 'text-orange-600 dark:text-orange-400' : 'muted'}">
      ขาด+ลาแล้ว ${a.missed} จากที่ขาดได้ ${a.max} ครั้ง (ต้องเข้าเรียน ${attendSettings.required}% ของ ${attendSettings.weeks} สัปดาห์)${pct !== null ? ` · เข้าเรียน ${pct}% ของคาบที่เช็กแล้ว` : ''}
    </p>`;

  runCountUps($('sheet-attend-summary'));
  const dates = classDates(sched);
  $('sheet-attend-list').innerHTML = dates.length ? dates.map((d) => `
    <div class="flex items-center justify-between gap-2 py-2">
      <span class="text-xs heading whitespace-nowrap">${formatThaiDate(d)}${d === todayStr() ? ' <span class="muted">(วันนี้)</span>' : ''}</span>
      <div class="flex gap-1">${attendanceButtonsHtml(sched.id, d)}</div>
    </div>`).join('') : '<p class="text-xs muted py-2">ยังไม่มีคาบที่ผ่านมาให้เช็กชื่อ ถ้าเปิดเทอมมาแล้ว กดปุ่ม "ตั้งวันเปิดเทอม" ด้านล่างเพื่อย้อนเช็กสัปดาห์ก่อน ๆ</p>';

  renderPlaceSection(sched);
  const info = infoFor(sched.name);
  $('sheet-links').innerHTML = info.links.length ? info.links.map((l, i) => `
    <div class="flex items-center gap-2">
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
        <i data-lucide="external-link" class="w-4 h-4 text-indigo-500 shrink-0"></i>
        <span class="truncate heading">${escapeHtml(l.label || l.url)}</span>
      </a>
      <button onclick="removeSubjectLink(${i})" aria-label="ลบลิงก์" class="text-slate-400 hover:text-rose-500 p-1">✕</button>
    </div>`).join('') : '<p class="text-xs muted">ยังไม่มีลิงก์ เช่น Google Classroom, กลุ่ม LINE, Drive เอกสาร</p>';
  refreshIcons();
}

function saveSubjectInfoNow() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  const k = subjectKey(sched.name);
  const cur = infoFor(sched.name);
  subjectInfo = { ...subjectInfo, [k]: { ...cur, teacher: $('sheet-teacher').value.slice(0, 100), notes: $('sheet-notes').value.slice(0, 5000) } };
  setStorage(KEYS.subjectInfo, subjectInfo);
}

function saveSubjectInfoSoon() {
  clearTimeout(infoSaveTimer);
  infoSaveTimer = setTimeout(saveSubjectInfoNow, 500);
}

function addSubjectLink() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  let url = $('sheet-link-url').value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { new URL(url); } catch (e) { return toast('ลิงก์ไม่ถูกต้อง', 'error'); }
  saveSubjectInfoNow();
  const k = subjectKey(sched.name);
  const cur = infoFor(sched.name);
  if (cur.links.length >= 20) return toast('เพิ่มลิงก์ได้สูงสุด 20 ลิงก์ต่อวิชา', 'error');
  subjectInfo = { ...subjectInfo, [k]: { ...cur, links: [...cur.links, { label: $('sheet-link-label').value.trim().slice(0, 60), url }] } };
  setStorage(KEYS.subjectInfo, subjectInfo);
  $('sheet-link-label').value = '';
  $('sheet-link-url').value = '';
  renderSubjectSheet();
}

function removeSubjectLink(i) {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  const k = subjectKey(sched.name);
  const cur = infoFor(sched.name);
  subjectInfo = { ...subjectInfo, [k]: { ...cur, links: cur.links.filter((_, j) => j !== i) } };
  setStorage(KEYS.subjectInfo, subjectInfo);
  renderSubjectSheet();
}

// =====================================================================
// แผนที่ห้องเรียน (OpenStreetMap + Leaflet โหลดเมื่อเปิดใช้เท่านั้น)
// =====================================================================
const LEAFLET_VER = '1.9.4';
const DEFAULT_CENTER = { lat: 19.9847, lng: 99.8489 }; // ม.ราชภัฏเชียงราย (ใช้ตอนยังไม่เคยตั้งตำแหน่ง)
let leafletPromise = null;
let placeMap = null;
let placeMarker = null;
let pickingPlace = false;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletPromise = null; reject(new Error('load failed')); };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

// ตำแหน่งของคาบเรียน: ใช้ของวิชานั้นก่อน ถ้าไม่มีให้ยืมจากวิชาอื่นที่เรียนห้องเดียวกัน
function placeFor(sched) {
  if (!sched) return null;
  const own = infoFor(sched.name).place;
  if (own) return own;
  const room = String(sched.room || '').trim().toLowerCase();
  if (!room) return null;
  const twin = schedules.find((x) => x !== sched && String(x.room || '').trim().toLowerCase() === room && infoFor(x.name).place);
  return twin ? infoFor(twin.name).place : null;
}

const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

function directionsUrl(p, app = IS_APPLE ? 'apple' : 'google') {
  return app === 'apple'
    ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
}

// อ่านพิกัดจากข้อความ: "19.98, 99.85" หรือลิงก์ Google Maps / Apple Maps แบบเต็ม
function parsePlaceText(text) {
  let t = String(text || '').trim();
  try { t = decodeURIComponent(t); } catch (e) { /* ใช้ข้อความเดิม */ }
  const num = '(-?\\d{1,3}\\.\\d+)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|ll|daddr|destination|query|sll)=(?:loc:)?${num},\\s*${num}`),
    new RegExp(`^${num}\\s*,\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return sanitizePlace({ lat: m[1], lng: m[2] });
  }
  return null;
}

function setSubjectPlace(place) {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  saveSubjectInfoNow();
  const k = subjectKey(sched.name);
  const cur = { ...infoFor(sched.name) };
  if (place) cur.place = place; else delete cur.place;
  subjectInfo = { ...subjectInfo, [k]: cur };
  setStorage(KEYS.subjectInfo, subjectInfo);
  renderToday();
}

function renderPlaceSection(sched) {
  const own = infoFor(sched.name).place;
  const place = placeFor(sched);
  const borrowed = place && !own;
  $('sheet-place-actions').innerHTML = place ? `
    <div class="grid grid-cols-2 gap-2">
      <a href="${escapeHtml(directionsUrl(place, 'apple'))}" target="_blank" rel="noopener noreferrer" class="btn-secondary text-sm !py-2"><i data-lucide="navigation" class="w-4 h-4"></i> Apple Maps</a>
      <a href="${escapeHtml(directionsUrl(place, 'google'))}" target="_blank" rel="noopener noreferrer" class="btn-secondary text-sm !py-2"><i data-lucide="navigation" class="w-4 h-4"></i> Google Maps</a>
    </div>
    <p class="text-[11px] muted">${borrowed ? `ใช้ตำแหน่งของห้อง ${escapeHtml(sched.room)} จากวิชาอื่น · ` : ''}เปลี่ยนได้โดยแตะ "แก้ตำแหน่ง" แล้วแตะบนแผนที่${own ? ' · <button type="button" onclick="clearSubjectPlace()" class="underline hover:text-rose-500">ลบตำแหน่ง</button>' : ''}</p>`
    : '<p class="text-xs muted">ยังไม่ได้ตั้งตำแหน่งห้องเรียน ตั้งครั้งเดียว แล้วจะมีปุ่มนำทางในหน้า "วันนี้"</p>';
  $('place-edit-btn').innerHTML = `<i data-lucide="${pickingPlace ? 'check' : 'map-pin'}" class="w-3.5 h-3.5"></i> ${pickingPlace ? 'เสร็จ' : place ? 'แก้ตำแหน่ง' : 'ตั้งตำแหน่ง'}`;
  $('place-tools').classList.toggle('hidden', !pickingPlace);
  $('place-hint').classList.toggle('hidden', !pickingPlace);
  const showMap = !!place || pickingPlace;
  $('place-map').classList.toggle('hidden', !showMap);
  if (showMap) drawPlaceMap(place);
}

async function drawPlaceMap(place) {
  let L;
  try { L = await loadLeaflet(); } catch (e) {
    $('place-map').innerHTML = '<p class="text-xs muted p-3">โหลดแผนที่ไม่ได้ (ต้องต่ออินเทอร์เน็ต) แต่ปุ่มนำทางยังใช้ได้</p>';
    return;
  }
  const el = $('place-map');
  if (!placeMap || placeMap.getContainer() !== el) {
    el.innerHTML = '';
    placeMap = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(placeMap);
    placeMap.on('click', (ev) => {
      if (!pickingPlace) return;
      const p = sanitizePlace({ lat: ev.latlng.lat, lng: ev.latlng.lng });
      setSubjectPlace(p);
      showPlaceMarker(p, false);
      renderSubjectSheet();
    });
  }
  const center = place || DEFAULT_CENTER;
  placeMap.setView([center.lat, center.lng], place ? 18 : 16);
  showPlaceMarker(place, false);
  setTimeout(() => placeMap && placeMap.invalidateSize(), 50); // แผนที่อยู่ใน modal ที่เพิ่งเปิด ต้องวัดขนาดใหม่
}

function showPlaceMarker(place, pan = true) {
  if (!placeMap || !window.L) return;
  if (placeMarker) { placeMarker.remove(); placeMarker = null; }
  if (!place) return;
  placeMarker = window.L.circleMarker([place.lat, place.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#e11d48', fillOpacity: 1 }).addTo(placeMap);
  if (pan) placeMap.setView([place.lat, place.lng], Math.max(placeMap.getZoom(), 17));
}

function togglePlaceEditing() {
  pickingPlace = !pickingPlace;
  $('place-input').value = '';
  renderSubjectSheet();
}

function clearSubjectPlace() {
  if (!confirm('ลบตำแหน่งห้องเรียนของวิชานี้ใช่ไหม?')) return;
  setSubjectPlace(null);
  renderSubjectSheet();
}

function useCurrentLocation() {
  if (!navigator.geolocation) return toast('อุปกรณ์นี้หาตำแหน่งไม่ได้', 'error');
  toast('กำลังหาตำแหน่ง…', 'info', 2000);
  navigator.geolocation.getCurrentPosition((pos) => {
    const p = sanitizePlace({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setSubjectPlace(p);
    pickingPlace = false;
    renderSubjectSheet();
    toast(`บันทึกตำแหน่งแล้ว (คลาดเคลื่อนประมาณ ${Math.round(pos.coords.accuracy)} ม.)`, 'success');
  }, (err) => {
    toast(err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เปิดได้ที่ การตั้งค่า → ความเป็นส่วนตัว → บริการหาตำแหน่ง' : 'หาตำแหน่งไม่สำเร็จ ลองอีกครั้งตอนอยู่กลางแจ้ง', 'error', 5000);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

function applyPlaceText() {
  const text = $('place-input').value;
  if (!text.trim()) return;
  if (/goo\.gl|maps\.app/i.test(text)) {
    return toast('ลิงก์แบบย่ออ่านพิกัดไม่ได้ ใน Google Maps ให้กดค้างตรงตึก แล้วคัดลอกตัวเลขพิกัด (เช่น 19.98, 99.85) มาวางแทน', 'error', 7000);
  }
  const p = parsePlaceText(text);
  if (!p) return toast('อ่านพิกัดไม่ได้ ลองวางตัวเลขแบบ 19.98, 99.85', 'error', 5000);
  setSubjectPlace(p);
  pickingPlace = false;
  renderSubjectSheet();
  toast('บันทึกตำแหน่งแล้ว', 'success');
}

function saveAttendSettings() {
  attendSettings = sanitizeAttendSettings({ semesterStart: $('attend-start').value, weeks: $('attend-weeks').value, required: $('attend-required').value });
  setStorage(KEYS.attendSettings, attendSettings);
  renderSubjectSheet();
  renderSchedule();
}

// =====================================================================
// คะแนนรายวิชา + ประมาณเกรด
// =====================================================================
// { [subjectKey]: { total: 100, items: [{ id, name, got, max, worth }] } }
//   got/max = คะแนนที่ได้จากคะแนนเต็มของชิ้นนั้น, worth = ชิ้นนี้คิดเป็นกี่คะแนนของวิชา
const GRADE_CUTOFFS = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50]];

function sanitizeScores(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([k, v]) => {
    if (!k || k.length > 100 || !v || typeof v !== 'object') return;
    const items = (Array.isArray(v.items) ? v.items : [])
      .filter((it) => it && Number(it.max) > 0 && Number(it.worth) >= 0)
      .slice(0, 60)
      .map((it) => ({
        id: toId(it.id),
        name: String(it.name || 'ไม่มีชื่อ').slice(0, 60),
        got: clamp(Number(it.got) || 0, 0, 1000),
        max: clamp(Number(it.max), 0.01, 1000),
        worth: clamp(Number(it.worth), 0, 100),
      }));
    out[subjectKey(k)] = { total: clamp(Number(v.total) || 100, 1, 1000), items };
  });
  return out;
}

function gradeFor(percent) {
  const hit = GRADE_CUTOFFS.find(([, c]) => percent >= c);
  return hit ? hit[0] : 'F';
}

function scoreSummary(name) {
  const data = scores[subjectKey(name)] || { total: 100, items: [] };
  const total = data.total;
  const counted = data.items.reduce((a, it) => a + it.worth, 0); // เก็บไปแล้วกี่คะแนน
  const earned = data.items.reduce((a, it) => a + (Math.min(it.got, it.max) / it.max) * it.worth, 0);
  const remaining = Math.max(0, total - counted);
  const rate = counted > 0 ? earned / counted : null;
  const projected = rate === null ? null : ((earned + remaining * rate) / total) * 100;
  const best = ((earned + remaining) / total) * 100;
  const needs = GRADE_CUTOFFS.map(([g, c]) => {
    const need = (c / 100) * total - earned;
    if (need <= 0) return { grade: g, state: 'safe' };
    if (remaining <= 0 || need > remaining) return { grade: g, state: 'impossible' };
    return { grade: g, state: 'need', pct: Math.ceil((need / remaining) * 100) };
  });
  return { total, counted, earned, remaining, rate, projected, best, needs, items: data.items };
}

const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('th-TH', { maximumFractionDigits: 1 });

let editingScoreId = null;

function resetScoreForm() {
  editingScoreId = null;
  ['score-name', 'score-got', 'score-max', 'score-worth'].forEach((id) => { $(id).value = ''; });
  $('score-save-btn').textContent = '+ เพิ่มคะแนน';
  $('score-cancel-btn').classList.add('hidden');
}

function renderScoreSection(sched) {
  const sm = scoreSummary(sched.name);
  $('score-total').value = sm.total;
  if (!sm.items.length) {
    $('sheet-score-summary').innerHTML = '<p class="text-xs muted">ยังไม่มีคะแนน จดคะแนนงาน ควิซ หรือสอบที่ได้คืนมา แอปจะประมาณเกรดให้</p>';
  } else {
    const projGrade = sm.projected === null ? '-' : gradeFor(sm.projected);
    const gradeKey = `grade-${sched.id}`;
    const gradeChanged = countCache[gradeKey] !== undefined && countCache[gradeKey] !== projGrade;
    countCache[gradeKey] = projGrade;
    const needChips = sm.needs.map((n) => {
      if (n.state === 'safe') return `<span class="px-2 py-1 rounded-lg text-[11px] ${DUE_BADGE.done}">${n.grade} ✓ ได้แน่นอน</span>`;
      if (n.state === 'impossible') return `<span class="px-2 py-1 rounded-lg text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 line-through">${n.grade}</span>`;
      const tone = n.pct > 90 ? DUE_BADGE.overdue : n.pct > 75 ? DUE_BADGE.soon : DUE_BADGE.normal;
      return `<span class="px-2 py-1 rounded-lg text-[11px] font-medium ${tone}">${n.grade} ต้องได้ ${n.pct}%</span>`;
    }).join('');
    $('sheet-score-summary').innerHTML = `
      <div class="grid grid-cols-3 gap-2">
        <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center"><div class="text-lg font-bold heading"><span data-count="${sm.earned}" data-count-key="score-e-${sched.id}" data-count-fmt="dec1">${fmt1(sm.earned)}</span><span class="text-xs muted">/${fmt1(sm.counted)}</span></div><div class="text-[10px] muted">ได้แล้ว (จากที่เก็บไป)</div></div>
        <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center"><div class="text-lg font-bold heading" data-count="${sm.remaining}" data-count-key="score-r-${sched.id}" data-count-fmt="dec1">${fmt1(sm.remaining)}</div><div class="text-[10px] muted">คะแนนที่ยังเหลือ</div></div>
        <div class="bg-indigo-50 dark:bg-indigo-500/15 rounded-xl p-2 text-center"><div class="text-lg font-black text-indigo-600 dark:text-indigo-300 ${gradeChanged ? 'grade-pop' : ''}">${projGrade}</div><div class="text-[10px] muted">เกรดที่คาด</div></div>
      </div>
      <p class="text-xs muted mt-2">ถ้าทำได้ ${fmt1(sm.rate * 100)}% แบบนี้ต่อไป คาดว่าได้ ${fmt1(sm.projected)} จาก 100 · เกรดสูงสุดที่ยังเป็นไปได้: <b class="heading">${gradeFor(sm.best)}</b></p>
      ${sm.remaining > 0 ? `<div class="text-xs muted mt-2 mb-1">ส่วนที่เหลือ (${fmt1(sm.remaining)} คะแนน) ต้องทำได้:</div><div class="flex flex-wrap gap-1.5">${needChips}</div>` : ''}`;
  }
  runCountUps($('sheet-score-summary'));
  $('sheet-score-list').innerHTML = sm.items.map((it) => `
    <button onclick="editScore(${it.id})" class="w-full flex items-center justify-between gap-2 py-2 text-left">
      <span class="text-sm heading truncate">${escapeHtml(it.name)}</span>
      <span class="text-xs muted whitespace-nowrap">${fmt1(it.got)}/${fmt1(it.max)} → <b class="heading">${fmt1((Math.min(it.got, it.max) / it.max) * it.worth)}</b>/${fmt1(it.worth)}</span>
    </button>`).join('');
  $('score-use-gpa').classList.toggle('hidden', sm.projected === null);
}

function quickScoreName(label) {
  const sched = schedules.find((x) => x.id === currentSheetId);
  const existing = sched ? (scores[subjectKey(sched.name)] || { items: [] }).items.filter((it) => it.name.startsWith(label)).length : 0;
  $('score-name').value = ['สอบกลางภาค', 'สอบปลายภาค'].includes(label) ? label : `${label} ${existing + 1}`;
  $('score-got').focus();
}

function saveScore() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  const name = $('score-name').value.trim() || 'คะแนน';
  const got = parseFloat($('score-got').value);
  const max = parseFloat($('score-max').value);
  let worth = parseFloat($('score-worth').value);
  if (!Number.isFinite(got) || !Number.isFinite(max) || max <= 0) return toast('กรอกคะแนนที่ได้ และคะแนนเต็ม', 'error');
  if (!Number.isFinite(worth)) worth = max; // ไม่กรอก = คิดเป็นคะแนนตามคะแนนเต็ม
  if (got > max) return toast('คะแนนที่ได้มากกว่าคะแนนเต็ม', 'error');
  const k = subjectKey(sched.name);
  const cur = scores[k] || { total: 100, items: [] };
  const otherWorth = cur.items.filter((it) => it.id !== editingScoreId).reduce((a, it) => a + it.worth, 0);
  if (otherWorth + worth > cur.total + 0.001) return toast(`รวมแล้วเกินคะแนนเต็มของวิชา (${fmt1(cur.total)}) ตรวจช่อง "คิดเป็น" อีกที`, 'error', 5000);
  const item = { id: editingScoreId || uid(), name: name.slice(0, 60), got, max, worth };
  const items = editingScoreId ? cur.items.map((it) => (it.id === editingScoreId ? item : it)) : [...cur.items, item];
  scores = { ...scores, [k]: { ...cur, items } };
  setStorage(KEYS.scores, scores);
  resetScoreForm();
  renderSubjectSheet();
}

function editScore(id) {
  const sched = schedules.find((x) => x.id === currentSheetId);
  const it = sched && (scores[subjectKey(sched.name)] || { items: [] }).items.find((x) => x.id === id);
  if (!it) return;
  editingScoreId = id;
  $('score-name').value = it.name;
  $('score-got').value = it.got;
  $('score-max').value = it.max;
  $('score-worth').value = it.worth;
  $('score-save-btn').textContent = 'บันทึกการแก้ไข';
  $('score-cancel-btn').classList.remove('hidden');
}

function deleteEditingScore() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched || !editingScoreId) return;
  const k = subjectKey(sched.name);
  const cur = scores[k];
  if (!cur || !confirm('ลบคะแนนรายการนี้ใช่ไหม?')) return;
  scores = { ...scores, [k]: { ...cur, items: cur.items.filter((it) => it.id !== editingScoreId) } };
  setStorage(KEYS.scores, scores);
  resetScoreForm();
  renderSubjectSheet();
}

function saveScoreTotal() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  const k = subjectKey(sched.name);
  const cur = scores[k] || { total: 100, items: [] };
  const total = clamp(parseFloat($('score-total').value) || 100, 1, 1000);
  scores = { ...scores, [k]: { ...cur, total } };
  setStorage(KEYS.scores, scores);
  renderSubjectSheet();
}

// ใส่เกรดที่คาดลงในตารางคำนวณ GPA (หน้าเกรด)
function useProjectedGrade() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  const sm = scoreSummary(sched.name);
  if (sm.projected === null) return;
  const grade = gradeFor(sm.projected);
  const gp = grade === 'F' ? 'F' : grade;
  const k = subjectKey(sched.name);
  const row = gpaRows.find((r) => subjectKey(r.name) === k);
  if (row) row.grade = gp;
  else gpaRows.push({ name: sched.name, credits: 3, grade: gp });
  setStorage(KEYS.gpaRows, gpaRows);
  renderGpaRows();
  toast(`ใส่เกรด ${gp} ของวิชานี้ในหน้าคำนวณเกรดแล้ว`, 'success');
}

function editCurrentSchedule() {
  const id = currentSheetId;
  saveSubjectInfoNow();
  closeModal('subject-modal');
  openScheduleModal(id);
}

// =====================================================================
// สรุปสัปดาห์นี้ (หน้า "วันนี้")
// =====================================================================
function weekSummary() {
  const start = mondayOf(todayStr());
  const inWeek = (d) => d >= start && d <= todayStr();
  let minutes = 0;
  Object.entries(studyLog).forEach(([d, subj]) => { if (inWeek(d)) minutes += Object.values(subj).reduce((a, b) => a + b, 0); });
  const done = tasks.filter((t) => t.status === 'done' && t.doneAt && inWeek(t.doneAt)).length;
  let missed = 0;
  Object.values(attendance).forEach((days) => Object.entries(days).forEach(([d, st]) => { if (inWeek(d) && (st === 'absent' || st === 'leave')) missed++; }));
  const due7 = tasks.filter((t) => t.status !== 'done' && daysUntil(t.due) !== null && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7).length;
  const exams7 = exams.filter((e) => daysUntil(e.date) >= 0 && daysUntil(e.date) <= 7).length;
  return { minutes, done, missed, due7, exams7 };
}

function renderWeekCard() {
  setTimeout(() => runCountUps($('today-week')), 0);
  const w = weekSummary();
  const tile = (v, l, n, fmt, unit = '') => `<div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center"><div class="text-lg font-bold heading leading-tight"><span data-count="${n}" data-count-key="week-${l}" data-count-fmt="${fmt}">${v}</span>${unit}</div><div class="text-[11px] muted mt-0.5">${l}</div></div>`;
  $('today-week').innerHTML = `
    <div class="grid grid-cols-3 gap-2">${tile(formatDuration(w.minutes), 'อ่านสัปดาห์นี้', w.minutes, 'dur')}${tile(w.done, 'งานที่เสร็จ', w.done, 'int', ' ชิ้น')}${tile(w.missed, 'ขาด/ลาเรียน', w.missed, 'int', ' ครั้ง')}</div>
    <p class="text-xs muted mt-3">7 วันข้างหน้า: งานต้องส่ง <b class="heading">${w.due7}</b> ชิ้น · สอบ <b class="heading">${w.exams7}</b> วิชา</p>`;
}

// =====================================================================
// โหมดในแท็บ "อ่าน": จับเวลา / แฟลชการ์ด / โน้ต
// =====================================================================
const STUDY_VIEWS = ['timer', 'cards', 'notes'];

function setStudyView(view, { quiet = false } = {}) {
  if (!STUDY_VIEWS.includes(view)) view = 'timer';
  STUDY_VIEWS.forEach((v) => $(`study-${v}`).classList.toggle('hidden', v !== view));
  document.querySelectorAll('[data-study]').forEach((b) => b.classList.toggle('active', b.dataset.study === view));
  setStorage(KEYS.studyView, view);
  if (view === 'cards') renderFlashcards();
  if (view === 'notes') renderNotesList();
  if (!quiet) animateIn($(`study-${view}`));
  refreshIcons();
}

// รายชื่อวิชาให้เลือก (จากตารางเรียน + ที่เคยใช้) และปุ่มแตะเลือก
function subjectOptions(extra = []) {
  const names = [...new Set([...schedules.map((x) => x.name), ...extra.filter((n) => !GENERIC_SUBJECTS.has(subjectKey(n)))])];
  names.sort((a, b) => a.localeCompare(b, 'th'));
  names.push('ทั่วไป');
  return names;
}

function subjectChipsHtml(options, current, handler) {
  const cur = subjectKey(current);
  return options.map((name, i) => {
    const on = subjectKey(name) === cur;
    return `<button type="button" onclick="${handler}(${i})" title="${escapeHtml(name)}"
      class="max-w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition ${on
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
      ${subjDot(name, subjectColors, false)}<span class="truncate">${escapeHtml(name)}</span></button>`;
  }).join('');
}

// =====================================================================
// แฟลชการ์ด + ทบทวนเป็นรอบ (Spaced Repetition แบบ SM-2 อย่างง่าย)
// =====================================================================
function sanitizeCards(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === 'object' && String(c.front || '').trim())
    .slice(0, 3000)
    .map((c) => ({
      id: toId(c.id),
      subject: String(c.subject || 'ทั่วไป').slice(0, 100),
      front: String(c.front).slice(0, 500),
      back: String(c.back || '').slice(0, 1000),
      due: DATE_RE.test(c.due) ? c.due : todayStr(),
      interval: clamp(Math.round(Number(c.interval)) || 0, 0, 365),
      ease: clamp(Number(c.ease) || 2.5, 1.3, 3.5),
      reps: clamp(Math.round(Number(c.reps)) || 0, 0, 1000),
      lapses: clamp(Math.round(Number(c.lapses)) || 0, 0, 1000),
    }));
}

function sanitizeFlashLog(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([d, n]) => { if (DATE_RE.test(d) && Number(n) > 0) out[d] = Math.round(Number(n)); });
  return out;
}

const dueCards = (subject = null) => cards
  .filter((c) => c.due <= todayStr() && (!subject || subjectKey(c.subject) === subjectKey(subject)))
  .sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);

// q: 0 = ลืม, 1 = ยาก, 2 = ได้, 3 = ง่าย
function nextSchedule(c, q) {
  let { interval, ease, reps, lapses } = c;
  if (q === 0) return { interval: 1, ease: Math.max(1.3, ease - 0.2), reps: 0, lapses: lapses + 1 };
  if (q === 1) { interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2)); ease = Math.max(1.3, ease - 0.15); }
  else if (q === 2) interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
  else { interval = reps === 0 ? 3 : reps === 1 ? 5 : Math.round(interval * ease * 1.3); ease = Math.min(3.5, ease + 0.15); }
  return { interval: clamp(interval, 1, 365), ease, reps: reps + 1, lapses };
}

const intervalLabel = (d) => (d < 30 ? `${d} วัน` : d < 365 ? `${Math.round(d / 30)} เดือน` : '1 ปี');

let deckSubjects = [];

function renderFlashcards() {
  if (!$('fc-decks')) return;
  const due = dueCards();
  countUp($('fc-due-total'), 'fc-due', due.length);
  const reviewedToday = flashLog[todayStr()] || 0;
  $('fc-due-sub').textContent = cards.length
    ? `มีการ์ดทั้งหมด ${cards.length} ใบ · ทบทวนไปแล้ววันนี้ ${reviewedToday} ใบ`
    : 'ยังไม่มีการ์ด กด "เพิ่มการ์ด" เพื่อเริ่ม';
  $('fc-start-all').classList.toggle('hidden', !due.length);
  deckSubjects = subjectOptions(cards.map((c) => c.subject)).filter((n) => cards.some((c) => subjectKey(c.subject) === subjectKey(n)) || schedules.some((x) => x.name === n));
  $('fc-decks').innerHTML = deckSubjects.map((name, i) => {
    const all = cards.filter((c) => subjectKey(c.subject) === subjectKey(name));
    const d = all.filter((c) => c.due <= todayStr()).length;
    return `
      <div class="flex items-center justify-between gap-2 py-2.5">
        <button onclick="openDeckIdx(${i})" class="min-w-0 text-left flex-1">
          <div class="text-sm font-medium heading truncate flex items-center gap-1.5">${subjDot(name, subjectColors, false)}${escapeHtml(name)}</div>
          <div class="text-xs muted">${all.length ? `${all.length} ใบ${d ? ` · <b class="text-indigo-600 dark:text-indigo-300">ต้องทบทวน ${d}</b>` : ' · ทบทวนครบแล้ว ✓'}` : 'ยังไม่มีการ์ด'}</div>
        </button>
        ${d ? `<button onclick="startReviewIdx(${i})" class="btn-primary !px-3 !py-1.5 text-xs">ทบทวน</button>` : `<button onclick="openCardEditorIdx(${i})" class="btn-secondary !px-3 !py-1.5 text-xs">+ การ์ด</button>`}
      </div>`;
  }).join('') || '<p class="text-sm muted py-2">เพิ่มวิชาในตารางเรียนก่อน หรือกด "เพิ่มการ์ด" แล้วเลือก "ทั่วไป"</p>';
  refreshIcons();
}

function renderTodayCards() {
  const box = $('today-cards-card');
  if (!box) return;
  box.classList.toggle('hidden', !cards.length);
  if (!cards.length) return;
  const d = dueCards().length;
  const done = flashLog[todayStr()] || 0;
  $('today-cards-text').textContent = d ? `วันนี้ต้องทบทวน ${d} ใบ${done ? ` (ทำไปแล้ว ${done} ใบ)` : ''}` : `ทบทวนครบแล้ววันนี้ ✅${done ? ` (${done} ใบ)` : ''}`;
  $('today-cards-btn').classList.toggle('hidden', !d);
}

// ---------- เพิ่ม/แก้การ์ด ----------
let cardSubject = 'ทั่วไป';
let cardSubjectOpts = [];
let editingCardId = null;
let cardMode = 'single';

function openCardEditor(subject = null, cardId = null) {
  const c = cardId ? cards.find((x) => x.id === cardId) : null;
  editingCardId = c ? c.id : null;
  cardSubject = c ? c.subject : subject || (schedules[0] ? schedules[0].name : 'ทั่วไป');
  $('card-modal-title').textContent = c ? 'แก้ไขแฟลชการ์ด' : 'เพิ่มแฟลชการ์ด';
  $('card-front').value = c ? c.front : '';
  $('card-back').value = c ? c.back : '';
  $('card-bulk-text').value = '';
  $('card-delete-btn').classList.toggle('hidden', !c);
  $('card-mode-tabs').classList.toggle('hidden', !!c);
  setCardMode('single');
  renderCardSubjectChips();
  openModal('card-modal');
}

const openCardEditorIdx = (i) => openCardEditor(deckSubjects[i]);

function renderCardSubjectChips() {
  cardSubjectOpts = subjectOptions(cards.map((c) => c.subject));
  $('card-subject-chips').innerHTML = subjectChipsHtml(cardSubjectOpts, cardSubject, 'pickCardSubject');
}

function pickCardSubject(i) {
  if (cardSubjectOpts[i] === undefined) return;
  cardSubject = cardSubjectOpts[i];
  renderCardSubjectChips();
}

function setCardMode(m) {
  cardMode = m === 'bulk' ? 'bulk' : 'single';
  $('card-single').classList.toggle('hidden', cardMode !== 'single');
  $('card-bulk').classList.toggle('hidden', cardMode !== 'bulk');
  document.querySelectorAll('[data-card-mode]').forEach((b) => b.classList.toggle('active', b.dataset.cardMode === cardMode));
}

function saveCard() {
  if (cardMode === 'bulk' && !editingCardId) {
    const lines = $('card-bulk-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((l) => l.split('::')).filter((p) => p.length >= 2 && p[0].trim());
    if (!parsed.length) return toast('ใส่บรรทัดละ 1 ใบ แบบ "หน้า :: หลัง"', 'error');
    parsed.forEach((p) => cards.push(sanitizeCards([{ id: uid(), subject: cardSubject, front: p[0].trim(), back: p.slice(1).join('::').trim() }])[0]));
    setStorage(KEYS.cards, cards);
    closeModal('card-modal');
    toast(`เพิ่มการ์ด ${parsed.length} ใบแล้ว${parsed.length < lines.length ? ` (ข้าม ${lines.length - parsed.length} บรรทัดที่ไม่มี ::)` : ''}`, 'success', 4000);
    renderFlashcards();
    renderToday();
    return;
  }
  const front = $('card-front').value.trim();
  const back = $('card-back').value.trim();
  if (!front) return toast('กรอกด้านหน้าของการ์ด', 'error');
  if (editingCardId) {
    cards = cards.map((c) => (c.id === editingCardId ? { ...c, subject: cardSubject, front: front.slice(0, 500), back: back.slice(0, 1000) } : c));
    setStorage(KEYS.cards, cards);
    closeModal('card-modal');
    toast('แก้ไขการ์ดแล้ว', 'success');
  } else {
    cards.push(sanitizeCards([{ id: uid(), subject: cardSubject, front, back }])[0]);
    setStorage(KEYS.cards, cards);
    // เพิ่มต่อได้เลย ไม่ต้องเปิดหน้าต่างใหม่
    $('card-front').value = '';
    $('card-back').value = '';
    $('card-front').focus();
    toast('เพิ่มการ์ดแล้ว เพิ่มใบต่อไปได้เลย', 'success', 1800);
  }
  renderFlashcards();
  renderToday();
  if (deckSubject) renderDeck();
}

function deleteEditingCard() {
  if (!editingCardId || !confirm('ลบการ์ดใบนี้ใช่ไหม?')) return;
  cards = cards.filter((c) => c.id !== editingCardId);
  setStorage(KEYS.cards, cards);
  closeModal('card-modal');
  renderFlashcards();
  renderToday();
  if (deckSubject) renderDeck();
}

// ---------- การ์ดทั้งหมดของวิชา ----------
let deckSubject = null;
let deckCardIds = [];

function openDeck(subject) {
  deckSubject = subject;
  renderDeck();
  openModal('deck-modal');
}

const openDeckIdx = (i) => openDeck(deckSubjects[i]);

function renderDeck() {
  if (!deckSubject) return;
  const list = cards.filter((c) => subjectKey(c.subject) === subjectKey(deckSubject)).sort((a, b) => a.due.localeCompare(b.due));
  deckCardIds = list.map((c) => c.id);
  $('deck-title').textContent = `${deckSubject} (${list.length} ใบ)`;
  $('deck-list').innerHTML = list.map((c) => {
    const n = daysUntil(c.due);
    const when = n <= 0 ? '<span class="text-indigo-600 dark:text-indigo-300 font-medium">ทบทวนวันนี้</span>' : `ทบทวนอีก ${n} วัน`;
    return `
      <button onclick="openCardEditor(null, ${c.id})" class="w-full text-left py-2.5">
        <div class="text-sm heading truncate">${escapeHtml(c.front)}</div>
        <div class="text-xs muted truncate">${escapeHtml(c.back) || '-'}</div>
        <div class="text-[11px] muted mt-0.5">${when}</div>
      </button>`;
  }).join('') || '<p class="text-sm muted py-2">ยังไม่มีการ์ดในวิชานี้</p>';
}

function addCardToDeck() {
  closeModal('deck-modal');
  openCardEditor(deckSubject);
}

// ---------- ทบทวน ----------
const review = { queue: [], idx: 0, total: 0, done: 0, flipped: false, requeued: new Set() };

function startReview(subject = null) {
  const list = dueCards(subject);
  if (!list.length) return toast('ไม่มีการ์ดต้องทบทวนตอนนี้ 🎉', 'success');
  review.queue = list.slice(0, 200).map((c) => c.id);
  review.idx = 0;
  review.total = review.queue.length;
  review.done = 0;
  review.flipped = false;
  review.requeued = new Set();
  renderReview();
  openModal('review-modal');
}

const startReviewIdx = (i) => startReview(deckSubjects[i]);

function renderReview() {
  const body = $('review-body');
  if (review.idx >= review.queue.length) {
    $('review-progress').textContent = 'เสร็จแล้ว!';
    $('review-bar').style.width = '100%';
    body.innerHTML = `
      <div class="text-center py-8 space-y-3">
        <div class="text-6xl grade-pop">🎉</div>
        <div class="text-lg font-bold heading">ทบทวนครบ ${review.total} ใบแล้ว</div>
        <p class="text-sm muted">แอปจะเรียกการ์ดแต่ละใบกลับมาให้ทบทวนในวันที่เหมาะสมเอง</p>
        <button onclick="endReview()" class="btn-primary w-full">เสร็จสิ้น</button>
      </div>`;
    confetti({ x: window.innerWidth / 2, y: window.innerHeight / 2, count: 28, spread: 1.4 });
    return;
  }
  const c = cards.find((x) => x.id === review.queue[review.idx]);
  if (!c) { review.idx++; return renderReview(); }
  $('review-progress').textContent = `ใบที่ ${review.done + 1} · เหลือ ${review.queue.length - review.idx} ใบ`;
  $('review-bar').style.width = `${Math.round((review.done / Math.max(review.total, review.queue.length)) * 100)}%`;
  const opts = [0, 1, 2, 3].map((q) => nextSchedule(c, q));
  const btn = (q, label, cls, sub) => `<button onclick="rateCard(${q})" class="flex-1 rounded-xl py-2.5 text-sm font-medium ${cls}"><div>${label}</div><div class="text-[10px] opacity-75">${sub}</div></button>`;
  body.innerHTML = `
    <div class="flip-card ${review.flipped ? 'flipped' : ''}" onclick="flipCard()">
      <div class="flip-inner">
        <div class="flip-face" ${subjectStyle(c.subject, subjectColors, false)}>
          <div class="text-[11px] muted flex items-center gap-1.5 mb-3">${subjDot(c.subject, subjectColors, false)}${escapeHtml(c.subject)}</div>
          <div class="text-xl font-semibold heading whitespace-pre-line break-words">${escapeHtml(c.front)}</div>
          <div class="text-xs muted mt-6">แตะเพื่อดูคำตอบ</div>
        </div>
        <div class="flip-face flip-back">
          <div class="text-xs muted mb-2 whitespace-pre-line break-words">${escapeHtml(c.front)}</div>
          <div class="text-lg heading whitespace-pre-line break-words">${escapeHtml(c.back) || '<span class="muted">(ไม่มีคำตอบ)</span>'}</div>
        </div>
      </div>
    </div>
    <div class="flex gap-2 mt-4 ${review.flipped ? '' : 'invisible'}">
      ${btn(0, 'ลืม', 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', 'อีกรอบ')}
      ${btn(1, 'ยาก', 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', intervalLabel(opts[1].interval))}
      ${btn(2, 'จำได้', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', intervalLabel(opts[2].interval))}
      ${btn(3, 'ง่าย', 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', intervalLabel(opts[3].interval))}
    </div>`;
}

function flipCard() {
  review.flipped = !review.flipped;
  const el = document.querySelector('#review-body .flip-card');
  if (el) el.classList.toggle('flipped', review.flipped);
  const row = document.querySelector('#review-body .flex.gap-2');
  if (row) row.classList.toggle('invisible', !review.flipped);
}

function rateCard(q) {
  const id = review.queue[review.idx];
  const c = cards.find((x) => x.id === id);
  if (!c || !review.flipped) return;
  const next = nextSchedule(c, q);
  const due = todayStr(next.interval);
  cards = cards.map((x) => (x.id === id ? { ...x, ...next, due } : x));
  flashLog = { ...flashLog, [todayStr()]: (flashLog[todayStr()] || 0) + 1 };
  setStorage(KEYS.cards, cards);
  setStorage(KEYS.flashLog, flashLog);
  floatEmoji(['😵', '😅', '👍', '😎'][q]);
  // ลืม: ให้กลับมาถามอีกครั้งท้ายรอบนี้ (ครั้งเดียว)
  if (q === 0 && !review.requeued.has(id)) {
    review.requeued.add(id);
    review.queue.push(id);
  }
  review.done++;
  review.idx++;
  review.flipped = false;
  renderReview();
}

function endReview() {
  closeModal('review-modal');
  renderFlashcards();
  renderToday();
  updateTimerUI();
}

// =====================================================================
// สมุดโน้ตรายวิชา (Markdown)
// =====================================================================
function sanitizeNotes(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => n && typeof n === 'object' && (String(n.title || '').trim() || String(n.body || '').trim()))
    .slice(0, 1000)
    .map((n) => ({
      id: toId(n.id),
      subject: String(n.subject || 'ทั่วไป').slice(0, 100),
      title: String(n.title || '').slice(0, 120),
      body: String(n.body || '').slice(0, 20000),
      updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt.slice(0, 40) : new Date().toISOString(),
    }));
}

// Markdown อย่างง่าย: หนีอักขระ HTML ทั้งหมดก่อน แล้วค่อยแปลงรูปแบบ (ปลอดภัยจากการแทรกโค้ด)
function renderMarkdown(src) {
  const inline = (t) => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = escapeHtml(src || '').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  let code = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (code !== null) {
      if (/^```/.test(line)) { out.push(`<pre><code>${code.join('\n')}</code></pre>`); code = null; } else code.push(raw);
      continue;
    }
    if (/^```/.test(line)) { flushPara(); closeList(); code = []; continue; }
    let m;
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); closeList(); out.push('<hr>'); continue; }
    if ((m = /^&gt;\s?(.*)$/.exec(line))) { flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line))) {
      flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li class="task ${m[1] === ' ' ? '' : 'done'}"><span class="cb">${m[1] === ' ' ? '☐' : '☑'}</span> ${inline(m[2])}</li>`);
      continue;
    }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    closeList();
    para.push(line);
  }
  if (code !== null) out.push(`<pre><code>${code.join('\n')}</code></pre>`);
  flushPara();
  closeList();
  return out.join('') || '<p class="muted">(ยังไม่มีเนื้อหา)</p>';
}

const plainPreview = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`~_\[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();

let notesFilter = '';
let notesFilterOpts = [];

function renderNotesList() {
  if (!$('notes-list')) return;
  notesFilterOpts = ['', ...subjectOptions(notes.map((n) => n.subject))];
  const cur = subjectKey(notesFilter);
  $('notes-filter').innerHTML = notesFilterOpts.map((name, i) => {
    const on = subjectKey(name) === cur;
    const count = name ? notes.filter((n) => subjectKey(n.subject) === subjectKey(name)).length : notes.length;
    if (name && !count && !schedules.some((x) => x.name === name)) return '';
    return `<button onclick="pickNotesFilter(${i})" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${on
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${name ? subjDot(name, subjectColors, false) : ''}<span class="truncate max-w-[10rem]">${escapeHtml(name ? name.split(' ')[0] : 'ทั้งหมด')}</span><span class="muted">${count}</span></button>`;
  }).join('');
  const q = ($('notes-search').value || '').trim().toLowerCase();
  const list = notes
    .filter((n) => !cur || subjectKey(n.subject) === cur)
    .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('notes-list').innerHTML = list.map((n) => `
    <button onclick="openNoteEditor(${n.id})" ${subjectStyle(n.subject, subjectColors, false)} class="subj subj-bar pressable card p-4 text-left space-y-1">
      <div class="font-semibold heading truncate">${escapeHtml(n.title || 'ไม่มีชื่อ')}</div>
      <div class="text-[11px] muted flex items-center gap-1.5"><span class="truncate">${escapeHtml(n.subject)}</span> · ${formatThaiDate(n.updatedAt.slice(0, 10))}</div>
      <div class="text-xs muted line-clamp-3">${escapeHtml(plainPreview(n.body).slice(0, 240))}</div>
    </button>`).join('') || `<p class="text-sm muted sm:col-span-2 py-6 text-center">${notes.length ? 'ไม่พบโน้ตที่ค้นหา' : 'ยังไม่มีโน้ต กด "โน้ตใหม่" เพื่อเริ่มจด ✍️'}</p>`;
}

function pickNotesFilter(i) {
  notesFilter = notesFilterOpts[i] || '';
  renderNotesList();
}

let currentNote = null;
let noteSubjectOpts = [];
let noteSaveTimer = null;

function openNoteEditor(id = null, subject = null) {
  const n = id ? notes.find((x) => x.id === id) : null;
  currentNote = n ? { ...n } : { id: uid(), subject: subject || notesFilter || (schedules[0] ? schedules[0].name : 'ทั่วไป'), title: '', body: '', updatedAt: '', isNew: true };
  $('note-title').value = currentNote.title;
  $('note-body').value = currentNote.body;
  $('note-status').textContent = n ? `แก้ไขล่าสุด ${formatThaiDate(n.updatedAt.slice(0, 10))}` : 'โน้ตใหม่';
  renderNoteSubjectChips();
  openModal('note-modal');
  setNoteMode(n && n.body ? 'view' : 'edit');
}

function renderNoteSubjectChips() {
  noteSubjectOpts = subjectOptions(notes.map((x) => x.subject));
  $('note-subject-chips').innerHTML = subjectChipsHtml(noteSubjectOpts, currentNote.subject, 'pickNoteSubject');
}

function pickNoteSubject(i) {
  if (!currentNote || noteSubjectOpts[i] === undefined) return;
  currentNote.subject = noteSubjectOpts[i];
  renderNoteSubjectChips();
  noteChanged();
}

function setNoteMode(m) {
  const view = m === 'view';
  $('note-body').classList.toggle('hidden', view);
  $('note-preview').classList.toggle('hidden', !view);
  $('note-toolbar').classList.toggle('invisible', view);
  document.querySelectorAll('[data-note-mode]').forEach((b) => b.classList.toggle('active', b.dataset.noteMode === m));
  if (view) $('note-preview').innerHTML = renderMarkdown($('note-body').value);
  else setTimeout(() => $('note-body').focus(), 50);
}

function noteChanged() {
  $('note-status').textContent = 'กำลังบันทึก...';
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveNoteNow, 600);
}

function saveNoteNow() {
  clearTimeout(noteSaveTimer);
  if (!currentNote) return;
  const title = $('note-title').value.slice(0, 120);
  const body = $('note-body').value.slice(0, 20000);
  if (currentNote.isNew && !title.trim() && !body.trim()) return;
  const saved = { id: currentNote.id, subject: currentNote.subject, title, body, updatedAt: new Date().toISOString() };
  const exists = notes.some((x) => x.id === saved.id);
  notes = exists ? notes.map((x) => (x.id === saved.id ? saved : x)) : [...notes, saved];
  currentNote = { ...saved };
  setStorage(KEYS.notes, notes);
  $('note-status').textContent = 'บันทึกแล้ว ✓';
}

function closeNoteEditor() {
  saveNoteNow();
  currentNote = null;
  closeModal('note-modal');
  renderNotesList();
  if (currentSheetId) renderSubjectSheet();
}

function deleteCurrentNote() {
  if (!currentNote) return;
  const exists = notes.some((x) => x.id === currentNote.id);
  if (exists && !confirm('ลบโน้ตนี้ใช่ไหม?')) return;
  notes = notes.filter((x) => x.id !== currentNote.id);
  setStorage(KEYS.notes, notes);
  currentNote = null;
  closeModal('note-modal');
  renderNotesList();
}

// ปุ่มช่วยเขียน Markdown
function mdInsert(before, after) {
  const ta = $('note-body');
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b) || 'ข้อความ';
  ta.value = value.slice(0, a) + before + sel + after + value.slice(b);
  ta.focus();
  ta.setSelectionRange(a + before.length, a + before.length + sel.length);
  noteChanged();
}

function mdLine(prefix) {
  const ta = $('note-body');
  const { selectionStart: a, value } = ta;
  const lineStart = value.lastIndexOf('\n', a - 1) + 1;
  ta.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  ta.focus();
  ta.setSelectionRange(a + prefix.length, a + prefix.length);
  noteChanged();
}

// จากหน้ารายละเอียดวิชา
function openSubjectNotes() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  saveSubjectInfoNow();
  closeModal('subject-modal');
  notesFilter = sched.name;
  switchTab('pomodoro');
  setStudyView('notes');
}

function openSubjectDeck() {
  const sched = schedules.find((x) => x.id === currentSheetId);
  if (!sched) return;
  saveSubjectInfoNow();
  closeModal('subject-modal');
  openDeck(sched.name);
}

// =====================================================================
// 0. TODAY (หน้า "วันนี้")
// =====================================================================
function renderToday() {
  const root = $('tab-today');
  if (!root || typeof studyLog === 'undefined' || typeof exams === 'undefined' || typeof gpaRows === 'undefined') return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hour = now.getHours();
  const [greet, emoji] = hour < 12 ? ['สวัสดีตอนเช้า', '☀️'] : hour < 17 ? ['สวัสดีตอนบ่าย', '🌤️'] : ['สวัสดีตอนเย็น', '🌙'];
  if ($('today-greeting').dataset.greet !== greet) {
    $('today-greeting').dataset.greet = greet;
    $('today-greeting').innerHTML = `${greet} <span class="wave-emoji">${emoji}</span>`;
  }
  $('today-date').textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // คาบเรียนวันนี้
  const classes = schedules.filter((s) => s.day === DAYS[todayIndex()]).sort(byStart);
  $('today-classes').innerHTML = classes.length ? classes.map((s) => {
    const st = toMinutes(s.start);
    const en = toMinutes(s.end);
    let badge = '';
    let faded = '';
    if (nowMin >= en) { badge = '<span class="text-[11px] muted">เรียนแล้ว</span>'; faded = 'opacity-60'; }
    else if (nowMin >= st) badge = `<span class="text-[11px] font-medium px-2 py-0.5 rounded-full ${DUE_BADGE.done}">กำลังเรียน</span>`;
    else if (st - nowMin <= 60) badge = `<span class="text-[11px] font-medium px-2 py-0.5 rounded-full ${DUE_BADGE.urgent}">อีก ${formatDuration(st - nowMin)}</span>`;
    const started = nowMin >= st;
    return `
      <div ${subjectStyle(s.name)} class="subj subj-bar py-2.5 pl-3 pr-1">
        <div class="flex items-center justify-between gap-3 ${faded}">
          <button onclick="openSubjectSheet(${s.id})" class="min-w-0 text-left">
            <div class="text-sm font-medium heading truncate">${escapeHtml(s.name)}</div>
            <div class="text-xs muted">${escapeHtml(s.start)} - ${escapeHtml(s.end)}${s.room ? ` · ${escapeHtml(s.room)}` : ''}</div>
          </button>
          <div class="flex items-center gap-1.5 shrink-0">
            ${badge}
            ${placeFor(s) && nowMin < en ? `<a href="${escapeHtml(directionsUrl(placeFor(s)))}" target="_blank" rel="noopener noreferrer" aria-label="นำทางไป ${escapeHtml(s.name)}" title="นำทาง"
              class="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/15"><i data-lucide="navigation" class="w-4 h-4"></i></a>` : ''}
          </div>
        </div>
        ${started ? `<div class="mt-2 flex items-center gap-1.5 flex-wrap">${attendanceButtonsHtml(s.id, todayStr())}${attendanceBadgeHtml(s)}</div>` : ''}
      </div>`;
  }).join('') : '<p class="text-sm muted py-2">วันนี้ไม่มีเรียน 🎉</p>';

  // งานที่ต้องรีบทำ (เลยกำหนด / ภายใน 3 วัน)
  const urgent = tasks.filter((t) => t.status !== 'done' && daysUntil(t.due) !== null && daysUntil(t.due) <= 3).sort(compareTasks);
  $('today-tasks').innerHTML = urgent.length ? urgent.map((t) => {
    const info = dueInfo(t);
    return `
      <div class="flex items-center gap-3 py-2">
        <button onclick="completeFromToday(this, ${t.id})" aria-label="ทำเสร็จแล้ว" title="ทำเสร็จแล้ว" class="today-check w-5 h-5 rounded-md border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 shrink-0"></button>
        <button onclick="openTaskModal(${t.id})" class="min-w-0 flex-1 text-left">
          <div class="text-sm font-medium heading truncate">${escapeHtml(t.title)}</div>
          <div class="text-xs muted flex items-center gap-1.5">${subjDot(t.subject)}<span class="truncate">${escapeHtml(t.subject)}</span>${t.notes ? '<i data-lucide="sticky-note" class="w-3 h-3 shrink-0"></i>' : ''}</div>
        </button>
        <span class="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${DUE_BADGE[info.level]}">${escapeHtml(info.text)}</span>
      </div>`;
  }).join('') : '<p class="text-sm muted py-2">ไม่มีงานเร่งด่วน 👍</p>';

  // วันสอบภายใน 30 วัน
  const soonExams = upcomingExams().filter((e) => daysUntil(e.date) <= 30);
  $('today-exams-card').classList.toggle('hidden', soonExams.length === 0);
  $('today-exams').innerHTML = soonExams.map((e) => {
    const n = daysUntil(e.date);
    return `
      <div class="flex items-center gap-3 py-2">
        <div class="w-12 text-center shrink-0">
          <div class="text-xl font-black leading-none ${n <= 3 ? 'text-rose-600 dark:text-rose-400 pulse-soft' : 'text-indigo-600 dark:text-indigo-300'}">${n === 0 ? '!' : n}</div>
          <div class="text-[10px] muted">${n === 0 ? 'วันนี้' : 'วัน'}</div>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-medium heading truncate flex items-center gap-1.5">${subjDot(findSubjectIn(e.name))}${escapeHtml(e.name)}</div>
          <div class="text-xs muted">${[formatThaiDate(e.date), e.time, e.room].filter(Boolean).map(escapeHtml).join(' · ')}</div>
        </div>
      </div>`;
  }).join('');

  // การอ่านวันนี้
  const mins = minutesOn(todayStr());
  const streak = studyStreak();
  $('today-study').innerHTML = `
    <div class="flex items-end gap-6">
      <div><div class="text-2xl font-bold heading" data-count="${mins}" data-count-key="today-mins" data-count-fmt="dur">${formatDuration(mins)}</div><div class="text-xs muted">อ่านวันนี้</div></div>
      <div><div class="text-2xl font-bold heading">${streak} วัน${streak >= 3 ? ' <span class="flame">🔥</span>' : ''}</div><div class="text-xs muted">อ่านติดต่อกัน</div></div>
    </div>`;
  runCountUps($('today-study'));
  renderTodayCards();
  renderWeekCard();
  $('today-focus-btn').textContent = isRunning ? 'ดูตัวจับเวลา' : 'เริ่มโฟกัส 25 นาที'.replace('25', String(pomo.focus));
}

function completeFromToday(btn, id) {
  if (reduceMotion.matches) return moveTask(id, 'done');
  btn.classList.add('checked');
  const row = btn.closest('div');
  if (row) row.classList.add('row-out');
  setTimeout(() => moveTask(id, 'done'), 380);
}

function startFocusFromToday() {
  switchTab('pomodoro');
  if (!isRunning) {
    if (mode !== 'focus') setMode('focus');
    toggleTimer();
  }
}

// ---------- ประวัติเกรดหลายเทอม ----------
let semesters = sanitizeSemesters(getStorage(KEYS.semesters, []));

function historyTotals() {
  const credits = semesters.reduce((a, x) => a + x.credits, 0);
  const points = semesters.reduce((a, x) => a + x.gpa * x.credits, 0);
  return { credits, gpax: credits > 0 ? points / credits : null };
}

function renderSemesters() {
  const { credits, gpax } = historyTotals();
  if (gpax === null) { $('gpax-result').textContent = '-'; delete countCache.gpax; } else countUp($('gpax-result'), 'gpax', gpax, 'dec2');
  $('gpax-credits').textContent = credits ? `รวม ${credits} หน่วยกิต จาก ${semesters.length} เทอม` : 'ยังไม่มีข้อมูล';
  $('semester-rows').innerHTML = semesters.length
    ? semesters.map((x) => `
      <tr>
        <td class="py-2 heading">${escapeHtml(x.name)}</td>
        <td class="py-2 text-right font-semibold heading">${x.gpa.toFixed(2)}</td>
        <td class="py-2 text-right muted">${x.credits}</td>
        <td class="py-2 text-right"><button onclick="deleteSemester(${x.id})" aria-label="ลบเทอม" class="text-slate-400 hover:text-rose-500 p-1">✕</button></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="py-4 text-center text-xs muted">ยังไม่มีประวัติ เพิ่มเทอมที่ผ่านมาทางขวา (หรือด้านล่างบนมือถือ)</td></tr>';
  $('semester-chart').innerHTML = semesters.length >= 2
    ? `<div class="text-xs muted mb-2">GPA แต่ละเทอม (เต็ม 4.00)</div>`
      + barChartHtml(semesters.map((x, i) => ({ label: x.name, value: x.gpa, highlight: i === semesters.length - 1 })), {
        max: 4,
        label: `GPA แต่ละเทอม: ${semesters.map((x) => `${x.name} ${x.gpa.toFixed(2)}`).join(', ')}`,
        format: (v) => v.toFixed(2),
      })
    : '';
}

function pushSemester(name, gpa, credits) {
  semesters.push({ id: uid(), name: name || `เทอม ${semesters.length + 1}`, gpa: clamp(gpa, 0, 4), credits });
  setStorage(KEYS.semesters, semesters);
  $('sem-name').value = '';
  $('sem-gpa').value = '';
  $('sem-credits').value = '';
  renderSemesters();
  toast('บันทึกเทอมแล้ว', 'success');
}

function addSemester() {
  const gpa = parseFloat($('sem-gpa').value);
  const credits = parseFloat($('sem-credits').value);
  if (!Number.isFinite(gpa) || gpa < 0 || gpa > 4) return toast('GPA ต้องอยู่ระหว่าง 0.00 - 4.00', 'error');
  if (!Number.isFinite(credits) || credits <= 0) return toast('กรุณากรอกหน่วยกิต', 'error');
  pushSemester($('sem-name').value.trim(), gpa, credits);
}

function addSemesterFromCalculator() {
  const credits = gpaRows.reduce((a, r) => a + r.credits, 0);
  if (!credits) return toast('ยังไม่มีวิชาในตารางคำนวณด้านบน', 'error');
  const gpa = gpaRows.reduce((a, r) => a + r.credits * GRADE_POINTS[r.grade], 0) / credits;
  pushSemester($('sem-name').value.trim(), Math.round(gpa * 100) / 100, credits);
}

function deleteSemester(id) {
  const x = semesters.find((s) => s.id === id);
  if (!x || !confirm(`ลบเทอม "${x.name}" ใช่ไหม?`)) return;
  semesters = semesters.filter((s) => s.id !== id);
  setStorage(KEYS.semesters, semesters);
  renderSemesters();
}

function useHistoryInSimulator() {
  const { credits, gpax } = historyTotals();
  if (gpax === null) return toast('ยังไม่มีประวัติเกรด', 'error');
  gpaSim.gpax = gpax.toFixed(2);
  gpaSim.credits = String(credits);
  setStorage(KEYS.gpaSim, gpaSim);
  fillGpaSim();
  calculateGPA();
  toast('ใส่ GPAX และหน่วยกิตสะสมใน Simulator แล้ว', 'success');
  $('sim-target-gpax').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =====================================================================
// Backup: export / import / clear
// =====================================================================
function collectData() {
  return { schedules, tasks, studyStats, studyLog, gpaRows, gpaSim, pomo, exams, semesters, reminders, calSettings, subjectColors, attendance, attendSettings, subjectInfo, scores, notes, cards, flashLog };
}

// แทนที่ข้อมูลทั้งหมดด้วยข้อมูลชุดใหม่ (จากไฟล์สำรองหรือจากคลาวด์) แล้ววาดหน้าจอใหม่
function applyData(d, { fromSync = false } = {}) {
  schedules = sanitizeSchedules(d.schedules);
  tasks = sanitizeTasks(d.tasks);
  studyStats = sanitizeStats(d.studyStats);
  gpaRows = sanitizeGpaRows(d.gpaRows);
  gpaSim = sanitizeGpaSim(d.gpaSim);
  pomo = sanitizePomo(d.pomo);
  studyLog = sanitizeStudyLog(d.studyLog);
  exams = sanitizeExams(d.exams);
  semesters = sanitizeSemesters(d.semesters);
  reminders = sanitizeReminders(d.reminders);
  calSettings = sanitizeCalendarSettings(d.calSettings);
  subjectColors = sanitizeSubjectColors(d.subjectColors);
  attendance = sanitizeAttendance(d.attendance);
  attendSettings = sanitizeAttendSettings(d.attendSettings);
  subjectInfo = sanitizeSubjectInfo(d.subjectInfo);
  scores = sanitizeScores(d.scores);
  notes = sanitizeNotes(d.notes);
  cards = sanitizeCards(d.cards);
  flashLog = sanitizeFlashLog(d.flashLog);
  suppressChangeHook = fromSync;
  try {
    saveAllData();
  } finally {
    suppressChangeHook = false;
  }
  renderAll();
}

function exportData() {
  const payload = {
    app: 'StudyFlow',
    version: 3,
    exportedAt: new Date().toISOString(),
    data: collectData(),
  };
  downloadFile(JSON.stringify(payload, null, 2), `studyflow-backup-${todayStr()}.json`, 'application/json');
  toast('ส่งออกไฟล์สำรองแล้ว', 'success');
}

function saveAllData() {
  setStorage(KEYS.schedules, schedules);
  setStorage(KEYS.tasks, tasks);
  setStorage(KEYS.stats, studyStats);
  setStorage(KEYS.gpaRows, gpaRows);
  setStorage(KEYS.gpaSim, gpaSim);
  setStorage(KEYS.pomo, pomo);
  setStorage(KEYS.studyLog, studyLog);
  setStorage(KEYS.exams, exams);
  setStorage(KEYS.semesters, semesters);
  setStorage(KEYS.reminders, reminders);
  setStorage(KEYS.calendar, calSettings);
  setStorage(KEYS.subjectColors, subjectColors);
  setStorage(KEYS.attendance, attendance);
  setStorage(KEYS.attendSettings, attendSettings);
  setStorage(KEYS.subjectInfo, subjectInfo);
  setStorage(KEYS.scores, scores);
  setStorage(KEYS.notes, notes);
  setStorage(KEYS.cards, cards);
  setStorage(KEYS.flashLog, flashLog);
}

async function importData(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.app !== 'StudyFlow' || typeof payload.data !== 'object' || !payload.data) {
      throw new Error('not a StudyFlow backup');
    }
    if (!confirm('ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลจากไฟล์นี้ ต้องการนำเข้าใช่ไหม?')) return;
    applyData(payload.data);
    closeModal('settings-modal');
    toast('นำเข้าข้อมูลเรียบร้อย', 'success');
  } catch (err) {
    console.warn(err);
    toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ StudyFlow หรือไฟล์เสียหาย', 'error', 4000);
  }
}

function clearAllData() {
  if (!confirm('ลบข้อมูลทั้งหมด (ตารางเรียน งาน สถิติ เกรด) ใช่ไหม? ถ้าล็อกอินซิงก์อยู่ ข้อมูลบนคลาวด์จะถูกล้างด้วย แนะนำให้ส่งออกไฟล์สำรองก่อน')) return;
  schedules = [];
  tasks = [];
  studyStats = {};
  gpaRows = [];
  gpaSim = sanitizeGpaSim({});
  pomo = sanitizePomo({});
  studyLog = {};
  exams = [];
  semesters = [];
  reminders = sanitizeReminders({});
  calSettings = sanitizeCalendarSettings({});
  subjectColors = {};
  attendance = {};
  attendSettings = sanitizeAttendSettings({});
  subjectInfo = {};
  scores = {};
  notes = [];
  cards = [];
  flashLog = {};
  saveAllData();
  renderAll();
  closeModal('settings-modal');
  toast('ล้างข้อมูลทั้งหมดแล้ว');
}

// =====================================================================
// PWA: install & service worker
// =====================================================================
let deferredInstallPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandalone()) $('install-btn').classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  $('install-btn').classList.add('hidden');
  toast('ติดตั้ง StudyFlow แล้ว 🎉', 'success');
});

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('install-btn').classList.add('hidden');
}

function renderInstallSection() {
  const standalone = isStandalone();
  $('install-hint').classList.toggle('hidden', standalone);
  $('installed-note').classList.toggle('hidden', !standalone);
  if (standalone) $('install-btn').classList.add('hidden');
}

// ---------- อัปเดตแอปอัตโนมัติ ----------
// เมื่อมี sw.js เวอร์ชันใหม่ (เปลี่ยนเลข CACHE) service worker ใหม่จะเข้ามาคุมหน้าเว็บ
// แล้วเราจะรีโหลดหน้าให้ แต่จะรอจนกว่าผู้ใช้ไม่ได้ทำอะไรค้างอยู่
let updatePending = false;

function isSafeToReload() {
  const el = document.activeElement;
  const typing = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  const modalOpen = !!document.querySelector('.modal.flex');
  const sharedViewOpen = !!document.getElementById('shared-view') && !document.getElementById('shared-view').classList.contains('hidden');
  return !isRunning && !typing && !modalOpen && !sharedViewOpen;
}

function reloadIfUpdatePending() {
  if (!updatePending || !isSafeToReload()) return;
  updatePending = false;
  try { sessionStorage.setItem('just_updated', '1'); } catch (e) { /* ignore */ }
  location.reload();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // ถ้าตอนเปิดหน้ายังไม่มี service worker คุมอยู่ (เปิดครั้งแรก) ไม่ต้องรีโหลด
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updatePending = true;
    reloadIfUpdatePending();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('ลงทะเบียน service worker ไม่สำเร็จ', err));
  });

  // ทุกครั้งที่กลับมาที่แอป: เช็กว่ามีเวอร์ชันใหม่ไหม
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
    reloadIfUpdatePending();
  });
  // ถ้ามีอัปเดตรออยู่ ลองใหม่ทุก ๆ 5 วินาที (เช่น หลังปิดหน้าต่างหรือหยุดจับเวลา)
  setInterval(reloadIfUpdatePending, 5000);

  try {
    if (sessionStorage.getItem('just_updated')) {
      sessionStorage.removeItem('just_updated');
      window.addEventListener('load', () => toast('อัปเดตแอปเป็นเวอร์ชันล่าสุดแล้ว ✨', 'success', 5000));
    }
  } catch (e) { /* ignore */ }
}

// =====================================================================
// Init
// =====================================================================
function renderAll() {
  renderFlashcards();
  renderNotesList();
  renderSchedule();
  renderExams();
  renderTasks();
  renderSemesters();
  fillReminderSettings();
  renderStudyStats();
  fillPomoSettings();
  if (!isRunning) setMode(mode);
  renderGpaRows();
  fillGpaSim();
  calculateGPA();
}

// เมื่อกลับมาที่แอป: อัปเดตเวลาจับเวลา และวาดใหม่ถ้าขึ้นวันใหม่แล้ว
function refreshTimeSensitive() {
  renderToday();
  if (todayIndex() !== renderedDayIndex) {
    renderSchedule();
    renderExams();
    renderTasks();
    renderStudySummary();
  } else {
    renderNextClass();
  }
  checkReminders();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (isRunning) tick();
  refreshTimeSensitive();
});

// ถ้าเกิดข้อผิดพลาด ให้แสดงบนจอ (แทนที่จะเป็นหน้าว่าง) จะได้แคปมาดูสาเหตุได้
function showFatalError(message) {
  const box = $('error-box');
  if (!box) return;
  box.classList.remove('hidden');
  const line = document.createElement('div');
  line.textContent = message;
  box.querySelector('.error-list').appendChild(line);
}

window.addEventListener('error', (e) => {
  showFatalError(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError(`Promise: ${e.reason && e.reason.message ? e.reason.message : e.reason}`);
});

// รันแต่ละขั้นแยกกัน ถ้าส่วนใดพัง ส่วนอื่นยังแสดงผลได้
function safe(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(err);
    showFatalError(`[${name}] ${err && err.message ? err.message : err}`);
  }
}

function init() {
  safe('days', () => { $('sched-day').innerHTML = DAYS.map((d) => `<option value="${d}">${d}</option>`).join(''); });
  safe('subject', () => { $('pomodoro-subject').value = getStorage(KEYS.pomoSubject, ''); });
  safe('theme', applyTheme);
  safe('schedule', renderSchedule);
  safe('exams', renderExams);
  safe('tasks', renderTasks);
  safe('semesters', renderSemesters);
  safe('reminders', fillReminderSettings);
  safe('stats', renderStudyStats);
  safe('study', () => setStudyView(getStorage(KEYS.studyView, 'timer'), { quiet: true }));
  safe('pomodoro', () => { fillPomoSettings(); setMode(mode); });
  safe('gpa', () => { renderGpaRows(); fillGpaSim(); calculateGPA(); });
  safe('simulator', () => { if (Object.values(gpaSim).every((v) => v !== '')) simulateTarget(); });
  safe('notify', renderNotifyStatus);
  safe('install', renderInstallSection);
  safe('tab', () => switchTab(getStorage(KEYS.tab, 'today')));
  safe('icons', refreshIcons);
  setTimeout(() => safe('reminders-check', checkReminders), 1500);
  setInterval(() => safe('refresh', refreshTimeSensitive), 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
