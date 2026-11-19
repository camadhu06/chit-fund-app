import { useState } from 'react';
import { fmtDate, moneyExact, useApi } from '../lib';
import { Card, ErrorNote, inputCls, Loading, PageHeader, Table, Td } from '../ui';

export default function Payments() {
  const { data, error } = useApi<any[]>('/payments');
  const [mode, setMode] = useState('');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const rows = data.filter((p) => !mode || p.mode === mode);
  const total = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader title="Payments" subtitle="Record new payments from a group's Installments tab or a member's statement" />
      <Card title={`${rows.length} payments · ${moneyExact(total)}`}
        action={
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputCls} w-40 py-1.5`}>
            <option value="">All modes</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
          </select>
        }>
        <Table head={['Receipt', 'Date', 'Member', 'Group', 'Month', 'Mode', 'Reference', 'Amount']} empty={!rows.length}>
          {rows.map((p) => (
            <tr key={p.payment_id}>
              <Td className="font-mono text-xs text-slate-400">R{String(p.payment_id).padStart(5, '0')}</Td>
              <Td className="text-slate-500">{fmtDate(p.paid_on)}</Td>
              <Td className="font-medium">{p.full_name} <span className="font-mono text-xs text-slate-400">#{p.ticket_no}</span></Td>
              <Td>{p.group_name}</Td>
              <Td>#{p.month_no}</Td>
              <Td className="text-xs uppercase text-slate-500">{p.mode.replace('_', ' ')}</Td>
              <Td className="font-mono text-xs">{p.reference_no ?? '—'}</Td>
              <Td className="num text-right font-medium">{moneyExact(p.amount)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
