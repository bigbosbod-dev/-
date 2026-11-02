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

// ---------- Init ----------
function initSync() {
  onLocalDataChange = markLocalChanged;
  if (!window.supabase || !window.supabase.createClient) {
    renderSyncUI();
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
      setTimeout(() => syncNow(), 0);
    }
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
