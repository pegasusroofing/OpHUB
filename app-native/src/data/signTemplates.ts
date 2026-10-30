// Signing templates (610) and a document's own signature boxes (600): the
// library of sample forms with their boxes, and saving boxes onto a job's RAMS.
import { useQuery } from '@tanstack/react-query';

import { layoutBoxes, layoutSlots, layoutClients, stampSignLayout, type SignLayout } from '@/lib/signedPdf';
import { deliverPdf, exportFilename, fetchBytes, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import type { SBox } from '@/lib/rules/signBoxes';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type SignTemplate = { id: string; name: string; page_count: number | null; layout: SignLayout; storage_path: string | null; file_name: string | null };
export const useSignTemplates = (enabled = true) => useQuery({ queryKey: ['signTemplates'], enabled, queryFn: async () => ((await db.from('sign_layout_templates').select('id,name,page_count,layout,storage_path,file_name,created_at').order('name')).data as SignTemplate[] | null) ?? [] });
export async function loadTemplate(id: string): Promise<SignTemplate | null> {
  return (await db.from('sign_layout_templates').select('*').eq('id', id).maybeSingle()).data as SignTemplate | null;
}
export async function addTemplate(me: Profile, name: string, a: { uri: string; name: string }): Promise<string | null> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('rams-docs').upload(`sign-templates/${me.org_id}/${rid}-${a.name.replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    if (up.error) return null;
    const r = await db.from('sign_layout_templates').insert({ name: name.slice(0, 80), layout: { v: 2, boxes: [] }, storage_path: up.data.path, file_name: a.name } as never).select('id').single();
    return (r.data as { id: string } | null)?.id ?? null;
  } catch { return null; }
}
export const renameTemplate = async (id: string, name: string) => !!(await db.from('sign_layout_templates').update({ name: name.slice(0, 80) } as never).eq('id', id).select('id')).data?.length;
export const deleteTemplate = async (id: string) => !!(await db.from('sign_layout_templates').delete().eq('id', id).select('id')).data?.length;
export const saveTemplateBoxes = async (id: string, boxes: SBox[], pages: number) => !!(await db.from('sign_layout_templates').update({ layout: { v: 2, boxes }, page_count: pages || null } as never).eq('id', id).select('id')).data?.length;
export async function saveAsTemplate(name: string, boxes: SBox[], pages: number, storagePath: string | null): Promise<boolean> {
  return !(await db.from('sign_layout_templates').insert({ name: name.slice(0, 80), page_count: pages || null, layout: { v: 2, boxes }, storage_path: storagePath } as never)).error;
}
/** Boxes set by hand on a document make it a multi-page signing one. */
export async function saveDocBoxes(docId: string, boxes: SBox[]): Promise<boolean> {
  return !!(await db.from('rams_docs').update({ sign_layout: { v: 2, boxes, multi: true } } as never).eq('id', docId).select('id')).data?.length;
}
export const boxesOf = (l: SignLayout) => layoutBoxes(l) as SBox[];
export function layoutSummary(l: SignLayout) {
  const n = layoutBoxes(l).length; if (!n) return '';
  const ops = layoutSlots(l), cl = layoutClients(l), pm = layoutBoxes(l).some((b) => b.w === 'pm');
  const bits = [ops ? `${ops} operative${ops === 1 ? '' : 's'}` : '', pm ? 'project manager' : '', cl ? (cl === 1 ? 'client' : `${cl} clients`) : ''].filter(Boolean);
  return `${n} box${n === 1 ? '' : 'es'}${bits.length ? ` · ${bits.join(', ')}` : ''}`;
}
/** "Test fill": every box filled with sample text so the places can be checked. Nothing is saved or signed. */
export async function testFill(doc: { name: string; storage_path: string; sign_layout: SignLayout }): Promise<string | null> {
  if (!layoutBoxes(doc.sign_layout).length) return 'This document has no signature boxes set.';
  const bytes = await fetchBytes(publicUrl('rams-docs', doc.storage_path)); if (!bytes) return 'Could not open the document.';
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const s = (label: string) => ({ name: label, plainName: label, dateText: today, when: '', imagePath: null });
  const ops = Array.from({ length: layoutSlots(doc.sign_layout) }, (_, i) => s(`Operative ${i + 1}`));
  const clients: Record<number, ReturnType<typeof s>> = {}; for (let i = 1; i <= layoutClients(doc.sign_layout); i++) clients[i] = s(`Client ${i}`);
  await stampSignLayout(pdf, doc.sign_layout, { ops, pm: s('Project Manager'), clients });
  return (await deliverPdf(await pdf.save(), exportFilename('', `${doc.name} (TEST FILL - not signed)`))) ? null : 'Could not save the PDF.';
}
