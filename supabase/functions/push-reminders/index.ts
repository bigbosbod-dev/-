// StudyFlow: แจ้งเตือนแบบเด้ง (Web Push) แม้ปิดแอป
//
// actions (POST JSON { action, ... }):
//   public-key   -> คืน VAPID public key ให้แอปใช้สมัครรับแจ้งเตือน (ไม่ต้องล็อกอิน)
//   subscribe    -> บันทึกอุปกรณ์ของผู้ใช้ที่ล็อกอิน { subscription, tz }
//   unsubscribe  -> ลบอุปกรณ์ { endpoint }
//   test         -> ส่งแจ้งเตือนทดสอบไปทุกอุปกรณ์ของผู้ใช้ที่ล็อกอิน
//   run          -> (pg_cron เรียกทุกนาที ต้องมี header x-cron-secret) เช็กแล้วส่งแจ้งเตือนที่ถึงเวลา
//   schedule-timer -> นัดแจ้งเตือนตอน Pomodoro หมดเวลา { fireAt, title, body } (1 นัดต่อผู้ใช้)
//   cancel-timer   -> ยกเลิกนัดของ Pomodoro
//   run-scheduled  -> (pg_cron เรียกทุก 10 วินาทีเมื่อมีนัดถึงเวลา ต้องมี x-cron-secret) ส่งแจ้งเตือนที่นัดไว้
//
// ข้อมูลตาราง/งาน/วันสอบอ่านจาก public.user_data (ข้อมูลที่แอปซิงก์ขึ้นมา)
import postgres from 'npm:postgres@3.4.4';
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ส่งได้เฉพาะบริการ push ของเบราว์เซอร์จริง (กันไม่ให้ถูกใช้ยิงไปเว็บอื่น)
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
function validEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

type Config = { subject: string; vapid_public: string; vapid_private: string; cron_secret: string };
let cachedConfig: Config | null = null;

async function getConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;
  let [cfg] = await sql<Config[]>`select * from private.push_config where id = 1`;
  if (!cfg.vapid_public) {
    const keys = webpush.generateVAPIDKeys();
    await sql`update private.push_config set vapid_public = ${keys.publicKey}, vapid_private = ${keys.privateKey}
              where id = 1 and vapid_public is null`;
    [cfg] = await sql<Config[]>`select * from private.push_config where id = 1`;
  }
  webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);
  cachedConfig = cfg;
  return cfg;
}

async function userFromRequest(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

type Sub = { endpoint: string; p256dh: string; auth: string };

async function sendTo(sub: Sub, payload: Record<string, unknown>) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high' },
    );
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // อุปกรณ์ยกเลิกการรับแจ้งเตือนแล้ว ลบทิ้ง
    if (status === 404 || status === 410) await sql`delete from private.push_subscriptions where endpoint = ${sub.endpoint}`;
    console.error('push failed', status, (e as { body?: string }).body);
    return { ok: false, status };
  }
}

// ---------- เวลาท้องถิ่นของผู้ใช้ ----------
const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minutes: hour * 60 + Number(parts.minute),
    dayIdx: WEEKDAYS.indexOf(parts.weekday),
  };
}

const toMinutes = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const daysBetween = (from: string, to: string) => {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
};
const TIME_RE = /^\d{2}:\d{2}$/;
const examTitle = (name: string) => (name.trim().startsWith('สอบ') ? name : `สอบ ${name}`);

type Reminder = { key: string; title: string; body: string };

