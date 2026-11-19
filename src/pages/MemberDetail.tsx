import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { fmtDate, money, moneyExact, useApi } from '../lib';
import PayModal, { type PayTarget } from '../PayModal';
import { Badge, Button, Card, ErrorNote, Loading, PageHeader, Stat, Table, Td } from '../ui';

export default function MemberDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`/members/${id}`);
  const [pay, setPay] = useState<PayTarget | null>(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { member: m, groups, statement } = data;

  return (
    <>
      <PageHeader title={m.full_name}
        subtitle={<><span className="font-mono">{m.phone}</span>{m.email && ` · ${m.email}`}{m.address && ` · ${m.address}`}</>}
        action={<Link to="/members" className="text-sm text-brand-600">← All members</Link>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Groups joined" value={m.groups_joined} />
        <Stat label="Total paid" value={money(m.total_paid)} tone="good" />
        <Stat label="Outstanding" value={money(m.total_outstanding)} tone={m.total_outstanding > 0 ? 'bad' : 'default'} />
        <Stat label="Member since" value={fmtDate(m.joined_on)} />
      </div>

      <Card title="Chit groups" className="mt-6">
        <Table head={['Group', 'Ticket', 'Enrolled', 'Status', 'Prize']} empty={!groups.length}>
          {groups.map((g: any) => (
            <tr key={g.group_id}>
              <Td><Link to={`/groups/${g.group_id}`} className="font-medium text-brand-700 hover:underline">{g.group_name}</Link></Td>
              <Td>#{g.ticket_no}</Td>
              <Td className="text-slate-500">{fmtDate(g.enrolled_on)}</Td>
              <Td><Badge>{g.status}</Badge></Td>
              <Td>{g.won_month ? <span>Won month {g.won_month} · <span className="num font-medium">{money(g.payout_amount)}</span></span> : <span className="text-slate-400">Not yet</span>}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title={<>Statement <span className="font-normal text-slate-400">· from <code className="font-mono text-xs">fn_member_statement({m.member_id})</code></span></>} className="mt-6">
        <Table head={['Group', 'Month', 'Due date', 'Due', 'Paid', 'Balance', 'Status', '']} empty={!statement.length}>
          {statement.map((s: any) => (
            <tr key={s.installment_id}>
              <Td>{s.group_name}</Td>
              <Td>#{s.month_no}</Td>
              <Td className="text-slate-500">{fmtDate(s.due_date)}</Td>
              <Td className="num">{moneyExact(s.amount_due)}</Td>
              <Td className="num">{moneyExact(s.amount_paid)}</Td>
              <Td className="num font-medium">{moneyExact(s.balance)}</Td>
              <Td><Badge>{s.status}</Badge></Td>
              <Td>{s.balance > 0 && <Button size="sm" onClick={() => setPay({ ...s, full_name: m.full_name })}>Pay</Button>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <PayModal target={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
    </>
  );
}
