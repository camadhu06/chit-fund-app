import { Link } from 'react-router';
import { fmtDate, money, useApi } from '../lib';
import { Badge, Card, ErrorNote, Loading, PageHeader, Progress, Stat, Table, Td } from '../ui';

export default function Dashboard() {
  const { data, error } = useApi('/dashboard');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { stats: s, monthly, recent, groups } = data;
  const peak = Math.max(1, ...monthly.map((m: any) => m.amount));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={<>Overview of all chit groups · database engine: <code className="font-mono">{data.engine}</code></>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members" value={s.members} hint={`${s.active_groups} active · ${s.open_groups} open groups`} />
        <Stat label="Total collected" value={money(s.total_collected)} hint={`${money(s.collected_this_month)} this month`} tone="good" />
        <Stat label="Overdue" value={money(s.overdue_amount)} hint={`${s.defaulters} member(s) behind`} tone="bad" />
        <Stat label="Foreman commission" value={money(s.commission_earned)} hint={`${money(s.total_payouts)} paid out to winners`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Collections by month" className="lg:col-span-3">
          <div className="flex h-48 items-end gap-3">
            {monthly.map((m: any) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="num text-[11px] text-slate-500">{money(m.amount)}</div>
                <div className="w-full max-w-12 rounded-t-md bg-brand-500/85 transition hover:bg-brand-600"
                     style={{ height: `${(m.amount / peak) * 140}px` }} title={money(m.amount)} />
                <div className="text-[11px] text-slate-500">{m.month.split(' ')[0]}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Groups" className="lg:col-span-2" action={<Link to="/groups" className="text-xs font-medium text-brand-600">View all →</Link>}>
          <div className="space-y-4">
            {groups.map((g: any) => (
              <Link key={g.group_id} to={`/groups/${g.group_id}`} className="block">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{g.group_name}</span>
                  <Badge>{g.status}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <Progress value={g.status === 'open' ? g.enrolled : g.auctions_done} max={g.total_members} />
                  <span className="num shrink-0 text-xs text-slate-500">
                    {g.status === 'open' ? `${g.enrolled}/${g.total_members} joined` : `month ${g.auctions_done}/${g.total_members}`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Recent payments" className="mt-6" action={<Link to="/payments" className="text-xs font-medium text-brand-600">All payments →</Link>}>
        <Table head={['Date', 'Member', 'Group', 'Month', 'Mode', 'Amount']} empty={!recent.length}>
          {recent.map((p: any) => (
            <tr key={p.payment_id}>
              <Td className="text-slate-500">{fmtDate(p.paid_on)}</Td>
              <Td className="font-medium">{p.full_name}</Td>
              <Td>{p.group_name}</Td>
              <Td>#{p.month_no}</Td>
              <Td><span className="uppercase text-xs text-slate-500">{p.mode.replace('_', ' ')}</span></Td>
              <Td className="num text-right font-medium">{money(p.amount)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
