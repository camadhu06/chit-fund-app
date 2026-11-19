import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { db, ensureDatabase, resetDatabase } from './db.ts';

await ensureDatabase();

const app = new Hono().basePath('/api');
app.use(logger());

/** Turns database errors (trigger RAISE EXCEPTION, constraint violations) into clean 400 replies. */
app.onError((err: any, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  }
  const pgCodes: Record<string, string> = {
    '23505': 'Duplicate value',
    '23503': 'Referenced record does not exist or is still in use',
    '23514': 'Value breaks a CHECK constraint',
    '23502': 'A required value is missing',
  };
  if (err?.code) {
    const prefix = pgCodes[err.code];
    const detail = err.code === '23514' && err.constraint ? ` (${err.constraint})`
      : err.detail ? ` (${err.detail})` : err.constraint ? ` (${err.constraint})` : '';
    return c.json({ error: prefix ? `${prefix}${detail}` : err.message, code: err.code }, 400);
  }
  console.error(err);
  return c.json({ error: err?.message ?? 'Server error' }, 500);
});

const id = (v: string) => z.coerce.number().int().positive().parse(v);

// ---------------------------------------------------------------- dashboard
app.get('/dashboard', async (c) => {
  const [stats] = await db.query(`
    SELECT (SELECT count(*)::int FROM members)                                   AS members,
           (SELECT count(*)::int FROM chit_groups WHERE status = 'active')       AS active_groups,
           (SELECT count(*)::int FROM chit_groups WHERE status = 'open')         AS open_groups,
           (SELECT COALESCE(sum(amount), 0) FROM payments)                       AS total_collected,
           (SELECT COALESCE(sum(amount), 0) FROM payments
             WHERE paid_on >= date_trunc('month', now()))                        AS collected_this_month,
           (SELECT COALESCE(sum(balance), 0) FROM v_defaulters)                  AS overdue_amount,
           (SELECT count(DISTINCT member_id)::int FROM v_defaulters)             AS defaulters,
           (SELECT COALESCE(sum(payout_amount), 0) FROM auctions)                AS total_payouts,
           (SELECT COALESCE(sum(commission), 0) FROM auctions)                   AS commission_earned`);
  const monthly = await db.query(`
    SELECT to_char(date_trunc('month', paid_on), 'Mon YYYY') AS month,
           sum(amount) AS amount
      FROM payments
     GROUP BY date_trunc('month', paid_on)
     ORDER BY date_trunc('month', paid_on)`);
  const recent = await db.query(`
    SELECT p.payment_id, p.amount, p.mode, p.paid_on, m.full_name, g.group_name, i.month_no
      FROM payments p
      JOIN installments i USING (installment_id)
      JOIN enrollments  e USING (enrollment_id)
      JOIN members      m USING (member_id)
      JOIN chit_groups  g ON g.group_id = e.group_id
     ORDER BY p.paid_on DESC, p.payment_id DESC
     LIMIT 8`);
  const groups = await db.query(`SELECT * FROM v_group_summary ORDER BY group_id`);
  return c.json({ stats, monthly, recent, groups, engine: db.kind });
});

// ---------------------------------------------------------------- members
const memberSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9]{3,15}$/, 'must be 3–15 digits'),
  email: z.union([z.string().trim().regex(/.@./, 'must contain @'), z.literal('')]).optional().transform((v) => v || null),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
});

app.get('/members', async (c) =>
  c.json(await db.query(`SELECT * FROM v_member_dues ORDER BY member_id`)));

app.post('/members', async (c) => {
  const m = memberSchema.parse(await c.req.json());
  const [row] = await db.query(
    `INSERT INTO members (full_name, phone, email, address) VALUES ($1, $2, $3, $4) RETURNING *`,
    [m.full_name, m.phone, m.email, m.address],
  );
  return c.json(row, 201);
});

