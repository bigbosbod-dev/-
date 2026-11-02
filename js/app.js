// --- State Storage Helpers ---
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

// --- Tab Navigation ---
function switchTab(tab) {
  ['schedule', 'kanban', 'pomodoro', 'gpa'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.add('hidden');
    const btn = document.getElementById(`tab-btn-${t}`);
    btn.className = 'tab-btn shrink-0 whitespace-nowrap px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 hover:text-slate-900';
  });
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  const activeBtn = document.getElementById(`tab-btn-${tab}`);
  activeBtn.className = 'tab-btn shrink-0 whitespace-nowrap px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-indigo-600 bg-indigo-50';
}

// Modal Control
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }

// ================= 1. SCHEDULE LOGIC =================
const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
let schedules = getStorage('schedules_data', [
  { id: 1, name: 'Computer Network', day: 'จันทร์', room: 'Lab 301', start: '09:00', end: '12:00' },
  { id: 2, name: 'Web Programming', day: 'พุธ', room: 'Lab 502', start: '13:00', end: '16:00' }
]);

function renderSchedule() {
  const container = document.getElementById('schedule-grid');
  container.innerHTML = '';

  DAYS.forEach(day => {
    const dayClasses = schedules.filter(s => s.day === day);
    const col = document.createElement('div');
    col.className = 'bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 md:min-h-[300px]';
    col.innerHTML = `
      <div class="font-bold text-sm text-slate-700 pb-2 border-b flex justify-between">
        <span>วัน${day}</span>
        <span class="text-xs text-indigo-600">${dayClasses.length} วิชา</span>
      </div>
      <div class="space-y-2 flex-1">
        ${dayClasses.map(item => `
          <div class="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl relative group">
            <button onclick="deleteSchedule(${item.id})" class="absolute top-2 right-2 text-slate-400 hover:text-rose-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
            <div class="font-semibold text-xs text-indigo-950">${escapeHtml(item.name)}</div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i> ${escapeHtml(item.start)} - ${escapeHtml(item.end)}
            </div>
            <div class="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i> ${escapeHtml(item.room)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(col);
  });
  lucide.createIcons();
}

function saveSchedule() {
  const name = document.getElementById('sched-name').value.trim();
  const day = document.getElementById('sched-day').value;
  const room = document.getElementById('sched-room').value.trim();
  const start = document.getElementById('sched-start').value;
  const end = document.getElementById('sched-end').value;

  if (!name || !room) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

  schedules.push({ id: Date.now(), name, day, room, start, end });
  setStorage('schedules_data', schedules);
  closeModal('schedule-modal');
  renderSchedule();
  document.getElementById('sched-name').value = '';
  document.getElementById('sched-room').value = '';
}

function deleteSchedule(id) {
  schedules = schedules.filter(s => s.id !== id);
  setStorage('schedules_data', schedules);
  renderSchedule();
}

// ================= 2. KANBAN LOGIC =================
let tasks = getStorage('tasks_data', [
  { id: 101, title: 'ส่งรายงานวิชา Network', subject: 'Network', due: '2026-10-01', status: 'todo' },
  { id: 102, title: 'ทำ Prototype หน้าเว็บ', subject: 'Web Dev', due: '2026-09-28', status: 'progress' }
]);

