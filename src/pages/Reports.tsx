import { useState } from 'react';
import { Link } from 'react-router';
import { fmtDate, moneyExact, useApi } from '../lib';
import PayModal, { type PayTarget } from '../PayModal';
import { Badge, Card, ErrorNote, Loading, PageHeader, Table, Td, Button } from '../ui';

export default function Reports() {
  const [tab, setTab] = useState<'defaulters' | 'audit'>('defaulters');
  return (
    <>
      <PageHeader title="Reports" subtitle="Backed by database views and the audit trigger" />
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {[['defaulters', 'Defaulters (v_defaulters)'], ['audit', 'Audit log (audit_log)']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>
        ))}
      </div>
      {tab === 'defaulters' ? <Defaulters /> : <Audit />}
    </>
  );
}

function Defaulters() {
  const { data, error, reload } = useApi<any[]>('/reports/defaulters');
  const [pay, setPay] = useState<PayTarget | null>(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const total = data.reduce((s, d) => s + d.balance, 0);
  return (
    <Card title={`${data.length} overdue installments · ${moneyExact(total)} outstanding`}>
      <Table head={['Member', 'Phone', 'Group', 'Month', 'Due date', 'Days late', 'Balance', '']} empty={!data.length}>
        {data.map((d) => (
          <tr key={d.installment_id}>
            <Td><Link to={`/members/${d.member_id}`} className="font-medium text-brand-700 hover:underline">{d.full_name}</Link></Td>
            <Td className="font-mono text-xs">{d.phone}</Td>
            <Td>{d.group_name} <span className="font-mono text-xs text-slate-400">#{d.ticket_no}</span></Td>
            <Td>#{d.month_no}</Td>
            <Td className="text-slate-500">{fmtDate(d.due_date)}</Td>
            <Td><Badge tone={d.days_overdue > 30 ? 'pending' : 'partial'}>{d.days_overdue} days</Badge></Td>
            <Td className="num font-medium text-rose-600">{moneyExact(d.balance)}</Td>
            <Td><Button size="sm" onClick={() => setPay(d)}>Collect</Button></Td>
          </tr>
        ))}
      </Table>
      <PayModal target={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
    </Card>
  );
}

function Audit() {
  const { data, error } = useApi<any[]>('/reports/audit');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  return (
    <Card title="Last 100 changes (written by trg_audit)">
      <Table head={['#', 'When', 'Table', 'Operation', 'Row data (JSONB)']} empty={!data.length}>
        {data.map((a) => (
          <tr key={a.audit_id}>
            <Td className="text-slate-400">{a.audit_id}</Td>
            <Td className="text-slate-500">{new Date(a.changed_at).toLocaleString('en-IN')}</Td>
            <Td className="font-mono text-xs">{a.table_name}</Td>
            <Td><Badge tone={a.operation === 'INSERT' ? 'active' : a.operation === 'DELETE' ? 'pending' : 'partial'}>{a.operation}</Badge></Td>
            <Td className="max-w-md truncate font-mono text-xs text-slate-500">{JSON.stringify(a.row_data)}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
