<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Study & Schedule Organizer</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
    body {
      font-family: 'Prompt', sans-serif;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">

  <!-- Navigation Bar -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="bg-indigo-600 text-white p-2 rounded-xl shadow-md">
          <i data-lucide="graduation-cap" class="w-6 h-6"></i>
        </div>
        <span class="font-bold text-xl tracking-tight text-indigo-950">StudyFlow</span>
      </div>
      <nav class="flex gap-1 sm:gap-2">
        <button onclick="switchTab('schedule')" id="tab-btn-schedule" class="tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-indigo-600 bg-indigo-50">
          ตารางเรียน
        </button>
        <button onclick="switchTab('kanban')" id="tab-btn-kanban" class="tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 hover:text-slate-900">
          งาน & โปรเจกต์
        </button>
        <button onclick="switchTab('pomodoro')" id="tab-btn-pomodoro" class="tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 hover:text-slate-900">
          จับเวลา Pomodoro
        </button>
        <button onclick="switchTab('gpa')" id="tab-btn-gpa" class="tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 hover:text-slate-900">
          คำนวณเกรด (GPA)
        </button>
      </nav>
    </div>
  </header>

  <!-- Main Content Container -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">

    <!-- 1. SCHEDULE SECTION -->
    <section id="tab-schedule" class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">ตารางเรียนและห้องเรียน</h2>
          <p class="text-sm text-slate-500">บันทึกวิชาเรียน ห้องเรียน และตรวจสอบคาบเรียนถัดไป</p>
        </div>
        <button onclick="openModal('schedule-modal')" class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition">
          <i data-lucide="plus" class="w-4 h-4"></i> เพิ่มคาบเรียน
        </button>
      </div>

      <!-- Schedule Table / Grid -->
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4" id="schedule-grid">
        <!-- วันจันทร์ - ศุกร์ จะถูก render ด้วย JS -->
      </div>
    </section>

    <!-- 2. KANBAN BOARD SECTION -->
    <section id="tab-kanban" class="hidden space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">ติดตามงานและการบ้าน (Kanban)</h2>
          <p class="text-sm text-slate-500">ลากหรือคลิกเปลี่ยนสถานะเพื่อจัดการโปรเจกต์</p>
        </div>
        <button onclick="openModal('task-modal')" class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition">
          <i data-lucide="plus" class="w-4 h-4"></i> มอบหมายงานใหม่
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- To Do -->
        <div class="bg-slate-100/70 p-4 rounded-2xl border border-slate-200/80">
          <div class="flex items-center justify-between mb-4">
            <span class="font-semibold text-slate-700 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> ยังไม่เริ่ม (To Do)
            </span>
            <span id="count-todo" class="text-xs bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">0</span>
          </div>
          <div id="col-todo" class="space-y-3 min-h-[250px]"></div>
        </div>

        <!-- In Progress -->
        <div class="bg-slate-100/70 p-4 rounded-2xl border border-slate-200/80">
          <div class="flex items-center justify-between mb-4">
            <span class="font-semibold text-slate-700 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> กำลังทำ (In Progress)
            </span>
            <span id="count-progress" class="text-xs bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">0</span>
          </div>
          <div id="col-progress" class="space-y-3 min-h-[250px]"></div>
        </div>

        <!-- Done -->
        <div class="bg-slate-100/70 p-4 rounded-2xl border border-slate-200/80">
          <div class="flex items-center justify-between mb-4">
            <span class="font-semibold text-slate-700 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> เสร็จแล้ว (Done)
            </span>
            <span id="count-done" class="text-xs bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">0</span>
          </div>
          <div id="col-done" class="space-y-3 min-h-[250px]"></div>
        </div>
      </div>
    </section>

    <!-- 3. POMODORO SECTION -->
    <section id="tab-pomodoro" class="hidden space-y-6">
      <div class="max-w-xl mx-auto bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
        <h2 class="text-2xl font-bold text-slate-900 mb-1">Pomodoro Focus Timer</h2>
        <p class="text-sm text-slate-500 mb-6">ตั้งสมาธิกับการอ่านหนังสือเป็นรอบเวลา</p>

        <div class="mb-6 flex justify-center gap-3">
          <input type="text" id="pomodoro-subject" placeholder="ระบุวิชาที่กำลังอ่าน เช่น Data Structure" class="w-72 px-4 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <!-- Countdown Display -->
        <div class="py-8">
          <div id="timer-display" class="text-7xl font-mono font-bold tracking-tight text-slate-800">
            25:00
          </div>
          <p id="timer-status" class="text-sm font-medium text-indigo-600 mt-2">รอบโฟกัส (Focus Time)</p>
        </div>

        <!-- Timer Controls -->
        <div class="flex justify-center items-center gap-4">
          <button id="btn-toggle-timer" onclick="toggleTimer()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-semibold transition shadow-md">
            เริ่มจับเวลา
          </button>
          <button onclick="resetTimer()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-medium transition">
            รีเซ็ต
          </button>
        </div>
      </div>

      <!-- Time Log Stats -->
      <div class="max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 class="text-base font-semibold text-slate-800 mb-3">สถิติเวลาสะสมในแต่ละวิชา (นาที)</h3>
        <div id="study-stats-list" class="space-y-2 text-sm">
          <p class="text-slate-400">ยังไม่มีประวัติการจับเวลา</p>
        </div>
      </div>
    </section>

    <!-- 4. GPA CALCULATOR SECTION -->
    <section id="tab-gpa" class="hidden space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Input & Table -->
        <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-slate-900">คำนวณเกรดเทอมปัจจุบัน</h3>
            <button onclick="addGpaRow()" class="text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition">
              + เพิ่มวิชา
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b text-slate-500">
                  <th class="pb-2">ชื่อวิชา</th>
                  <th class="pb-2 w-24">หน่วยกิต</th>
                  <th class="pb-2 w-28">เกรดที่คาด</th>
                  <th class="pb-2 w-12"></th>
                </tr>
              </thead>
              <tbody id="gpa-rows" class="divide-y divide-slate-100">
                <!-- แถววิชาจะ render ที่นี่ -->
              </tbody>
            </table>
          </div>
          <button onclick="calculateGPA()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-medium transition">
            คำนวณ GPA ปัจจุบัน
          </button>
        </div>

        <!-- Simulator & Output -->
        <div class="space-y-6">
          <div class="bg-indigo-900 text-white p-6 rounded-2xl shadow-md">
            <span class="text-sm text-indigo-200">GPA เทอมนี้ที่คำนวณได้</span>
            <div id="gpa-result" class="text-5xl font-black mt-2">0.00</div>
            <p class="text-xs text-indigo-300 mt-2" id="gpa-total-credits">รวมทั้งหมด 0 หน่วยกิต</p>
          </div>

          <!-- Target Simulator -->
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h4 class="font-bold text-slate-800 text-base">GPA Simulator (เป้าหมาย)</h4>
            <div class="space-y-3 text-sm">
              <div>
                <label class="block text-slate-600 text-xs mb-1">GPAX สะสมเดิม</label>
                <input type="number" step="0.01" id="sim-current-gpax" placeholder="เช่น 3.20" class="w-full border border-slate-300 p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-slate-600 text-xs mb-1">หน่วยกิตสะสมเดิม</label>
                <input type="number" id="sim-current-credits" placeholder="เช่น 60" class="w-full border border-slate-300 p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-slate-600 text-xs mb-1">เป้าหมาย GPAX รวมที่ต้องการ</label>
                <input type="number" step="0.01" id="sim-target-gpax" placeholder="เช่น 3.50" class="w-full border border-slate-300 p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-slate-600 text-xs mb-1">หน่วยกิตที่จะลงในเทอมนี้</label>
                <input type="number" id="sim-term-credits" placeholder="เช่น 18" class="w-full border border-slate-300 p-2 rounded-lg text-sm" />
              </div>
              <button onclick="simulateTarget()" class="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-lg font-medium transition text-sm">
                วิเคราะห์เกรดที่ต้องทำได้
              </button>
              <div id="sim-result" class="p-3 bg-slate-50 rounded-xl text-slate-700 text-xs leading-relaxed border border-slate-200">
                ผลการประเมินจะแสดงที่นี่
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- MODAL: ADD SCHEDULE -->
  <div id="schedule-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center p-4 z-50">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
      <h3 class="text-lg font-bold text-slate-900">เพิ่มคาบเรียนใหม่</h3>
      <div class="space-y-3 text-sm">
        <div>
          <label class="block text-slate-600 text-xs mb-1">ชื่อวิชา / รหัสวิชา</label>
          <input type="text" id="sched-name" class="w-full border border-slate-300 p-2 rounded-lg" placeholder="เช่น Database Systems" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-slate-600 text-xs mb-1">วัน</label>
            <select id="sched-day" class="w-full border border-slate-300 p-2 rounded-lg">
              <option value="จันทร์">จันทร์</option>
              <option value="อังคาร">อังคาร</option>
              <option value="พุธ">พุธ</option>
              <option value="พฤหัสบดี">พฤหัสบดี</option>
              <option value="ศุกร์">ศุกร์</option>
            </select>
          </div>
          <div>
            <label class="block text-slate-600 text-xs mb-1">ห้องเรียน</label>
            <input type="text" id="sched-room" class="w-full border border-slate-300 p-2 rounded-lg" placeholder="เช่น Lab 402" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-slate-600 text-xs mb-1">เวลาเริ่ม</label>
            <input type="time" id="sched-start" class="w-full border border-slate-300 p-2 rounded-lg" value="09:00" />
          </div>
          <div>
            <label class="block text-slate-600 text-xs mb-1">เวลาเลิก</label>
            <input type="time" id="sched-end" class="w-full border border-slate-300 p-2 rounded-lg" value="12:00" />
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button onclick="closeModal('schedule-modal')" class="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100">ยกเลิก</button>
        <button onclick="saveSchedule()" class="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">บันทึก</button>
      </div>
    </div>
  </div>

  <!-- MODAL: ADD TASK -->
  <div id="task-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center p-4 z-50">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
      <h3 class="text-lg font-bold text-slate-900">เพิ่มการบ้าน / โครงงาน</h3>
      <div class="space-y-3 text-sm">
        <div>
          <label class="block text-slate-600 text-xs mb-1">ชื่องาน</label>
          <input type="text" id="task-title" class="w-full border border-slate-300 p-2 rounded-lg" placeholder="เช่น ทำสไลด์พรีเซนต์โปรเจกต์" />
        </div>
        <div>
          <label class="block text-slate-600 text-xs mb-1">วิชา</label>
          <input type="text" id="task-subject" class="w-full border border-slate-300 p-2 rounded-lg" placeholder="เช่น SE 101" />
        </div>
        <div>
          <label class="block text-slate-600 text-xs mb-1">กำหนดส่ง (Due Date)</label>
          <input type="date" id="task-due" class="w-full border border-slate-300 p-2 rounded-lg" />
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button onclick="closeModal('task-modal')" class="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100">ยกเลิก</button>
        <button onclick="saveTask()" class="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">เพิ่มงาน</button>
      </div>
    </div>
  </div>

  <script>
    // --- State Storage Helpers ---
    const getStorage = (key, fallback) => JSON.parse(localStorage.getItem(key)) || fallback;
    const setStorage = (key, data) => localStorage.setItem(key, JSON.stringify(data));

    // --- Tab Navigation ---
    function switchTab(tab) {
      ['schedule', 'kanban', 'pomodoro', 'gpa'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        const btn = document.getElementById(`tab-btn-${t}`);
        btn.className = 'tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 hover:text-slate-900';
      });
      document.getElementById(`tab-${tab}`).classList.remove('hidden');
      const activeBtn = document.getElementById(`tab-btn-${tab}`);
      activeBtn.className = 'tab-btn px-3.5 py-2 rounded-lg text-sm font-medium transition-all text-indigo-600 bg-indigo-50';
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
        col.className = 'bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 min-h-[300px]';
        col.innerHTML = `
          <div class="font-bold text-sm text-slate-700 pb-2 border-b flex justify-between">
            <span>วัน${day}</span>
            <span class="text-xs text-indigo-600">${dayClasses.length} วิชา</span>
          </div>
          <div class="space-y-2 flex-1">
            ${dayClasses.map(item => `
              <div class="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl relative group">
                <button onclick="deleteSchedule(${item.id})" class="absolute top-2 right-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                <div class="font-semibold text-xs text-indigo-950">${item.name}</div>
                <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i> ${item.start} - ${item.end}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <i data-lucide="map-pin" class="w-3 h-3 text-indigo-500"></i> ${item.room}
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
        count[task.status]++;
        const card = document.createElement('div');
        card.className = 'bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm hover:shadow transition space-y-2';
        card.innerHTML = `
          <div class="flex justify-between items-start">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${task.subject}</span>
            <button onclick="deleteTask(${task.id})" class="text-slate-400 hover:text-rose-500">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
          <div class="text-sm font-medium text-slate-800">${task.title}</div>
          <div class="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>ส่ง: ${task.due || 'ไม่ระบุ'}</span>
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
        timerInterval = setInterval(() => {
          if (timeLeft > 0) {
            timeLeft--;
            updateTimerDisplay();
          } else {
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
          <span class="text-slate-700 font-medium">${k}</span>
          <span class="text-indigo-600 font-semibold">${studyStats[k]} นาที</span>
        </div>
      `).join('');
    }

    // ================= 4. GPA CALCULATOR & SIMULATOR =================
    const GRADE_POINTS = { 'A': 4.0, 'B+': 3.5, 'B': 3.0, 'C+': 2.5, 'C': 2.0, 'D+': 1.5, 'D': 1.0, 'F': 0.0 };

    function addGpaRow(name = '', credits = 3, grade = 'A') {
      const tbody = document.getElementById('gpa-rows');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2"><input type="text" value="${name}" placeholder="ชื่อวิชา" class="w-full p-1.5 border rounded-lg text-sm gpa-name" /></td>
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

      if (requiredTermGPA > 4.0) {
        resultDiv.innerHTML = `<span class="text-rose-600 font-semibold">เป็นไปไม่ได้ในเทอมนี้:</span> ต้องได้เกรดเฉลี่ยเทอมนี้สูงถึง <b>${requiredTermGPA}</b> (เกิน 4.00) ลองปรับเป้าหมายหรือวางแผนระยะยาวเพิ่มขึ้นครับ`;
      } else if (requiredTermGPA <= 0) {
        resultDiv.innerHTML = `<span class="text-emerald-600 font-semibold">ทำได้สบายมาก:</span> เกรดเฉลี่ยเดิมสูงพออยู่แล้ว เทอมนี้เพียงแค่ประคองไม่ให้ติด F ก็ถึงเป้าหมาย`;
      } else {
        resultDiv.innerHTML = `คุณต้องทำเกรดเฉลี่ยในเทอมนี้ให้ได้อย่างน้อย <span class="text-indigo-600 font-bold text-sm">${requiredTermGPA}</span> เพื่อให้เกรดเฉลี่ยรวมถึงเป้า <b>${targetGpax}</b>`;
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
  </script>
</body>
</html>