app.get('/members/:id', async (c) => {
  const memberId = id(c.req.param('id'));
  const [member] = await db.query(`SELECT * FROM members WHERE member_id = $1`, [memberId]);
  if (!member) return c.json({ error: 'Member not found' }, 404);
  const [dues] = await db.query(`SELECT * FROM v_member_dues WHERE member_id = $1`, [memberId]);
  const groups = await db.query(
    `SELECT g.group_id, g.group_name, g.status, e.ticket_no, e.enrolled_on,
            a.month_no AS won_month, a.payout_amount
       FROM enrollments e
       JOIN chit_groups g USING (group_id)
       LEFT JOIN auctions a ON a.winner_enrollment_id = e.enrollment_id
      WHERE e.member_id = $1 ORDER BY g.group_id`, [memberId]);
  const statement = await db.query(`SELECT * FROM fn_member_statement($1)`, [memberId]);
  return c.json({ member: { ...member, ...dues }, groups, statement });
});

app.delete('/members/:id', async (c) => {
  await db.query(`DELETE FROM members WHERE member_id = $1`, [id(c.req.param('id'))]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- groups
const groupSchema = z.object({
  group_name: z.string().trim().min(3).max(80),
  chit_value: z.coerce.number().min(1000),
  total_members: z.coerce.number().int().min(5).max(50),
  commission_pct: z.coerce.number().min(0).max(5).default(5),
  max_bid_pct: z.coerce.number().min(5).max(40).default(40),
  start_date: z.iso.date(),
});

app.get('/groups', async (c) =>
  c.json(await db.query(`SELECT * FROM v_group_summary ORDER BY group_id`)));

app.post('/groups', async (c) => {
  const g = groupSchema.parse(await c.req.json());
  const [row] = await db.query(
    `INSERT INTO chit_groups (group_name, chit_value, total_members, commission_pct, max_bid_pct, start_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [g.group_name, g.chit_value, g.total_members, g.commission_pct, g.max_bid_pct, g.start_date],
  );
  return c.json(row, 201);
});

app.get('/groups/:id', async (c) => {
  const groupId = id(c.req.param('id'));
  const [group] = await db.query(`SELECT * FROM v_group_summary WHERE group_id = $1`, [groupId]);
  if (!group) return c.json({ error: 'Group not found' }, 404);
  const members = await db.query(
    `SELECT e.enrollment_id, e.ticket_no, e.enrolled_on, m.member_id, m.full_name, m.phone,
            a.month_no AS won_month,
            COALESCE(sum(i.amount_paid), 0)                AS paid,
            COALESCE(sum(i.amount_due - i.amount_paid), 0) AS outstanding
       FROM enrollments e
       JOIN members m USING (member_id)
       LEFT JOIN auctions a      ON a.winner_enrollment_id = e.enrollment_id
       LEFT JOIN installments i  ON i.enrollment_id = e.enrollment_id
      WHERE e.group_id = $1
      GROUP BY e.enrollment_id, m.member_id, a.month_no
      ORDER BY e.ticket_no`, [groupId]);
  const auctions = await db.query(
    `SELECT a.*, m.full_name AS winner_name, e.ticket_no AS winner_ticket,
            (SELECT count(*)::int FROM installments i WHERE i.auction_id = a.auction_id AND i.status = 'paid') AS paid_count
       FROM auctions a
       JOIN enrollments e ON e.enrollment_id = a.winner_enrollment_id
       JOIN members m USING (member_id)
      WHERE a.group_id = $1 ORDER BY a.month_no`, [groupId]);
  const available = await db.query(
    `SELECT member_id, full_name, phone FROM members
      WHERE member_id NOT IN (SELECT member_id FROM enrollments WHERE group_id = $1)
      ORDER BY full_name`, [groupId]);
  return c.json({ group, members, auctions, available });
});

app.post('/groups/:id/enroll', async (c) => {
  const groupId = id(c.req.param('id'));
  const { member_id } = z.object({ member_id: z.coerce.number().int() }).parse(await c.req.json());
  const [row] = await db.query(
    `INSERT INTO enrollments (group_id, member_id) VALUES ($1, $2) RETURNING *`, [groupId, member_id]);
  return c.json(row, 201);
});

app.get('/groups/:id/auction-preview', async (c) => {
  const groupId = id(c.req.param('id'));
  const discount = z.coerce.number().min(0).parse(c.req.query('discount') ?? 0);
  const [row] = await db.query(`SELECT * FROM fn_auction_preview($1, $2)`, [groupId, discount]);
  return c.json(row ?? null);
});

app.post('/groups/:id/auctions', async (c) => {
  const groupId = id(c.req.param('id'));
  const a = z.object({
    winner_enrollment_id: z.coerce.number().int(),
    bid_discount: z.coerce.number().min(0),
    auction_date: z.iso.date(),
  }).parse(await c.req.json());
  const [row] = await db.query(
    `INSERT INTO auctions (group_id, month_no, auction_date, winner_enrollment_id, bid_discount)
     VALUES ($1, NULL, $2, $3, $4) RETURNING *`,
    [groupId, a.auction_date, a.winner_enrollment_id, a.bid_discount]);
  return c.json(row, 201);
});

app.get('/groups/:id/installments', async (c) => {
  const groupId = id(c.req.param('id'));
  const month = z.coerce.number().int().min(1).parse(c.req.query('month'));
  return c.json(await db.query(
    `SELECT i.*, (i.amount_due - i.amount_paid) AS balance, e.ticket_no, m.full_name, m.phone
       FROM installments i
       JOIN enrollments e USING (enrollment_id)
       JOIN members m USING (member_id)
      WHERE e.group_id = $1 AND i.month_no = $2
      ORDER BY e.ticket_no`, [groupId, month]));
});

// ---------------------------------------------------------------- payments
app.get('/payments', async (c) => c.json(await db.query(`
    SELECT p.*, m.full_name, g.group_name, i.month_no, e.ticket_no
      FROM payments p
      JOIN installments i USING (installment_id)
      JOIN enrollments  e USING (enrollment_id)
      JOIN members      m USING (member_id)
      JOIN chit_groups  g ON g.group_id = e.group_id
     ORDER BY p.paid_on DESC, p.payment_id DESC
     LIMIT 200`)));

app.post('/payments', async (c) => {
  const p = z.object({
    installment_id: z.coerce.number().int(),
    amount: z.coerce.number().positive(),
    mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque']),
    reference_no: z.string().trim().max(50).optional().transform((v) => v || null),
  }).parse(await c.req.json());
  const [row] = await db.query(
    `INSERT INTO payments (installment_id, amount, mode, reference_no) VALUES ($1, $2, $3, $4) RETURNING *`,
    // demo-friendly: any reference works; if left blank for a non-cash payment, make one up
    [p.installment_id, p.amount, p.mode,
     p.reference_no ?? (p.mode === 'cash' ? null : `AUTO${Math.floor(10_000_000 + Math.random() * 90_000_000)}`)]);
  return c.json(row, 201);
});

// ---------------------------------------------------------------- reports
app.get('/reports/defaulters', async (c) =>
  c.json(await db.query(`SELECT * FROM v_defaulters ORDER BY days_overdue DESC, full_name`)));

app.get('/reports/audit', async (c) =>
  c.json(await db.query(`SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 100`)));

// ---------------------------------------------------------------- SQL Lab
app.post('/sql', async (c) => {
  const { query } = z.object({ query: z.string().trim().min(1).max(10_000) }).parse(await c.req.json());
  const started = performance.now();
  try {
    const res = await db.readOnly(query.replace(/;\s*$/, ''));
    return c.json({ ...res, ms: Math.round(performance.now() - started) });
  } catch (err: any) {
    return c.json({ error: err.message, position: err.position }, 400);
  }
});

app.get('/schema', async (c) => c.json(await db.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
           (SELECT t.table_type FROM information_schema.tables t
             WHERE t.table_schema = 'public' AND t.table_name = c.table_name) AS table_type
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
     ORDER BY table_type, c.table_name, c.ordinal_position`)));

app.post('/admin/reset', async (c) => {
  await resetDatabase();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- start
const root = new Hono();
root.route('/', app);
root.use('/*', serveStatic({ root: './dist' }));
root.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: root.fetch, port }, () =>
  console.log(`ChitBook API ready on http://localhost:${port}  (database: ${db.kind})`));
