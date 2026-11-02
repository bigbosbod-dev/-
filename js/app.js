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

function setStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`บันทึกข้อมูล "${key}" ไม่ได้`, err);
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
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

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
  setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
}

darkQuery.addEventListener?.('change', applyTheme);

// =====================================================================
// Tabs & modals
// =====================================================================
const TABS = ['schedule', 'kanban', 'pomodoro', 'gpa'];

function switchTab(tab) {
  if (!TABS.includes(tab)) tab = 'schedule';
  TABS.forEach((t) => $(`tab-${t}`).classList.toggle('hidden', t !== tab));
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  setStorage(KEYS.tab, tab);
  window.scrollTo({ top: 0 });
}

function openModal(id) {
  const el = $(id);
  el.classList.remove('hidden');
  el.classList.add('flex');
  refreshIcons();
}

function closeModal(id) {
  const el = $(id);
  el.classList.add('hidden');
  el.classList.remove('flex');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => closeModal(m.id));
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
  const today = todayIndex();
  renderedDayIndex = today;
  $('schedule-grid').innerHTML = DAYS.map((day, i) => {
    const items = schedules.filter((s) => s.day === day).sort(byStart);
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
          ${items.length ? items.map(scheduleCardHtml).join('') : '<p class="text-xs muted">ไม่มีเรียน</p>'}
        </div>
      </div>`;
  }).join('');
  renderNextClass();
  renderSubjectList();
  refreshIcons();
}

function scheduleCardHtml(item) {
  return `
    <div onclick="openScheduleModal(${item.id})" class="bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-3 rounded-xl relative group cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-400/50 transition">
      <button onclick="event.stopPropagation(); deleteSchedule(${item.id})" aria-label="ลบวิชา" class="absolute top-2 right-2 text-slate-400 hover:text-rose-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
      <div class="font-semibold text-xs text-indigo-950 dark:text-indigo-100 pr-5">${escapeHtml(item.name)}</div>
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

function renderNextClass() {
  const box = $('next-class');
  const next = getNextClass();
  if (!next) {
    box.innerHTML = `<div class="flex items-center gap-3"><i data-lucide="calendar-plus" class="w-6 h-6 shrink-0"></i>
      <div><div class="font-semibold">ยังไม่มีคาบเรียน</div><div class="text-sm text-indigo-100">กด "เพิ่มคาบเรียน" เพื่อเริ่มสร้างตารางเรียนของคุณ</div></div></div>`;
    refreshIcons();
    return;
  }
  const { s, status } = next;
  const room = s.room ? ` · ห้อง ${escapeHtml(s.room)}` : '';
  let label;
  let when;
  if (status === 'now') {
    label = 'กำลังเรียนอยู่';
    when = `เลิก ${escapeHtml(s.end)} (อีก ${formatDuration(next.minutes)})`;
  } else if (status === 'today') {
    label = 'คาบถัดไป · วันนี้';
    when = `เริ่ม ${escapeHtml(s.start)} (อีก ${formatDuration(next.minutes)})`;
  } else if (status === 'tomorrow') {
    label = 'คาบถัดไป · พรุ่งนี้';
    when = `${escapeHtml(s.start)} - ${escapeHtml(s.end)}`;
  } else {
    label = `คาบถัดไป · วัน${DAYS[next.dayIdx]}`;
    when = `${escapeHtml(s.start)} - ${escapeHtml(s.end)}`;
  }
  box.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="bg-white/15 p-2.5 rounded-xl shrink-0"><i data-lucide="${status === 'now' ? 'book-open' : 'bell'}" class="w-6 h-6"></i></div>
      <div class="min-w-0">
        <div class="text-xs tracking-wide text-indigo-100">${label}</div>
        <div class="font-semibold text-lg truncate">${escapeHtml(s.name)}</div>
        <div class="text-sm text-indigo-100">${when}${room}</div>
      </div>
    </div>`;
  refreshIcons();
}

function renderSubjectList() {
  const names = new Set([...schedules.map((s) => s.name), ...Object.keys(studyStats)]);
  $('subject-list').innerHTML = [...names].map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function openScheduleModal(id = null) {
  const item = id ? schedules.find((s) => s.id === id) : null;
  editingScheduleId = item ? item.id : null;
  $('schedule-modal-title').textContent = item ? 'แก้ไขคาบเรียน' : 'เพิ่มคาบเรียนใหม่';
  $('sched-name').value = item ? item.name : '';
  $('sched-day').value = item ? item.day : DAYS[todayIndex()];
  $('sched-room').value = item ? item.room : '';
  $('sched-start').value = item ? item.start : '09:00';
  $('sched-end').value = item ? item.end : '12:00';
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
}

function deleteSchedule(id) {
  const item = schedules.find((s) => s.id === id);
  if (!item || !confirm(`ลบวิชา "${item.name}" (วัน${item.day}) ใช่ไหม?`)) return;
  schedules = schedules.filter((s) => s.id !== id);
  setStorage(KEYS.schedules, schedules);
  renderSchedule();
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
      <div onclick="openTaskModal(${task.id})" class="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 ${DUE_BORDER[info.level] || ''} shadow-sm hover:shadow transition space-y-2 cursor-pointer ${task.status === 'done' ? 'opacity-70' : ''}">
        <div class="flex justify-between items-start gap-2">
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 truncate">${escapeHtml(task.subject)}</span>
          <button onclick="event.stopPropagation(); deleteTask(${task.id})" aria-label="ลบงาน" class="text-slate-400 hover:text-rose-500 shrink-0">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
        <div class="text-sm font-medium heading ${task.status === 'done' ? 'line-through' : ''}">${escapeHtml(task.title)}</div>
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
    $(`count-${s}`).textContent = count[s];
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
  refreshIcons();
}

function openTaskModal(id = null) {
  const task = id ? tasks.find((t) => t.id === id) : null;
  editingTaskId = task ? task.id : null;
  $('task-modal-title').textContent = task ? 'แก้ไขงาน' : 'เพิ่มการบ้าน / โครงงาน';
  $('task-title').value = task ? task.title : '';
  $('task-subject').value = task ? task.subject : '';
  $('task-due').value = task ? task.due : '';
  openModal('task-modal');
}

function saveTask() {
  const title = $('task-title').value.trim();
  const subject = $('task-subject').value.trim() || 'ทั่วไป';
  const due = $('task-due').value;
  if (!title) return toast('กรุณากรอกชื่องาน', 'error');

  if (editingTaskId) {
    tasks = tasks.map((t) => (t.id === editingTaskId ? { ...t, title, subject, due } : t));
    toast('แก้ไขงานแล้ว', 'success');
  } else {
    tasks.push({ id: uid(), title, subject, due, status: 'todo' });
    toast('เพิ่มงานแล้ว', 'success');
  }
  setStorage(KEYS.tasks, tasks);
  closeModal('task-modal');
  renderTasks();
}

function moveTask(id, nextStatus) {
  if (!STATUSES.includes(nextStatus)) return;
  tasks = tasks.map((t) => (t.id === id ? { ...t, status: nextStatus } : t));
  setStorage(KEYS.tasks, tasks);
  renderTasks();
  if (nextStatus === 'done') toast('เยี่ยม! ทำงานเสร็จไปอีกหนึ่งชิ้น 🎉', 'success');
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
let mode = 'focus';
let totalTime = pomo.focus * 60;
let timeLeft = totalTime;
let endAt = 0;
let timerInterval = null;
let isRunning = false;
let focusCount = 0;
let audioCtx = null;

function updateTimerUI() {
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
  renderStudyStats();
  renderSubjectList();
  return subject;
}

function renderStudyStats() {
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
        <span class="text-slate-700 dark:text-slate-200 font-medium truncate pr-2">${escapeHtml(k)}</span>
        <span class="text-indigo-600 dark:text-indigo-300 font-semibold whitespace-nowrap">${formatDuration(v)}</span>
      </div>
      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div class="h-full rounded-full bg-indigo-500" style="width:${Math.max(4, (v / max) * 100)}%"></div>
      </div>
    </div>`).join('') + `<p class="text-xs muted pt-2 border-t border-slate-100 dark:border-slate-800">รวมทั้งหมด ${formatDuration(total)}</p>`;
}

function clearStudyStats() {
  if (!Object.keys(studyStats).length || !confirm('ล้างสถิติเวลาอ่านทั้งหมดใช่ไหม?')) return;
  studyStats = {};
  setStorage(KEYS.stats, studyStats);
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
  $('gpa-result').textContent = gpa.toFixed(2);
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
// Backup: export / import / clear
// =====================================================================
function exportData() {
  const payload = {
    app: 'StudyFlow',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { schedules, tasks, studyStats, gpaRows, gpaSim, pomo },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studyflow-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('ส่งออกไฟล์สำรองแล้ว', 'success');
}

function saveAllData() {
  setStorage(KEYS.schedules, schedules);
  setStorage(KEYS.tasks, tasks);
  setStorage(KEYS.stats, studyStats);
  setStorage(KEYS.gpaRows, gpaRows);
  setStorage(KEYS.gpaSim, gpaSim);
  setStorage(KEYS.pomo, pomo);
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
    const d = payload.data;
    schedules = sanitizeSchedules(d.schedules);
    tasks = sanitizeTasks(d.tasks);
    studyStats = sanitizeStats(d.studyStats);
    gpaRows = sanitizeGpaRows(d.gpaRows);
    gpaSim = sanitizeGpaSim(d.gpaSim);
    pomo = sanitizePomo(d.pomo);
    saveAllData();
    renderAll();
    closeModal('settings-modal');
    toast('นำเข้าข้อมูลเรียบร้อย', 'success');
  } catch (err) {
    console.warn(err);
    toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ StudyFlow หรือไฟล์เสียหาย', 'error', 4000);
  }
}

function clearAllData() {
  if (!confirm('ลบข้อมูลทั้งหมด (ตารางเรียน งาน สถิติ เกรด) ใช่ไหม? แนะนำให้ส่งออกไฟล์สำรองก่อน')) return;
  schedules = [];
  tasks = [];
  studyStats = {};
  gpaRows = [];
  gpaSim = sanitizeGpaSim({});
  pomo = sanitizePomo({});
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
  $('install-btn').classList.remove('hidden');
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
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('ลงทะเบียน service worker ไม่สำเร็จ', err));
  });
}

// =====================================================================
// Init
// =====================================================================
function renderAll() {
  renderSchedule();
  renderTasks();
  renderStudyStats();
  fillPomoSettings();
  if (!isRunning) setMode(mode);
  renderGpaRows();
  fillGpaSim();
  calculateGPA();
}

// เมื่อกลับมาที่แอป: อัปเดตเวลาจับเวลา และวาดใหม่ถ้าขึ้นวันใหม่แล้ว
function refreshTimeSensitive() {
  if (todayIndex() !== renderedDayIndex) {
    renderSchedule();
    renderTasks();
  } else {
    renderNextClass();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (isRunning) tick();
  refreshTimeSensitive();
});

function init() {
  $('sched-day').innerHTML = DAYS.map((d) => `<option value="${d}">${d}</option>`).join('');
  $('pomodoro-subject').value = getStorage(KEYS.pomoSubject, '');
  applyTheme();
  renderAll();
  if (Object.values(gpaSim).every((v) => v !== '')) simulateTarget();
  renderNotifyStatus();
  renderInstallSection();
  switchTab(getStorage(KEYS.tab, 'schedule'));
  refreshIcons();
  setInterval(refreshTimeSensitive, 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
