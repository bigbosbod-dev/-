'use strict';

// =====================================================================
// ซิงก์ข้อมูลข้ามเครื่องด้วย Supabase
// - ล็อกอินด้วยอีเมล + รหัสผ่าน (หรือขอลิงก์เข้าสู่ระบบทางอีเมล)
// - เก็บข้อมูลทั้งหมดเป็นก้อนเดียวต่อผู้ใช้ในตาราง user_data (ป้องกันด้วย RLS: เห็นเฉพาะของตัวเอง)
// - ข้อมูลที่แก้ล่าสุดเป็นฝ่ายชนะ ยกเว้นตอนเชื่อมเครื่องครั้งแรกที่จะถามก่อน
// =====================================================================
const SUPABASE_URL = 'https://tuubosxebiolhuqsqwoo.supabase.co';
// คีย์นี้เปิดเผยได้ (publishable) สิทธิ์จริงถูกคุมด้วย Row Level Security ในฐานข้อมูล
const SUPABASE_KEY = 'sb_publishable_GHiV2tay0IH086LSTWDu_A_S24EpB04';
const SYNC_META_KEY = 'sync_meta';

let sb = null;
let currentUser = null;
let syncTimer = null;
let syncing = false;
let syncQueued = false;
let lastSyncError = '';
let pendingEmail = '';
let shareId = '';

function getSyncMeta() {
  const m = getStorage(SYNC_META_KEY, {});
  return {
    userId: typeof m.userId === 'string' ? m.userId : '',
    remoteUpdatedAt: typeof m.remoteUpdatedAt === 'string' ? m.remoteUpdatedAt : '',
    localUpdatedAt: typeof m.localUpdatedAt === 'string' ? m.localUpdatedAt : '',
    dirty: m.dirty === true,
    lastSyncedAt: typeof m.lastSyncedAt === 'string' ? m.lastSyncedAt : '',
  };
}

function setSyncMeta(patch) {
  const next = { ...getSyncMeta(), ...patch };
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  return next;
}

function summarize(d) {
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  return `${n(d.schedules)} วิชา, ${n(d.tasks)} งาน, ${n(d.exams)} วันสอบ, ${n(d.semesters)} เทอม`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---------- UI ----------
function renderSyncUI() {
  const out = $('sync-signed-out');
  const inn = $('sync-signed-in');
  const unavailable = $('sync-unavailable');
  if (!out) return;
  unavailable.classList.toggle('hidden', !!sb);
  out.classList.toggle('hidden', !sb || !!currentUser);
  inn.classList.toggle('hidden', !sb || !currentUser);
  $('sync-code-step').classList.toggle('hidden', !pendingEmail);
  if (pendingEmail) $('sync-sent-to').textContent = pendingEmail;

  const meta = getSyncMeta();
  if (currentUser) {
    $('sync-email').textContent = currentUser.email || '';
    let status;
    if (syncing) status = '⏳ กำลังซิงก์...';
    else if (lastSyncError) status = `⚠️ ซิงก์ไม่สำเร็จ: ${lastSyncError}`;
    else if (meta.dirty) status = '⏳ มีการแก้ไขที่ยังไม่ได้อัปโหลด';
    else if (meta.lastSyncedAt) status = `✓ ซิงก์ล่าสุด ${formatTime(meta.lastSyncedAt)}`;
    else status = 'ยังไม่ได้ซิงก์';
    $('sync-status').textContent = status;
  }
  renderPushUI();
  document.querySelectorAll('.sync-dot').forEach((el) => {
    el.classList.toggle('hidden', !currentUser);
    el.classList.toggle('bg-emerald-500', !!currentUser && !lastSyncError && !meta.dirty);
    el.classList.toggle('bg-amber-500', !!currentUser && !lastSyncError && meta.dirty);
    el.classList.toggle('bg-rose-500', !!currentUser && !!lastSyncError);
  });
}

// ---------- Auth ----------
async function sendLoginEmail() {
  if (!sb) return;
  const email = $('sync-email-input').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('กรุณากรอกอีเมลให้ถูกต้อง', 'error');
  const btn = $('sync-send-btn');
  btn.disabled = true;
  try {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
    });
    if (error) throw error;
    pendingEmail = email;
    renderSyncUI();
    toast('ส่งลิงก์แล้ว เปิดอีเมลแล้วกดลิงก์เพื่อเข้าสู่ระบบ', 'success', 6000);
  } catch (err) {
    toast(`ส่งอีเมลไม่สำเร็จ: ${authErrorText(err)}`, 'error', 8000);
  } finally {
    btn.disabled = false;
  }
}

