import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, fmtDate, money, today, useApi } from '../lib';
import { Badge, Button, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, Progress } from '../ui';

export default function Groups() {
  const { data, error } = useApi<any[]>('/groups');
  const [open, setOpen] = useState(false);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;

  return (
    <>
      <PageHeader title="Chit Groups" subtitle="Each group runs for as many months as it has members"
        action={<Button onClick={() => setOpen(true)}>+ New group</Button>} />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {data.map((g) => (
          <Link key={g.group_id} to={`/groups/${g.group_id}`}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold group-hover:text-brand-700">{g.group_name}</h3>
              <Badge>{g.status}</Badge>
            </div>
            <div className="num mt-3 text-3xl font-semibold tracking-tight">{money(g.chit_value)}</div>
            <div className="mt-1 text-sm text-slate-500">
              {g.total_members} members × {money(g.monthly_contribution)}/month
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{g.status === 'open' ? 'Enrollment' : 'Auctions'}</span>
                <span className="num">{g.status === 'open' ? `${g.enrolled}/${g.total_members}` : `${g.auctions_done}/${g.total_members}`}</span>
              </div>
              <Progress value={g.status === 'open' ? g.enrolled : g.auctions_done} max={g.total_members} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs">
              <div><dt className="text-slate-500">Starts</dt><dd className="font-medium">{fmtDate(g.start_date)}</dd></div>
              <div><dt className="text-slate-500">Commission</dt><dd className="font-medium">{g.commission_pct}%</dd></div>
              <div><dt className="text-slate-500">Collected</dt><dd className="num font-medium text-emerald-600">{money(g.total_collected)}</dd></div>
              <div><dt className="text-slate-500">Outstanding</dt><dd className="num font-medium text-rose-600">{money(g.total_outstanding)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
      <NewGroup open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewGroup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const [value, setValue] = useState(100000);
  const [count, setCount] = useState(10);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr('');
    try {
      const g = await api('/groups', { body: Object.fromEntries(new FormData(e.currentTarget)) });
      nav(`/groups/${g.group_id}`);
    } catch (x: any) { setErr(x.message); }
  }
  return (
    <Modal open={open} onClose={onClose} title="New chit group">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Group name"><input name="group_name" required className={inputCls} placeholder="e.g. Pongal Savers ₹2L" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chit value (₹)"><input name="chit_value" type="number" min={1000} step={1000} value={value} onChange={(e) => setValue(+e.target.value)} required className={inputCls} /></Field>
          <Field label="Members / months"><input name="total_members" type="number" min={5} max={50} value={count} onChange={(e) => setCount(+e.target.value)} required className={inputCls} /></Field>
          <Field label="Commission %" hint="Max 5% (Chit Funds Act)"><input name="commission_pct" type="number" step="0.5" min={0} max={5} defaultValue={5} className={inputCls} /></Field>
          <Field label="Max bid %"><input name="max_bid_pct" type="number" min={5} max={40} defaultValue={40} className={inputCls} /></Field>
        </div>
        <Field label="Start date"><input name="start_date" type="date" defaultValue={today()} required className={inputCls} /></Field>
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Each member contributes <b className="num">{money(count ? value / count : 0)}</b> per month for {count} months.
        </div>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>Create group</Button>
        </div>
      </form>
    </Modal>
  );
}