function renderTasks() {
  const cols = { todo: document.getElementById('col-todo'), progress: document.getElementById('col-progress'), done: document.getElementById('col-done') };
  cols.todo.innerHTML = '';
  cols.progress.innerHTML = '';
  cols.done.innerHTML = '';

  let count = { todo: 0, progress: 0, done: 0 };

  tasks.forEach(task => {
    if (!cols[task.status]) task.status = 'todo';
    count[task.status]++;
    const card = document.createElement('div');
    card.className = 'bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm hover:shadow transition space-y-2';
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${escapeHtml(task.subject)}</span>
        <button onclick="deleteTask(${task.id})" class="text-slate-400 hover:text-rose-500">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <div class="text-sm font-medium text-slate-800">${escapeHtml(task.title)}</div>
      <div class="text-[11px] text-slate-400 flex items-center justify-between pt-1">
        <span>ส่ง: ${escapeHtml(task.due || 'ไม่ระบุ')}</span>
        <div class="flex gap-1">
          ${task.status !== 'todo' ? `<button onclick="moveTask(${task.id}, 'todo')" class="p-1 hover:bg-slate-100 rounded text-slate-500 text-xs">◀</button>` : ''}
          ${task.status !== 'progress' ? `<button onclick="moveTask(${task.id}, 'progress')" class="p-1 hover:bg-slate-100 rounded text-slate-500 text-xs">⚡</button>` : ''}
          ${task.status !== 'done' ? `<button onclick="moveTask(${task.id}, 'done')" class="p-1 hover:bg-slate-100 rounded text-slate-500 text-xs">▶</button>` : ''}
        </div>
      </div>
    `;
    cols[task.status].appendChild(card);
  });

  document.getElementById('count-todo').innerText = count.todo;
  document.getElementById('count-progress').innerText = count.progress;
  document.getElementById('count-done').innerText = count.done;
  lucide.createIcons();
}

function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  const subject = document.getElementById('task-subject').value.trim();
  const due = document.getElementById('task-due').value;

  if (!title) return alert('กรุณากรอกชื่องาน');

  tasks.push({ id: Date.now(), title, subject: subject || 'ทั่วไป', due, status: 'todo' });
  setStorage('tasks_data', tasks);
  closeModal('task-modal');
  renderTasks();
  document.getElementById('task-title').value = '';
  document.getElementById('task-subject').value = '';
}

function moveTask(id, nextStatus) {
  tasks = tasks.map(t => t.id === id ? { ...t, status: nextStatus } : t);
  setStorage('tasks_data', tasks);
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  setStorage('tasks_data', tasks);
  renderTasks();
}

// ================= 3. POMODORO LOGIC =================
let timerInterval = null;
let timeLeft = 25 * 60;
let isRunning = false;
let studyStats = getStorage('study_stats', {});

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').innerText = `${mins}:${secs}`;
}

function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    document.getElementById('btn-toggle-timer').innerText = 'อ่านต่อ';
  } else {
    isRunning = true;
    document.getElementById('btn-toggle-timer').innerText = 'หยุดชั่วคราว';
    // อิงเวลาจริงแทนการนับทีละวินาที เพราะเบราว์เซอร์จะชะลอ timer เมื่อสลับไปแท็บอื่น
    const endAt = Date.now() + timeLeft * 1000;
    timerInterval = setInterval(() => {
      timeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        isRunning = false;
        alert('หมดเวลาโฟกัส! พักผ่อนสายตาสักครู่');
        logStudyTime();
        resetTimer();
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  timeLeft = 25 * 60;
  updateTimerDisplay();
  document.getElementById('btn-toggle-timer').innerText = 'เริ่มจับเวลา';
}

function logStudyTime() {
  const subject = document.getElementById('pomodoro-subject').value.trim() || 'วิชาทั่วไป';
  studyStats[subject] = (studyStats[subject] || 0) + 25;
  setStorage('study_stats', studyStats);
  renderStudyStats();
}

function renderStudyStats() {
  const container = document.getElementById('study-stats-list');
  const keys = Object.keys(studyStats);
  if (keys.length === 0) {
    container.innerHTML = '<p class="text-slate-400">ยังไม่มีประวัติการจับเวลา</p>';
    return;
  }
  container.innerHTML = keys.map(k => `
    <div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span class="text-slate-700 font-medium">${escapeHtml(k)}</span>
      <span class="text-indigo-600 font-semibold">${Number(studyStats[k]) || 0} นาที</span>
    </div>
  `).join('');
}

// ================= 4. GPA CALCULATOR & SIMULATOR =================
const GRADE_POINTS = { 'A': 4.0, 'B+': 3.5, 'B': 3.0, 'C+': 2.5, 'C': 2.0, 'D+': 1.5, 'D': 1.0, 'F': 0.0 };

function addGpaRow(name = '', credits = 3, grade = 'A') {
  const tbody = document.getElementById('gpa-rows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-2"><input type="text" value="${escapeHtml(name)}" placeholder="ชื่อวิชา" class="w-full p-1.5 border rounded-lg text-sm gpa-name" /></td>
    <td class="py-2"><input type="number" value="${credits}" min="1" max="6" class="w-20 p-1.5 border rounded-lg text-sm gpa-credit" /></td>
    <td class="py-2">
      <select class="w-24 p-1.5 border rounded-lg text-sm gpa-grade">
        ${Object.keys(GRADE_POINTS).map(g => `<option value="${g}" ${g === grade ? 'selected' : ''}>${g} (${GRADE_POINTS[g]})</option>`).join('')}
      </select>
    </td>
    <td class="py-2 text-right"><button onclick="this.closest('tr').remove()" class="text-slate-400 hover:text-rose-500">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function calculateGPA() {
  const rows = document.querySelectorAll('#gpa-rows tr');
  let totalPoints = 0;
  let totalCredits = 0;

  rows.forEach(r => {
    const credit = parseFloat(r.querySelector('.gpa-credit').value) || 0;
    const gradeStr = r.querySelector('.gpa-grade').value;
    const gradePoint = GRADE_POINTS[gradeStr];
    totalCredits += credit;
    totalPoints += credit * gradePoint;
  });

  const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
  document.getElementById('gpa-result').innerText = gpa;
  document.getElementById('gpa-total-credits').innerText = `รวมทั้งหมด ${totalCredits} หน่วยกิต`;
}

function simulateTarget() {
  const curGpax = parseFloat(document.getElementById('sim-current-gpax').value);
  const curCredits = parseFloat(document.getElementById('sim-current-credits').value);
  const targetGpax = parseFloat(document.getElementById('sim-target-gpax').value);
  const termCredits = parseFloat(document.getElementById('sim-term-credits').value);
  const resultDiv = document.getElementById('sim-result');

  if (isNaN(curGpax) || isNaN(curCredits) || isNaN(targetGpax) || isNaN(termCredits)) {
    resultDiv.innerHTML = '<span class="text-rose-500">กรุณากรอกข้อมูลตัวเลขให้ครบทุกช่อง</span>';
    return;
  }

  // Formula: Target GPAX = ( (Current GPAX * Current Credits) + (Term GPA * Term Credits) ) / (Current Credits + Term Credits)
  // Term GPA = ( Target GPAX * Total Credits - (Current GPAX * Current Credits) ) / Term Credits
  const totalCredits = curCredits + termCredits;
  const requiredTermPoints = (targetGpax * totalCredits) - (curGpax * curCredits);
  const requiredTermGPA = (requiredTermPoints / termCredits).toFixed(2);

  if (termCredits <= 0) {
    resultDiv.innerHTML = '<span class="text-rose-500">หน่วยกิตเทอมนี้ต้องมากกว่า 0</span>';
  } else if (Number(requiredTermGPA) > 4.0) {
    resultDiv.innerHTML = `<span class="text-rose-600 font-semibold">เป็นไปไม่ได้ในเทอมนี้:</span> ต้องได้เกรดเฉลี่ยเทอมนี้สูงถึง <b>${requiredTermGPA}</b> (เกิน 4.00) ลองปรับเป้าหมายหรือวางแผนระยะยาวเพิ่มขึ้นครับ`;
  } else if (Number(requiredTermGPA) <= 0) {
    resultDiv.innerHTML = `<span class="text-emerald-600 font-semibold">ทำได้สบายมาก:</span> เกรดเฉลี่ยเดิมสูงพออยู่แล้ว เทอมนี้เพียงแค่ประคองไม่ให้ติด F ก็ถึงเป้าหมาย`;
  } else {
    resultDiv.innerHTML = `คุณต้องทำเกรดเฉลี่ยในเทอมนี้ให้ได้อย่างน้อย <span class="text-indigo-600 font-bold text-sm">${requiredTermGPA}</span> เพื่อให้เกรดเฉลี่ยรวมถึงเป้า <b>${targetGpax.toFixed(2)}</b>`;
  }
}

// --- Init ---
window.onload = () => {
  renderSchedule();
  renderTasks();
  renderStudyStats();
  // Default 3 วิชาในตารางคำนวณเกรด
  addGpaRow('Data Structure', 3, 'A');
  addGpaRow('Algorithm Analysis', 3, 'B+');
  addGpaRow('English for Tech', 2, 'A');
  calculateGPA();
  lucide.createIcons();
};

// กด Esc เพื่อปิดหน้าต่าง popup
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ['schedule-modal', 'task-modal'].forEach(closeModal);
  }
});