// ตัดสินว่าตอนนี้ต้องเตือนอะไรบ้าง จากข้อมูลที่ผู้ใช้ซิงก์ไว้
// deno-lint-ignore no-explicit-any
function dueReminders(data: any, tz: string): Reminder[] {
  const now = localNow(tz);
  const out: Reminder[] = [];
  const rem = data?.reminders || {};
  const classEnabled = rem.classEnabled !== false;
  const classMinutes = [5, 10, 15, 30, 60].includes(Number(rem.classMinutes)) ? Number(rem.classMinutes) : 10;
  const taskEnabled = rem.taskEnabled !== false;
  const at = (v: unknown, d: string) => toMinutes(TIME_RE.test(String(v)) ? String(v) : d);
  const taskAt = at(rem.taskTime, '08:00');
  const examEveAt = at(rem.examEveTime, '19:00');
  const examDayAt = at(rem.examDayTime, '06:00');
  const weeklyAt = at(rem.weeklyTime, '19:00');
  const weeklyEnabled = rem.weeklyEnabled !== false;
  // ส่งได้ตั้งแต่เวลาที่ตั้งไว้ จนถึงอีก n ชั่วโมง (ไม่ข้ามเที่ยงคืน) เผื่อเซิร์ฟเวอร์พลาดรอบ
  const within = (start: number, hours: number) => now.minutes >= start && now.minutes < Math.min(start + hours * 60, 24 * 60);

  if (classEnabled && Array.isArray(data?.schedules)) {
    for (const s of data.schedules) {
      if (!s || s.day !== DAYS[now.dayIdx] || !TIME_RE.test(s.start)) continue;
      const diff = toMinutes(s.start) - now.minutes;
      if (diff > 0 && diff <= classMinutes) {
        out.push({
          key: `class:${now.date}:${s.id}`,
          title: `อีก ${diff} นาทีเข้าเรียน 📚`,
          body: `${s.name}${s.room ? ` ห้อง ${s.room}` : ''} เริ่ม ${s.start}`,
        });
      }
    }
  }

  // งานที่ต้องส่ง: วันละครั้งตามเวลาที่ผู้ใช้ตั้ง
  if (taskEnabled && within(taskAt, 3) && Array.isArray(data?.tasks)) {
    const pending = data.tasks.filter((t: { status?: string; due?: string }) => t && t.status !== 'done' && DATE_RE.test(t.due || ''));
    const by = (n: (d: number) => boolean) => pending.filter((t: { due: string }) => n(daysBetween(now.date, t.due)));
    const overdue = by((d) => d < 0);
    const today = by((d) => d === 0);
    const tomorrow = by((d) => d === 1);
    if (overdue.length || today.length || tomorrow.length) {
      const parts: string[] = [];
      if (today.length) parts.push(`ส่งวันนี้: ${today.map((t: { title: string }) => t.title).join(', ')}`);
      if (tomorrow.length) parts.push(`ส่งพรุ่งนี้: ${tomorrow.map((t: { title: string }) => t.title).join(', ')}`);
      if (overdue.length) parts.push(`เลยกำหนด ${overdue.length} งาน`);
      out.push({ key: `tasks:${now.date}`, title: 'งานใกล้ถึงกำหนดส่ง ⏰', body: parts.join(' · ') });
    }
  }

  if (taskEnabled && Array.isArray(data?.exams)) {
    for (const e of data.exams) {
      if (!e || !DATE_RE.test(e.date)) continue;
      const d = daysBetween(now.date, e.date);
      const where = [e.time ? `เวลา ${e.time}` : '', e.room || ''].filter(Boolean).join(' ');
      if (d === 1 && within(examEveAt, 3)) {
        out.push({ key: `exam-eve:${e.id}:${e.date}`, title: `พรุ่งนี้${examTitle(e.name)} 📝`, body: where || 'เตรียมตัวให้พร้อม นอนเร็ว ๆ นะ' });
      }
      if (d === 0 && within(examDayAt, 4)) {
        out.push({ key: `exam-day:${e.id}:${e.date}`, title: `วันนี้${examTitle(e.name)} 💪`, body: where || 'สู้ ๆ นะ!' });
      }
    }
  }
  // สรุปประจำสัปดาห์: เย็นวันอาทิตย์
  if (weeklyEnabled && now.dayIdx === 6 && within(weeklyAt, 3)) {
    const monday = shiftDate(now.date, -6);
    const inWeek = (d: string) => d >= monday && d <= now.date;
    let minutes = 0;
    for (const [d, subj] of Object.entries(data?.studyLog || {})) {
      if (inWeek(d) && subj && typeof subj === 'object') minutes += Object.values(subj as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0);
    }
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const done = tasks.filter((t: { status?: string; doneAt?: string }) => t?.status === 'done' && t.doneAt && inWeek(t.doneAt)).length;
    const nextWeek = (d: string) => DATE_RE.test(d) && daysBetween(now.date, d) >= 1 && daysBetween(now.date, d) <= 7;
    const due = tasks.filter((t: { status?: string; due?: string }) => t?.status !== 'done' && nextWeek(t.due || '')).length;
    const examsNext = (Array.isArray(data?.exams) ? data.exams : []).filter((e: { date?: string }) => nextWeek(e?.date || ''));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const read = minutes ? `อ่าน ${h ? `${h} ชม. ` : ''}${m ? `${m} นาที` : ''}`.trim() : 'ยังไม่ได้จับเวลาอ่าน';
    const next = [due ? `ส่งงาน ${due} ชิ้น` : '', examsNext.length ? `สอบ ${examsNext.length} วิชา` : ''].filter(Boolean).join(', ') || 'ยังไม่มีงานหรือสอบ';
    out.push({ key: `weekly:${now.date}`, title: 'สรุปสัปดาห์นี้ 📊', body: `${read} · งานเสร็จ ${done} ชิ้น · สัปดาห์หน้า: ${next}` });
  }
  return out;
}

