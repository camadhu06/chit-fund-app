import { useState } from 'react';
import { Link } from 'react-router';
import { api, fmtDate, money, useApi } from '../lib';
import { Badge, Button, Card, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, Table, Td } from '../ui';

export default function Members() {
  const { data, error, reload } = useApi<any[]>('/members');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const rows = data.filter((m) => `${m.full_name} ${m.phone} ${m.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Members" subtitle={`${data.length} subscribers`}
        action={<Button onClick={() => setOpen(true)}>+ Add member</Button>} />
      <Card>
        <input className={`${inputCls} mb-5 max-w-sm`} placeholder="Search name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pt-5">
          <Table head={['#', 'Name', 'Phone', 'Joined', 'Groups', 'Paid', 'Outstanding', '']} empty={!rows.length}>
            {rows.map((m) => (
              <tr key={m.member_id} className="hover:bg-slate-50">
                <Td className="text-slate-400">{m.member_id}</Td>
                <Td><Link to={`/members/${m.member_id}`} className="font-medium text-brand-700 hover:underline">{m.full_name}</Link></Td>
                <Td className="font-mono text-xs">{m.phone}</Td>
                <Td className="text-slate-500">{fmtDate(m.joined_on)}</Td>
                <Td>{m.groups_joined}</Td>
                <Td className="num">{money(m.total_paid)}</Td>
                <Td className={`num ${m.total_outstanding > 0 ? 'font-medium text-rose-600' : 'text-slate-400'}`}>{money(m.total_outstanding)}</Td>
                <Td>{m.has_won && <Badge tone="won">won</Badge>}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
      <AddMember open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />
    </>
  );
}

function AddMember({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api('/members', { body: Object.fromEntries(new FormData(e.currentTarget)) });
      onDone();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add member">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input name="full_name" required className={inputCls} /></Field>
        <Field label="Phone" hint="Any 3–15 digits, must be unique"><input name="phone" required className={inputCls} /></Field>
        <Field label="Email (optional)"><input name="email" className={inputCls} /></Field>
        <Field label="Address (optional)"><textarea name="address" rows={2} className={inputCls} /></Field>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy}>Save member</Button>
        </div>
      </form>
    </Modal>
  );
}
