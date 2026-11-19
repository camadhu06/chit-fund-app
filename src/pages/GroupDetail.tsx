import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, fmtDate, money, moneyExact, today, useApi } from '../lib';
import PayModal, { type PayTarget } from '../PayModal';
import { Badge, Button, Card, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, Stat, Table, Td } from '../ui';

export default function GroupDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`/groups/${id}`);
  const [tab, setTab] = useState<'members' | 'auctions' | 'installments'>('members');
  const [auctionOpen, setAuctionOpen] = useState(false);

  useEffect(() => {
    if (data?.group.status !== 'open' && data?.auctions.length) setTab((t) => (t === 'members' ? 'auctions' : t));
  }, [data?.group.group_id]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { group: g, members, auctions } = data;

  return (
    <>
      <PageHeader title={g.group_name}
        subtitle={<span className="inline-flex items-center gap-2"><Badge>{g.status}</Badge> Started {fmtDate(g.start_date)} · {g.commission_pct}% commission · bids up to {g.max_bid_pct}%</span>}
        action={
          <div className="flex items-center gap-3">
            <Link to="/groups" className="text-sm text-brand-600">← All groups</Link>
            {g.status === 'active' && <Button onClick={() => setAuctionOpen(true)}>Conduct month {g.auctions_done + 1} auction</Button>}
          </div>
        } />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Chit value" value={money(g.chit_value)} hint={`${money(g.monthly_contribution)} × ${g.total_members}`} />
        <Stat label="Progress" value={g.status === 'open' ? `${g.enrolled}/${g.total_members}` : `${g.auctions_done}/${g.total_members}`} hint={g.status === 'open' ? 'members enrolled' : 'months auctioned'} />
        <Stat label="Collected" value={money(g.total_collected)} tone="good" />
        <Stat label="Outstanding" value={money(g.total_outstanding)} tone={g.total_outstanding > 0 ? 'bad' : 'default'} />
      </div>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {(['members', 'auctions', 'installments'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t} {t === 'members' ? `(${members.length})` : t === 'auctions' ? `(${auctions.length})` : ''}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'members' && <MembersTab data={data} reload={reload} />}
        {tab === 'auctions' && <AuctionsTab auctions={auctions} />}
        {tab === 'installments' && <InstallmentsTab key={g.auctions_done} groupId={g.group_id} months={g.auctions_done} />}
      </div>

      {auctionOpen && <AuctionModal data={data} onClose={() => setAuctionOpen(false)} onDone={() => { setAuctionOpen(false); setTab('installments'); reload(); }} />}
    </>
  );
}

function MembersTab({ data, reload }: { data: any; reload: () => void }) {
  const { group: g, members, available } = data;
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  async function enroll() {
    setErr('');
    try { await api(`/groups/${g.group_id}/enroll`, { body: { member_id: pick } }); setPick(''); reload(); }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <Card title="Enrolled members"
      action={g.status === 'open' && (
        <div className="flex items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputCls} w-52 py-1.5`}>
            <option value="">Select member…</option>
            {available.map((m: any) => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
          </select>
          <Button size="sm" disabled={!pick} onClick={enroll}>Enroll</Button>
        </div>
      )}>
      {err && <div className="mb-8"><ErrorNote>{err}</ErrorNote></div>}
      {g.status === 'open' && <OpenGroupNote g={g} />}
      <Table head={['Ticket', 'Member', 'Phone', 'Enrolled', 'Paid', 'Outstanding', 'Prize']} empty={!members.length}>
        {members.map((m: any) => (
          <tr key={m.enrollment_id}>
            <Td className="font-mono text-xs">#{m.ticket_no}</Td>
            <Td><Link to={`/members/${m.member_id}`} className="font-medium text-brand-700 hover:underline">{m.full_name}</Link></Td>
            <Td className="font-mono text-xs">{m.phone}</Td>
            <Td className="text-slate-500">{fmtDate(m.enrolled_on)}</Td>
            <Td className="num">{money(m.paid)}</Td>
            <Td className={`num ${m.outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(m.outstanding)}</Td>
            <Td>{m.won_month ? <Badge tone="won">won month {m.won_month}</Badge> : <span className="text-xs text-slate-400">eligible</span>}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

/** Explains why an open group shows ₹0 everywhere, and what the numbers will be once it starts. */
function OpenGroupNote({ g }: { g: any }) {
  const left = g.total_members - g.enrolled;
  return (
    <div className="mb-8 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
      <b>Waiting for {left} more member{left === 1 ? '' : 's'}.</b> Auctions, installments and payments start only
      once all {g.total_members} seats are filled, so paid and outstanding amounts are ₹0 until then.
      <div className="mt-1 text-sky-700">
        After it starts: each member pays up to {money(g.monthly_contribution)}/month · foreman commission{' '}
        {money((g.chit_value * g.commission_pct) / 100)} per auction · bids up to {money((g.chit_value * g.max_bid_pct) / 100)}.
      </div>
    </div>
  );
}

function AuctionsTab({ auctions }: { auctions: any[] }) {
  if (!auctions.length) {
    return <Card><p className="text-sm text-slate-500">No auctions yet. The first auction can be held once the group is full and becomes active.</p></Card>;
  }
  return (
    <Card title="Auction history">
      <Table head={['Month', 'Date', 'Winner', 'Bid discount', 'Commission', 'Dividend / member', 'Payout', 'Collected']} empty={!auctions.length}>
        {auctions.map((a) => (
          <tr key={a.auction_id}>
            <Td className="font-medium">#{a.month_no}</Td>
            <Td className="text-slate-500">{fmtDate(a.auction_date)}</Td>
            <Td>{a.winner_name} <span className="font-mono text-xs text-slate-400">#{a.winner_ticket}</span></Td>
            <Td className="num">{money(a.bid_discount)}</Td>
            <Td className="num text-slate-500">{money(a.commission)}</Td>
            <Td className="num text-emerald-600">{moneyExact(a.dividend_per_member)}</Td>
            <Td className="num font-semibold">{money(a.payout_amount)}</Td>
            <Td className="num text-xs text-slate-500">{a.paid_count} paid</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function InstallmentsTab({ groupId, months }: { groupId: number; months: number }) {
  const [month, setMonth] = useState(Math.max(1, months));
  const { data, reload } = useApi<any[]>(months ? `/groups/${groupId}/installments?month=${month}` : null);
  const [pay, setPay] = useState<PayTarget | null>(null);
  if (!months) return <Card><p className="text-sm text-slate-500">No installments yet — they are generated automatically by a trigger after each auction.</p></Card>;
  const due = data?.reduce((s, i) => s + i.amount_due, 0) ?? 0;
  const paid = data?.reduce((s, i) => s + i.amount_paid, 0) ?? 0;
  return (
    <Card title={`Month ${month} installments · ${money(paid)} of ${money(due)} collected`}
      action={
        <select value={month} onChange={(e) => setMonth(+e.target.value)} className={`${inputCls} w-36 py-1.5`}>
          {Array.from({ length: months }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Month {m}</option>)}
        </select>
      }>
      <Table head={['Ticket', 'Member', 'Due date', 'Due', 'Paid', 'Balance', 'Status', '']} empty={!data?.length}>
        {data?.map((i) => (
          <tr key={i.installment_id}>
            <Td className="font-mono text-xs">#{i.ticket_no}</Td>
            <Td className="font-medium">{i.full_name}</Td>
            <Td className="text-slate-500">{fmtDate(i.due_date)}</Td>
            <Td className="num">{moneyExact(i.amount_due)}</Td>
            <Td className="num">{moneyExact(i.amount_paid)}</Td>
            <Td className="num font-medium">{moneyExact(i.balance)}</Td>
            <Td><Badge>{i.status}</Badge></Td>
            <Td>{i.balance > 0 && <Button size="sm" onClick={() => setPay(i)}>Pay</Button>}</Td>
          </tr>
        ))}
      </Table>
      <PayModal target={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
    </Card>
  );
}

function AuctionModal({ data, onClose, onDone }: { data: any; onClose: () => void; onDone: () => void }) {
  const { group: g, members } = data;
  const isLast = g.auctions_done + 1 === g.total_members;
  const eligible = members.filter((m: any) => !m.won_month);
  const commission = (g.chit_value * g.commission_pct) / 100;
  const maxBid = (g.chit_value * g.max_bid_pct) / 100;
  const [winner, setWinner] = useState(isLast && eligible[0] ? String(eligible[0].enrollment_id) : '');
  const [discount, setDiscount] = useState(isLast ? commission : Math.round(maxBid / 2));
  const [date, setDate] = useState(today());
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState('');

  // live preview computed by the database function fn_auction_preview()
  useEffect(() => {
    const t = setTimeout(() => api(`/groups/${g.group_id}/auction-preview?discount=${discount || 0}`).then(setPreview).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [discount, g.group_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api(`/groups/${g.group_id}/auctions`, { body: { winner_enrollment_id: winner, bid_discount: discount, auction_date: date } });
      onDone();
    } catch (x: any) { setErr(x.message); }
  }

  return (
    <Modal open onClose={onClose} title={`Month ${g.auctions_done + 1} auction`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Winning bidder" hint={`${eligible.length} ticket(s) have not won yet`}>
          <select value={winner} onChange={(e) => setWinner(e.target.value)} required className={inputCls}>
            <option value="">Select winner…</option>
            {eligible.map((m: any) => <option key={m.enrollment_id} value={m.enrollment_id}>#{m.ticket_no} — {m.full_name}</option>)}
          </select>
        </Field>
        <Field label="Bid discount (₹)" hint={isLast ? 'Last month: discount equals the foreman commission' : `Between ${money(commission)} and ${money(maxBid)}`}>
          <input type="number" value={discount} min={commission} max={maxBid} step={100} disabled={isLast}
            onChange={(e) => setDiscount(+e.target.value)} className={inputCls} />
        </Field>
        <Field label="Auction date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        {preview && (
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><dt className="text-xs text-slate-500">Winner receives</dt><dd className="num font-semibold">{moneyExact(preview.payout_amount)}</dd></div>
            <div><dt className="text-xs text-slate-500">Foreman commission</dt><dd className="num font-semibold">{moneyExact(preview.commission)}</dd></div>
            <div><dt className="text-xs text-slate-500">Dividend per member</dt><dd className="num font-semibold text-emerald-600">{moneyExact(preview.dividend_per_member)}</dd></div>
            <div><dt className="text-xs text-slate-500">Each member pays</dt><dd className="num font-semibold">{moneyExact(preview.member_pays)}</dd></div>
          </dl>
        )}
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!winner}>Confirm auction</Button>
        </div>
      </form>
    </Modal>
  );
}