async function runReminders(dry: boolean) {
  await sql`delete from private.push_sent where sent_at < now() - interval '3 days'`;
  const rows = await sql<(Sub & { user_id: string; tz: string; data: unknown })[]>`
    select s.endpoint, s.p256dh, s.auth, s.user_id, s.tz, d.data
    from private.push_subscriptions s
    join public.user_data d on d.user_id = s.user_id`;
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r]);

  const report: { user: string; key: string; sent: number }[] = [];
  for (const [userId, subs] of byUser) {
    const reminders = dueReminders(subs[0].data, subs[0].tz);
    for (const r of reminders) {
      if (dry) {
        report.push({ user: userId, key: r.key, sent: 0 });
        continue;
      }
      const inserted = await sql`insert into private.push_sent (user_id, key) values (${userId}, ${r.key})
                                 on conflict do nothing returning 1`;
      if (!inserted.length) continue; // ส่งไปแล้ว
      let sent = 0;
      for (const s of subs) if ((await sendTo(s, { title: r.title, body: r.body, tag: r.key, url: './' })).ok) sent++;
      report.push({ user: userId, key: r.key, sent });
    }
  }
  return { users: byUser.size, reminders: report };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  try {
    const cfg = await getConfig();
    switch (body.action) {
      case 'public-key':
        return json({ publicKey: cfg.vapid_public });

      case 'run': {
        if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
        return json(await runReminders(body.dry === true));
      }

      case 'run-scheduled': {
        if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
        // ลบแล้วคืนค่าในคำสั่งเดียว กันไม่ให้ส่งซ้ำถ้ามีสองรอบทำงานพร้อมกัน
        const due = await sql<{ user_id: string; title: string; body: string }[]>`
          delete from private.push_scheduled where fire_at <= now() returning user_id, title, body`;
        let sent = 0;
        for (const d of due) {
          const subs = await sql<Sub[]>`select endpoint, p256dh, auth from private.push_subscriptions where user_id = ${d.user_id}`;
          for (const s of subs) if ((await sendTo(s, { title: d.title, body: d.body, tag: 'studyflow-pomodoro', url: './' })).ok) sent++;
        }
        return json({ due: due.length, sent });
      }

      case 'schedule-timer': {
        const user = await userFromRequest(req);
        if (!user) return json({ error: 'not signed in' }, 401);
        const fireAt = new Date(String(body.fireAt || ''));
        const ms = fireAt.getTime() - Date.now();
        if (!Number.isFinite(ms) || ms < -60_000 || ms > 4 * 3600_000) return json({ error: 'invalid fireAt' }, 400);
        const title = String(body.title || 'หมดเวลา ⏰').slice(0, 120);
        const text = String(body.body || '').slice(0, 200);
        await sql`insert into private.push_scheduled (user_id, kind, fire_at, title, body)
                  values (${user.id}, 'timer', ${fireAt}, ${title}, ${text})
                  on conflict (user_id, kind) do update set fire_at = excluded.fire_at, title = excluded.title, body = excluded.body`;
        return json({ ok: true });
      }

      case 'cancel-timer': {
        const user = await userFromRequest(req);
        if (!user) return json({ error: 'not signed in' }, 401);
        await sql`delete from private.push_scheduled where user_id = ${user.id} and kind = 'timer'`;
        return json({ ok: true });
      }

      case 'subscribe': {
        const user = await userFromRequest(req);
        if (!user) return json({ error: 'not signed in' }, 401);
        // deno-lint-ignore no-explicit-any
        const sub = body.subscription as any;
        const endpoint = String(sub?.endpoint || '');
        const p256dh = String(sub?.keys?.p256dh || '');
        const auth = String(sub?.keys?.auth || '');
        if (!validEndpoint(endpoint) || !p256dh || !auth || endpoint.length > 1000) return json({ error: 'invalid subscription' }, 400);
        let tz = String(body.tz || 'Asia/Bangkok');
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
        } catch {
          tz = 'Asia/Bangkok';
        }
        const [{ count }] = await sql`select count(*)::int as count from private.push_subscriptions where user_id = ${user.id}`;
        if (count >= 10) await sql`delete from private.push_subscriptions where endpoint in (
            select endpoint from private.push_subscriptions where user_id = ${user.id} order by created_at limit 1)`;
        await sql`insert into private.push_subscriptions (endpoint, user_id, p256dh, auth, tz)
                  values (${endpoint}, ${user.id}, ${p256dh}, ${auth}, ${tz})
                  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
                    auth = excluded.auth, tz = excluded.tz`;
        return json({ ok: true });
      }

      case 'unsubscribe': {
        const user = await userFromRequest(req);
        if (!user) return json({ error: 'not signed in' }, 401);
        await sql`delete from private.push_subscriptions where endpoint = ${String(body.endpoint || '')} and user_id = ${user.id}`;
        return json({ ok: true });
      }

      case 'test': {
        const user = await userFromRequest(req);
        if (!user) return json({ error: 'not signed in' }, 401);
        const subs = await sql<Sub[]>`select endpoint, p256dh, auth from private.push_subscriptions where user_id = ${user.id}`;
        const results = [];
        for (const s of subs) {
          results.push(await sendTo(s, { title: 'ทดสอบการแจ้งเตือน ✅', body: 'ถ้าเห็นข้อความนี้ แปลว่าแจ้งเตือนแม้ปิดแอปใช้ได้แล้ว', tag: 'studyflow-test', url: './' }));
        }
        return json({ devices: subs.length, sent: results.filter((r) => r.ok).length });
      }

      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});
