// A purchase order for another trade on a repair job (Andy, 9 Nov 2026): ticking "Raise A Purchase Order" on Add Other
// Trade opens this pop-up to finalise it — the supplier (or a new one), what it's for, the net, VAT, the cost type and
// when it's needed. It's numbered as any Finance PO (fin_new_po, <job>-PO-NNN) and its cost is booked to this works order
// (sub_job_id), so it shows on the job's Costs as ordered, not invoiced. Nothing is emailed from here: the PO opens in
// Finance to view, print or send (sending waits for the end of the Finance trial for RTB).
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { FinForm, type Field } from '@/components/FinForm';
import { todayIso } from '@/components/DateField';
import { fdb, loadSettings } from '@/data/finance';
import { COST_CATS } from '@/lib/rules/finBook';
import { num, vatList } from '@/lib/rules/finance';
import { vatRateOf, type PoVat } from '@/lib/rules/poCalc';
import type { Trade } from '@/lib/rules/repairStages';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const NEW = '__new';
// The cost a trade usually is: a scaffold or skip is plant hire, anything else a subcontract.
const catFor = (trade: string) => (/scaffold|skip|tower|hoist|cherry|mewp|access/i.test(trade) ? 'plant' : 'subcontract');

export function RepairTradePo({ me, siteId, job, trade, onDone, onClose }: {
  me: Profile; siteId: string; job: Row; trade: Trade;
  onDone: (po: { id: string; number: string }) => Promise<string | null>; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: setup } = useQuery({
    queryKey: ['repairTradePoSetup', me.org_id], queryFn: async () => ({
      st: await loadSettings(me.org_id ?? null),
      sups: ((await fdb.from('suppliers').select('id,name,email').eq('org_id', me.org_id as string).order('name')).data as { id: string; name: string; email: string | null }[] | null) ?? [],
      codes: ((await fdb.from('fin_cost_codes').select('id,code,name,category,active').eq('org_id', me.org_id as string)).data as { id: string; category: string | null; active: boolean | null }[] | null) ?? [],
    }),
  });
  if (!setup) return null;
  const vats = vatList(setup.st as never).filter((v) => v.active) as unknown as PoVat[];
  const vat0 = String((setup.st as { po_vat_default?: string } | null)?.po_vat_default || '20');
  const fields = (v: Record<string, unknown>): Field[] => [
    { k: 'sup', label: 'Supplier', kind: 'choice', options: [['', 'Choose…'], ...setup.sups.map((s) => [s.id, s.name] as [string, string]), [NEW, '+ New Supplier']] },
    ...(v.sup === NEW ? [{ k: 'supName', label: 'New Supplier Name', half: true }, { k: 'supEmail', label: 'Their Email', kind: 'email', half: true }] as Field[] : []),
    { k: 'desc', label: 'What It’s For' },
    { k: 'net', label: 'Net £', kind: 'money', half: true },
    { k: 'vat', label: 'VAT', kind: 'choice', half: true, options: vats.map((x) => [x.code, x.name] as [string, string]) },
    { k: 'cat', label: 'Cost Type', kind: 'choice', half: true, options: Object.entries(COST_CATS).filter(([k]) => k !== 'labour') as [string, string][] },
    { k: 'req', label: 'Needed By', kind: 'date', half: true },
    { k: 'note', label: 'Notes For The Supplier', kind: 'multiline', ph: 'E.g. Access via the rear garden' },
  ];
  const ref = [job.job_number, job.address].filter(Boolean).join(' · ');
  return (
    <FinForm title="Finalise The Purchase Order" saveLabel="Raise PO" onClose={onClose} fields={fields}
      note={`For ${trade.trade} on ${ref || 'this job'}. Its cost is booked to this works order. Open the PO in Finance afterwards to view, print or send it.`}
      initial={{ sup: '', supName: '', supEmail: '', desc: `${trade.trade}${ref ? ` — ${ref}` : ''}`, net: '', vat: vats.some((x) => x.code === vat0) ? vat0 : vats[0]?.code || '', cat: catFor(trade.trade), req: trade.date || '', note: '' }}
      onSave={async (v) => {
        const net = num(String(v.net || ''));
        if (!v.sup) return 'Choose the supplier.';
        if (v.sup === NEW && !String(v.supName || '').trim()) return 'Type the new supplier’s name.';
        if (v.sup === NEW && String(v.supEmail || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v.supEmail).trim())) return 'Check the supplier’s email.';
        if (!String(v.desc || '').trim()) return 'Say what it’s for.';
        if (net === null || isNaN(net) || net <= 0) return 'Put in the net amount.';
        let supId = String(v.sup), supName = setup.sups.find((s) => s.id === supId)?.name || '';
        if (supId === NEW) {
          const made = await fdb.from('suppliers').insert({ org_id: me.org_id, name: String(v.supName).trim(), email: String(v.supEmail || '').trim(), created_by: me.id } as never).select('id,name').single();
          if (!made.data) return 'Could not add the supplier.';
          supId = (made.data as { id: string }).id; supName = String(v.supName).trim();
        }
        const cat = String(v.cat || 'subcontract'), code = String(v.vat || ''), vat = r2((net * vatRateOf(code, vats)) / 100);
        const ccId = setup.codes.find((c) => c.category === cat && c.active !== false)?.id;
        const item = { item: String(v.desc).trim(), qty: 1, unit: null, rate: net, amount: r2(net), cost_code: cat, ...(ccId ? { cost_code_id: ccId } : {}), site_id: siteId, vat_rate: code, vat, sub_job_id: job.id };
        const note = String(v.note || '').trim() || null, req = String(v.req || '') || null;
        const res = await supabase.rpc('fin_new_po' as never, { p_site: siteId, p_supplier_id: supId, p_supplier_name: supName, p_items: [item], p_required: req, p_note: note, p_delivery: 'delivery' } as never);
        const d = res.data as { id: string; number: string } | null;
        if (res.error || !d?.id) return `Could not raise the PO — ${res.error?.message || 'try again'}`;
        await fdb.from('purchase_orders').update({ status: 'open', is_draft: false, supplier_id: supId, supplier_name: supName, items: [item], value: r2(net), vat, total: r2(net + vat), required_by: req, note, reference: job.job_number || null, issue_date: todayIso(), delivery_to: 'job', delivery_address: job.address || null, sub_job_id: job.id } as never).eq('id', d.id);
        void qc.invalidateQueries({ queryKey: ['finPurchases'] }); void qc.invalidateQueries({ queryKey: ['finBook'] });
        return onDone(d);
      }} />
  );
}
