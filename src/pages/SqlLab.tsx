import { useState } from 'react';
import { api, useApi } from '../lib';
import { Button, Card, ErrorNote, PageHeader } from '../ui';

/** Ready-made queries that show off DBMS concepts during a viva / demo. */
const presets: { name: string; sql: string }[] = [
  { name: 'JOIN: who won each auction', sql:
`SELECT g.group_name, a.month_no, m.full_name AS winner,
       a.bid_discount, a.payout_amount
FROM auctions a
JOIN enrollments e ON e.enrollment_id = a.winner_enrollment_id
JOIN members m     ON m.member_id = e.member_id
JOIN chit_groups g ON g.group_id = a.group_id
ORDER BY g.group_name, a.month_no` },
  { name: 'GROUP BY + HAVING: members owing > ₹5,000', sql:
`SELECT m.full_name, count(*) AS unpaid_installments,
       sum(i.amount_due - i.amount_paid) AS balance
FROM installments i
JOIN enrollments e USING (enrollment_id)
JOIN members m USING (member_id)
WHERE i.status <> 'paid'
GROUP BY m.member_id, m.full_name
HAVING sum(i.amount_due - i.amount_paid) > 5000
ORDER BY balance DESC` },
  { name: 'Window function: running collection total', sql:
`SELECT date_trunc('month', paid_on)::date AS month,
       sum(amount) AS collected,
       sum(sum(amount)) OVER (ORDER BY date_trunc('month', paid_on)::date) AS running_total,
       rank() OVER (ORDER BY sum(amount) DESC) AS rank_by_amount
FROM payments
GROUP BY 1
ORDER BY 1` },
  { name: 'CTE: winner profit vs. total contribution', sql:
`WITH contributed AS (
  SELECT enrollment_id, sum(amount_paid) AS paid_so_far
  FROM installments GROUP BY enrollment_id
)
SELECT m.full_name, a.month_no AS won_in_month, a.payout_amount,
       c.paid_so_far,
       a.payout_amount - c.paid_so_far AS net_position
FROM auctions a
JOIN contributed c ON c.enrollment_id = a.winner_enrollment_id
JOIN enrollments e ON e.enrollment_id = a.winner_enrollment_id
JOIN members m USING (member_id)
ORDER BY a.month_no` },
  { name: 'Correlated subquery: never won a chit', sql:
`SELECT m.member_id, m.full_name, m.phone
FROM members m
WHERE NOT EXISTS (
  SELECT 1 FROM auctions a
  JOIN enrollments e ON e.enrollment_id = a.winner_enrollment_id
  WHERE e.member_id = m.member_id
)
ORDER BY m.full_name` },
  { name: 'View: group summary', sql: `SELECT * FROM v_group_summary` },
  { name: 'Function: member statement', sql: `SELECT * FROM fn_member_statement(8)` },
  { name: 'Audit log: latest changes', sql:
`SELECT audit_id, changed_at, table_name, operation, row_data
FROM audit_log
ORDER BY audit_id DESC
LIMIT 10` },
  { name: 'Catalog: all triggers', sql:
`SELECT event_object_table AS table_name, trigger_name,
       action_timing, string_agg(event_manipulation, ', ') AS events
FROM information_schema.triggers
GROUP BY 1, 2, 3
ORDER BY 1, 2` },
  { name: 'EXPLAIN: query plan using an index', sql:
`EXPLAIN ANALYZE
SELECT * FROM installments WHERE status <> 'paid' AND due_date < CURRENT_DATE` },
];

export default function SqlLab() {
  const [sql, setSql] = useState(presets[0].sql);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const schema = useApi<any[]>('/schema');

  async function run(q = sql) {
    setBusy(true); setErr('');
    try { setRes(await api('/sql', { body: { query: q } })); }
    catch (x: any) { setErr(x.message); setRes(null); }
    finally { setBusy(false); }
  }

  const tables = new Map<string, { type: string; cols: string[] }>();
  schema.data?.forEach((c) => {
    if (!tables.has(c.table_name)) tables.set(c.table_name, { type: c.table_type, cols: [] });
    tables.get(c.table_name)!.cols.push(`${c.column_name} · ${c.data_type}`);
  });

  return (
    <>
      <PageHeader title="SQL Lab" subtitle="Run any SELECT against the live database. Runs inside a READ ONLY transaction, so nothing can be changed here." />
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button key={p.name} onClick={() => { setSql(p.sql); run(p.sql); }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-700">{p.name}</button>
              ))}
            </div>
            <textarea value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} rows={10}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); }}
              className="w-full rounded-lg border border-slate-800 bg-ink p-4 font-mono text-[13px] leading-relaxed text-slate-100 outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">Ctrl + Enter to run</span>
              <Button onClick={() => run()} disabled={busy}>{busy ? 'Running…' : '▶ Run query'}</Button>
            </div>
          </Card>
          <ErrorNote>{err}</ErrorNote>
          {res && (
            <Card title={`${res.rows.length} row(s) · ${res.ms} ms`}>
              <div className="-m-5 max-h-[480px] overflow-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>{res.fields.map((f: string) => <th key={f} className="whitespace-nowrap px-4 py-2 font-medium">{f}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {res.rows.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {res.fields.map((f: string) => (
                          <td key={f} className="whitespace-nowrap px-4 py-1.5">
                            {r[f] === null ? <span className="text-slate-300">NULL</span> : typeof r[f] === 'object' ? JSON.stringify(r[f]) : String(r[f])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
        <Card title="Schema browser" className="h-fit">
          <div className="max-h-[640px] space-y-3 overflow-auto text-xs">
            {[...tables].map(([name, t]) => (
              <details key={name}>
                <summary className="cursor-pointer font-mono font-medium text-slate-700">
                  {name} {t.type === 'VIEW' && <span className="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-600">view</span>}
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4 font-mono text-slate-500">{t.cols.map((c) => <li key={c}>{c}</li>)}</ul>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
