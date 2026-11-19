import { useState } from 'react';
import { api, moneyExact } from './lib';
import { Button, ErrorNote, Field, inputCls, Modal } from './ui';

export type PayTarget = { installment_id: number; full_name?: string; month_no: number; balance: number; group_name?: string };

/** Records a payment against one installment. The DB trigger rejects over-payment. */
export default function PayModal({ target, onClose, onDone }: { target: PayTarget | null; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('upi');
  if (!target) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api('/payments', { body: { installment_id: target!.installment_id, ...Object.fromEntries(new FormData(e.currentTarget)) } });
      onDone();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Record payment">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium">{target.full_name}</div>
          <div className="text-slate-500">{target.group_name ? `${target.group_name} · ` : ''}Month {target.month_no} · balance <span className="num font-medium text-ink">{moneyExact(target.balance)}</span></div>
        </div>
        <Field label="Amount (₹)">
          <input name="amount" type="number" step="0.01" min="0.01" defaultValue={target.balance} required className={inputCls} />
        </Field>
        <Field label="Mode">
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
          </select>
        </Field>
        {mode !== 'cash' && (
          <Field label="Reference / UTR no." hint="Type any number, or leave blank to auto-generate one">
            <input name="reference_no" placeholder="e.g. 123456" className={inputCls} />
          </Field>
        )}
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy}>Save payment</Button>
        </div>
      </form>
    </Modal>
  );
}