const AUTH_ERRORS = [
  [/invalid login credentials/i, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (ถ้ายังไม่เคยสมัคร ให้กด "สมัครใหม่")'],
  [/email not confirmed/i, 'ยังไม่ได้ยืนยันอีเมล กดลิงก์ในอีเมลยืนยันก่อน แล้วค่อยเข้าสู่ระบบ'],
  [/already registered|already been registered/i, 'อีเมลนี้สมัครไว้แล้ว กด "เข้าสู่ระบบ" ได้เลย'],
  [/password should be at least/i, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'],
  [/rate limit/i, 'ส่งอีเมลบ่อยเกินไป ระบบอีเมลฟรีส่งได้ประมาณ 2 ฉบับต่อชั่วโมง รอสักพักแล้วลองใหม่'],
];

function authErrorText(err) {
  const msg = String((err && err.message) || err);
  const hit = AUTH_ERRORS.find(([re]) => re.test(msg));
  return hit ? hit[1] : msg;
}

function readCredentials() {
  const email = $('sync-email-input').value.trim();
  const password = $('sync-password-input').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast('กรุณากรอกอีเมลให้ถูกต้อง', 'error'); return null; }
  if (password.length < 6) { toast('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร', 'error'); return null; }
  return { email, password };
}

async function withButton(id, fn) {
  const btn = $(id);
  if (btn) btn.disabled = true;
  try { await fn(); } finally { if (btn) btn.disabled = false; }
}

function signInWithPassword() {
  if (!sb) return;
  const cred = readCredentials();
  if (!cred) return;
  return withButton('sync-signin-btn', async () => {
    const { error } = await sb.auth.signInWithPassword(cred);
    if (error) return toast(authErrorText(error), 'error', 7000);
    $('sync-password-input').value = '';
  });
}

function signUpWithPassword() {
  if (!sb) return;
  const cred = readCredentials();
  if (!cred) return;
  return withButton('sync-signup-btn', async () => {
    const { data, error } = await sb.auth.signUp({ ...cred, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return toast(authErrorText(error), 'error', 7000);
    // Supabase ไม่บอกตรง ๆ ว่าอีเมลนี้เคยสมัครแล้ว (กันคนเดาอีเมล) แต่จะคืน identities ว่างมาแทน
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return toast('อีเมลนี้สมัครไว้แล้ว กด "เข้าสู่ระบบ" ได้เลย', 'error', 7000);
    }
    $('sync-password-input').value = '';
    if (!data.session) toast('สมัครแล้ว! เปิดอีเมลแล้วกดลิงก์ยืนยัน 1 ครั้ง จากนั้นกลับมากด "เข้าสู่ระบบ"', 'success', 10000);
  });
}

async function resetPassword() {
  if (!sb) return;
  const email = $('sync-email-input').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน" อีกครั้ง', 'error');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) return toast(authErrorText(error), 'error', 7000);
  toast('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว', 'success', 6000);
}

async function promptNewPassword() {
  const pwd = prompt('ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)');
  if (!pwd) return;
  if (pwd.length < 6) return toast('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร', 'error');
  const { error } = await sb.auth.updateUser({ password: pwd });
  if (error) return toast(authErrorText(error), 'error', 7000);
  toast('ตั้งรหัสผ่านใหม่แล้ว', 'success');
}

async function signOutSync() {
  if (!sb) return;
  if (!confirm('ออกจากระบบซิงก์ใช่ไหม? ข้อมูลในเครื่องนี้ยังอยู่ครบ')) return;
  if (getStorage(PUSH_FLAG, false) === true) await disablePush();
  await sb.auth.signOut();
  toast('ออกจากระบบแล้ว ข้อมูลในเครื่องยังอยู่');
}

// ---------- Sync ----------
function markLocalChanged() {
  setSyncMeta({ dirty: true, localUpdatedAt: new Date().toISOString() });
  if (!currentUser) return;
  renderSyncUI();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 1500);
}

async function pushData() {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('user_data')
    .upsert({ user_id: currentUser.id, data: collectData(), updated_at: now }, { onConflict: 'user_id' })
    .select('updated_at')
    .single();
  if (error) throw error;
  setSyncMeta({ userId: currentUser.id, remoteUpdatedAt: data.updated_at, dirty: false, lastSyncedAt: new Date().toISOString() });
  updateShareData();
}

function pullData(row) {
  // เก็บสำเนาข้อมูลเดิมไว้หนึ่งชุด เผื่อดึงข้อมูลผิดฝั่ง
  try { localStorage.setItem('pre_sync_backup', JSON.stringify({ savedAt: new Date().toISOString(), data: collectData() })); } catch (e) { /* ignore */ }
  applyData(row.data || {}, { fromSync: true });
  setSyncMeta({ userId: currentUser.id, remoteUpdatedAt: row.updated_at, dirty: false, lastSyncedAt: new Date().toISOString() });
}

async function syncNow({ manual = false } = {}) {
  if (!sb || !currentUser) return;
  if (!navigator.onLine) {
    lastSyncError = 'ไม่มีอินเทอร์เน็ต (จะซิงก์ให้เมื่อออนไลน์)';
    renderSyncUI();
    return;
  }
  if (syncing) {
    syncQueued = true;
    return;
  }
  syncing = true;
  lastSyncError = '';
  renderSyncUI();
  try {
    const { data: row, error } = await sb
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    const meta = getSyncMeta();
    const firstLink = meta.userId !== currentUser.id;

    if (!row) {
      await pushData();
      if (firstLink) toast('อัปโหลดข้อมูลขึ้นคลาวด์แล้ว เครื่องอื่นล็อกอินอีเมลเดียวกันเพื่อดึงข้อมูลได้เลย', 'success', 6000);
    } else if (firstLink) {
      // เชื่อมเครื่องนี้ครั้งแรก และบนคลาวด์มีข้อมูลอยู่แล้ว: ให้ผู้ใช้เลือก
      const useCloud = confirm(
        `พบข้อมูลบนคลาวด์ (อัปเดต ${formatTime(row.updated_at)})\n`
        + `☁️ คลาวด์: ${summarize(row.data || {})}\n`
        + `📱 เครื่องนี้: ${summarize(collectData())}\n\n`
        + 'กด "ตกลง" เพื่อใช้ข้อมูลบนคลาวด์ (แทนที่ข้อมูลในเครื่องนี้)\n'
        + 'กด "ยกเลิก" เพื่อใช้ข้อมูลในเครื่องนี้ (อัปโหลดทับข้อมูลบนคลาวด์)',
      );
      if (useCloud) {
        pullData(row);
        toast('ดึงข้อมูลจากคลาวด์แล้ว', 'success');
      } else {
        await pushData();
        toast('อัปโหลดข้อมูลเครื่องนี้ขึ้นคลาวด์แล้ว', 'success');
      }
    } else if (row.updated_at === meta.remoteUpdatedAt) {
      // บนคลาวด์ไม่เปลี่ยนตั้งแต่ซิงก์ครั้งก่อน
      if (meta.dirty) await pushData();
      else setSyncMeta({ lastSyncedAt: new Date().toISOString() });
    } else if (!meta.dirty) {
      pullData(row);
      if (manual) toast('อัปเดตข้อมูลจากเครื่องอื่นแล้ว', 'success');
    } else if (new Date(meta.localUpdatedAt) > new Date(row.updated_at)) {
      // แก้ทั้งสองฝั่ง: ฝั่งที่แก้ล่าสุดชนะ
      await pushData();
    } else {
      pullData(row);
      toast('มีข้อมูลใหม่กว่าจากเครื่องอื่น ใช้ข้อมูลนั้นแทนแล้ว');
    }
    // รูปห้องเรียนที่ยังไม่ได้อัปโหลด (เช่น ถ่ายไว้ตอนยังไม่ล็อกอิน หรือตอนออฟไลน์)
    if (typeof uploadPendingPhotos === 'function') uploadPendingPhotos();
    if (manual) toast('ซิงก์เรียบร้อย', 'success', 1500);
  } catch (err) {
    console.warn('sync failed', err);
    lastSyncError = err.message || String(err);
  } finally {
    syncing = false;
    renderSyncUI();
    if (syncQueued) {
      syncQueued = false;
      syncNow();
    }
  }
}

// ---------- แชร์ตารางเรียน (ดูอย่างเดียว) ----------
function shareUrl(id) {
  return `${location.origin}${location.pathname}?share=${id}`;
}

function shareData() {
  // แชร์เฉพาะตารางเรียน วันสอบที่ยังไม่ถึง และสีวิชา (ไม่รวมงาน เกรด สถิติ)
  return {
    schedules,
    exams: exams.filter((e) => daysUntil(e.date) >= 0),
    subjectColors,
  };
}

function randomShareId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

async function loadShareState() {
  shareId = '';
  if (!sb || !currentUser) return;
  const { data } = await sb.from('shared_schedules').select('id, owner_name').eq('user_id', currentUser.id).maybeSingle();
  if (data) {
    shareId = data.id;
    if ($('share-name')) $('share-name').value = data.owner_name;
  }
}

function renderShareModal() {
  $('share-need-login').classList.toggle('hidden', !!currentUser);
  $('share-off').classList.toggle('hidden', !currentUser || !!shareId);
  $('share-on').classList.toggle('hidden', !currentUser || !shareId);
  if (shareId) $('share-link').value = shareUrl(shareId);
  if (currentUser && !$('share-name').value) $('share-name').value = (currentUser.email || '').split('@')[0];
}

async function openShareModal() {
  renderShareModal();
  openModal('share-modal');
  if (currentUser) {
    await loadShareState();
    renderShareModal();
  }
}

async function createShare() {
  if (!sb || !currentUser) return;
  const ownerName = $('share-name').value.trim().slice(0, 50);
  const id = randomShareId();
  const btn = $('share-create-btn');
  btn.disabled = true;
  try {
    const { error } = await sb.from('shared_schedules').upsert(
      { id, user_id: currentUser.id, owner_name: ownerName, data: shareData(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
    shareId = id;
    renderShareModal();
    toast('สร้างลิงก์แล้ว ส่งให้เพื่อนได้เลย', 'success');
  } catch (err) {
    toast(`สร้างลิงก์ไม่สำเร็จ: ${err.message || err}`, 'error', 6000);
  } finally {
    btn.disabled = false;
  }
}

async function updateShareData() {
  if (!sb || !currentUser || !shareId) return;
  const { error } = await sb.from('shared_schedules')
    .update({ data: shareData(), updated_at: new Date().toISOString() })
    .eq('user_id', currentUser.id);
  if (error) console.warn('update share failed', error);
}

async function stopShare() {
  if (!sb || !currentUser || !shareId) return;
  if (!confirm('หยุดแชร์ใช่ไหม? ลิงก์ที่ส่งให้เพื่อนไปแล้วจะเปิดไม่ได้อีก')) return;
  const { error } = await sb.from('shared_schedules').delete().eq('user_id', currentUser.id);
  if (error) return toast(`หยุดแชร์ไม่สำเร็จ: ${error.message}`, 'error');
  shareId = '';
  renderShareModal();
  toast('หยุดแชร์แล้ว');
}

async function copyShareLink() {
  const link = shareUrl(shareId);
  try {
    await navigator.clipboard.writeText(link);
    toast('คัดลอกลิงก์แล้ว', 'success', 1500);
  } catch (e) {
    $('share-link').select();
    toast('กดค้างที่ลิงก์แล้วเลือกคัดลอก');
  }
}

async function nativeShareLink() {
  const link = shareUrl(shareId);
  if (navigator.share) {
    try { await navigator.share({ title: 'ตารางเรียนของฉัน', text: 'ดูตารางเรียนของฉันใน StudyFlow', url: link }); } catch (e) { /* ผู้ใช้ยกเลิก */ }
  } else {
    copyShareLink();
  }
}

// ---------- หน้าดูตารางที่เพื่อนแชร์มา ----------
async function openSharedView(id) {
  $('shared-view').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const body = $('shared-body');
  body.innerHTML = '<p class="muted text-sm">กำลังโหลดตารางเรียน...</p>';
  if (!sb) {
    body.innerHTML = '<p class="text-sm text-rose-500">โหลดไม่ได้ (ไม่มีอินเทอร์เน็ต) ลองใหม่อีกครั้งเมื่อออนไลน์</p>';
    return;
  }
  try {
    const { data, error } = await sb.rpc('get_shared_schedule', { share_id: id });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      body.innerHTML = '<p class="text-sm muted">ไม่พบตารางนี้ เจ้าของอาจหยุดแชร์ไปแล้ว</p>';
      return;
    }
    const list = sanitizeSchedules(row.data && row.data.schedules);
    const colors = sanitizeSubjectColors(row.data && row.data.subjectColors);
    const sharedExams = sanitizeExams(row.data && row.data.exams).filter((e) => daysUntil(e.date) >= 0).sort(compareExams);
    $('shared-title').textContent = row.owner_name ? `ตารางเรียนของ ${row.owner_name}` : 'ตารางเรียนที่แชร์มา';
    $('shared-updated').textContent = `อัปเดตล่าสุด ${formatTime(row.updated_at)}`;
    const examHtml = sharedExams.length ? `
      <div class="card p-5 mt-5">
        <h3 class="font-semibold heading mb-2">วันสอบ</h3>
        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          ${sharedExams.map((e) => `<div class="py-2 flex items-center justify-between gap-3">
            <div class="min-w-0"><div class="text-sm font-medium heading truncate flex items-center gap-1.5">${subjDot(findSubjectIn(e.name, list), colors, false)}${escapeHtml(e.name)}</div>
            <div class="text-xs muted">${[formatThaiDate(e.date), e.time, e.room].filter(Boolean).map(escapeHtml).join(' · ')}</div></div>
            <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">อีก ${daysUntil(e.date)} วัน</span></div>`).join('')}
        </div>
      </div>` : '';
    body.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">${scheduleGridHtml(list, { editable: false, colors })}</div>${examHtml}`;
    refreshIcons();
  } catch (err) {
    body.innerHTML = `<p class="text-sm text-rose-500">โหลดไม่สำเร็จ: ${escapeHtml(err.message || err)}</p>`;
  }
}

function closeSharedView() {
  $('shared-view').classList.add('hidden');
  document.body.style.overflow = '';
  history.replaceState(null, '', location.pathname);
}

// ---------- แจ้งเตือนแม้ปิดแอป (Web Push ผ่าน Supabase) ----------
const PUSH_FLAG = 'push_enabled';
let pushBusy = false;

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// ให้เซิร์ฟเวอร์ส่งแจ้งเตือนตอน Pomodoro หมดเวลา (ทำงานแม้ปิดจอ) ต้องล็อกอินและเปิดแจ้งเตือนแม้ปิดแอปไว้
window.timerPush = async (action, payload = {}) => {
  if (!sb || !currentUser || getStorage(PUSH_FLAG, false) !== true) return;
  try {
    await callPushFunction({ action: action === 'schedule' ? 'schedule-timer' : 'cancel-timer', ...payload });
  } catch (err) {
    console.warn('timer push', err);
  }
};

async function callPushFunction(body) {
  const { data, error } = await sb.functions.invoke('push-reminders', { body });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function renderPushUI() {
  const status = $('push-status');
  const actions = $('push-actions');
  if (!status) return;
  const btn = (label, fn, primary) => `<button onclick="${fn}" ${pushBusy ? 'disabled' : ''} class="${primary ? 'btn-primary' : 'btn-secondary'} text-sm !py-2">${label}</button>`;

  if (!pushSupported()) {
    status.innerHTML = isIOS()
      ? 'บน iPhone ต้อง<b>ติดตั้งเป็นแอปบนหน้าจอโฮม</b>ก่อน (Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม) แล้วเปิดจากไอคอนแอป'
      : 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบนี้ ลองใช้ Chrome, Edge หรือ Safari เวอร์ชันใหม่';
    actions.innerHTML = '';
    return;
  }
  if (!currentUser) {
    status.textContent = 'ต้องล็อกอินซิงก์ก่อน เพราะเซิร์ฟเวอร์ต้องรู้ตารางเรียนและงานของคุณถึงจะเตือนได้';
    actions.innerHTML = '';
    return;
  }
  if (Notification.permission === 'denied') {
    status.textContent = '🔕 การแจ้งเตือนถูกปิดไว้ เปิดได้ที่การตั้งค่าของเครื่อง → การแจ้งเตือน → StudyFlow';
    actions.innerHTML = '';
    return;
  }
  const sub = await currentPushSubscription();
  const on = !!sub && getStorage(PUSH_FLAG, false) === true;
  if (on) {
    status.textContent = '🔔 เปิดอยู่: เซิร์ฟเวอร์จะเตือนก่อนเข้าเรียน งานใกล้ส่ง และวันสอบ แม้ปิดแอป (ใช้การตั้งค่าเตือนด้านบน)';
    actions.innerHTML = btn('ส่งทดสอบ', 'testPush()', true) + btn('ปิด', 'disablePush()', false);
  } else {
    status.textContent = 'ให้เซิร์ฟเวอร์ส่งแจ้งเตือนมาที่เครื่องนี้ แม้ปิดแอปหรือล็อกจออยู่';
    actions.innerHTML = btn('เปิดการแจ้งเตือน', 'enablePush()', true);
  }
}

async function enablePush() {
  if (!sb || !currentUser || pushBusy) return;
  pushBusy = true;
  renderPushUI();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('ไม่ได้รับอนุญาตให้แจ้งเตือน');
    const { publicKey } = await callPushFunction({ action: 'public-key' });
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await callPushFunction({
      action: 'subscribe',
      subscription: sub.toJSON(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
    });
    try { localStorage.setItem(PUSH_FLAG, 'true'); } catch (e) { /* ignore */ }
    // ให้เซิร์ฟเวอร์มีข้อมูลล่าสุดไว้ใช้เตือน
    syncNow();
    toast('เปิดแจ้งเตือนแม้ปิดแอปแล้ว ลองกด "ส่งทดสอบ" ดูได้', 'success', 5000);
  } catch (err) {
    toast(`เปิดแจ้งเตือนไม่สำเร็จ: ${err.message || err}`, 'error', 7000);
  } finally {
    pushBusy = false;
    renderPushUI();
  }
}

async function disablePush() {
  if (pushBusy) return;
  pushBusy = true;
  try {
    const sub = await currentPushSubscription();
    if (sub) {
      if (sb && currentUser) await callPushFunction({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    try { localStorage.removeItem(PUSH_FLAG); } catch (e) { /* ignore */ }
    toast('ปิดแจ้งเตือนแม้ปิดแอปแล้ว (ยังเตือนในแอปขณะเปิดอยู่)');
  } finally {
    pushBusy = false;
    renderPushUI();
  }
}

async function testPush() {
  if (!sb || !currentUser) return;
  try {
    const r = await callPushFunction({ action: 'test' });
    if (!r.devices) toast('ยังไม่มีเครื่องที่เปิดแจ้งเตือนไว้', 'error');
    else if (!r.sent) toast('ส่งไม่สำเร็จ ลองกด "ปิด" แล้ว "เปิดการแจ้งเตือน" ใหม่', 'error', 6000);
    else toast(`ส่งแล้ว (${r.sent} เครื่อง) ถ้าเปิดแอปอยู่ อาจต้องปัดลงดูศูนย์แจ้งเตือน`, 'success', 6000);
  } catch (err) {
    toast(`ส่งทดสอบไม่สำเร็จ: ${err.message || err}`, 'error', 6000);
  }
}

// ---------- Init ----------
function initSync() {
  onLocalDataChange = markLocalChanged;
  if (!window.supabase || !window.supabase.createClient) {
    renderSyncUI();
    const sharedParam = new URLSearchParams(location.search).get('share');
    if (sharedParam) openSharedView(sharedParam);
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => promptNewPassword(), 300);
    const wasSignedIn = !!currentUser;
    currentUser = session ? session.user : null;
    renderSyncUI();
    // เรียก Supabase ต่อจากใน callback นี้ตรง ๆ ไม่ได้ (จะค้าง) จึงหน่วงไว้นิดหนึ่ง
    if (currentUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      if (event === 'SIGNED_IN' && !wasSignedIn) toast(`เข้าสู่ระบบแล้ว: ${currentUser.email}`, 'success');
      setTimeout(() => { syncNow(); loadShareState(); }, 0);
    }
    if (!currentUser) shareId = '';
    // ล้าง token ออกจาก URL หลังล็อกอินผ่านลิงก์
    if (event === 'SIGNED_IN' && location.hash.includes('access_token')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  });
  // ลิงก์ในอีเมลหมดอายุหรือใช้ไปแล้ว: Supabase จะส่ง error กลับมาใน URL
  if (location.hash.includes('error_description')) {
    const params = new URLSearchParams(location.hash.slice(1));
    toast(`เข้าสู่ระบบไม่สำเร็จ: ${params.get('error_description')} (ลองขอลิงก์ใหม่)`, 'error', 8000);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const sharedParam = new URLSearchParams(location.search).get('share');
  if (sharedParam && /^[A-Za-z0-9]{10,32}$/.test(sharedParam)) openSharedView(sharedParam);
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow();
  });
  renderSyncUI();
}

try {
  initSync();
} catch (err) {
  console.error(err);
  if (typeof showFatalError === 'function') showFatalError(`[sync] ${err.message || err}`);
}
