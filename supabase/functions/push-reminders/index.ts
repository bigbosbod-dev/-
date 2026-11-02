// StudyFlow: แจ้งเตือนแบบเด้ง (Web Push) แม้ปิดแอป
//
// actions (POST JSON { action, ... }):
//   public-key   -> คืน VAPID public key ให้แอปใช้สมัครรับแจ้งเตือน (ไม่ต้องล็อกอิน)
//   subscribe    -> บันทึกอุปกรณ์ของผู้ใช้ที่ล็อกอิน { subscription, tz }
//   unsubscribe  -> ลบอุปกรณ์ { endpoint }
//   test         -> ส่งแจ้งเตือนทดสอบไปทุกอุปกรณ์ของผู้ใช้ที่ล็อกอิน
//   run          -> (pg_cron เรียกทุกนาที ต้องมี header x-cron-secret) เช็กแล้วส่งแจ้งเตือนที่ถึงเวลา
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

  // งานและวันสอบ: เตือนช่วงกลางวัน/หัวค่ำเท่านั้น ไม่ปลุกตอนดึก
  if (taskEnabled && now.hour >= 8 && now.hour < 22 && Array.isArray(data?.tasks)) {
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
      if (d === 1 && now.hour >= 19 && now.hour < 22) {
        out.push({ key: `exam-eve:${e.id}:${e.date}`, title: `พรุ่งนี้${examTitle(e.name)} 📝`, body: where || 'เตรียมตัวให้พร้อม นอนเร็ว ๆ นะ' });
      }
      if (d === 0 && now.hour >= 6 && now.hour < 12) {
        out.push({ key: `exam-day:${e.id}:${e.date}`, title: `วันนี้${examTitle(e.name)} 💪`, body: where || 'สู้ ๆ นะ!' });
      }
    }
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
