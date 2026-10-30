// A job's To Do List (350), managers only: to-dos with a required-by date, a PM
// assigned, comments and attachments; Live / Closed; email the list to PMs.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Todo = { id: string; site_id: string | null; text: string; done: boolean; assigned_to: string | null; date_required_by: string | null; created_at: string };
export type TodoComment = { id: string; todo_id: string; body: string; created_by: string | null; created_at: string };
export type TodoFile = { id: string; todo_id: string; name: string; storage_path: string };

export function useTodos(siteId: string | undefined) {
  return useQuery({
    queryKey: ['todos', siteId],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`todos:${siteId}`, async () => {
      const todos = orThrow(await db.from('todos').select('*').eq('site_id', siteId as string).order('created_at')) as Todo[];
      const ids = todos.map((t) => t.id);
      const [c, a] = ids.length ? await Promise.all([
        db.from('todo_comments').select('*').in('todo_id', ids).order('created_at'),
        db.from('todo_attachments').select('id,todo_id,name,storage_path').in('todo_id', ids).order('uploaded_at'),
      ]) : [{ data: [] }, { data: [] }];
      return { todos, comments: (c.data as TodoComment[] | null) ?? [], files: (a.data as TodoFile[] | null) ?? [] };
    }),
  });
}

export type Pm = { id: string; name: string; email: string | null };
/** Admins act as project managers too. */
export function usePmList() {
  return useQuery({
    queryKey: ['pmList'],
    staleTime: 300000,
    queryFn: async () => orThrow(await db.from('profiles').select('id,name,email').in('role', ['pm', 'admin']).order('name')) as Pm[],
  });
}

const tellManagers = (me: Profile, siteId: string, body: string) => {
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'managers', kind: 'todo_assigned', body } as never).then(undefined, () => undefined);
};

async function uploadOne(me: Profile, todoId: string, a: { uri: string; name: string; mimeType?: string | null; size?: number | null }) {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  try {
    const up = await supabase.storage.from('todo-attachments').upload(`${todoId}/${rid}-${a.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || 'application/octet-stream' });
    if (up.error) return false;
    return !(await db.from('todo_attachments').insert({ todo_id: todoId, name: a.name, storage_path: up.data.path, size: a.size ?? null, uploaded_by: me.id } as never)).error;
  } catch { return false; }
}
export async function uploadTodoFiles(me: Profile, todoId: string, assets: { uri: string; name: string; mimeType?: string | null; size?: number | null }[]) {
  let n = 0; for (const a of assets) if (await uploadOne(me, todoId, a)) n++;
  return n;
}

export async function addTodo(me: Profile, siteId: string, siteName: string, f: { text: string; comment: string; date: string | null; pm: Pm | null; files: { uri: string; name: string; mimeType?: string | null; size?: number | null }[] }): Promise<boolean> {
  const general = siteId === 'general';
  const r = await db.from('todos').insert({ site_id: general ? null : siteId, org_id: me.org_id, text: f.text, assigned_to: f.pm?.id ?? null, date_required_by: f.date, created_by: me.id } as never).select('id').single();
  const row = r.data as { id: string } | null;
  if (r.error || !row) return false;
  if (f.comment) await db.from('todo_comments').insert({ todo_id: row.id, body: f.comment, created_by: me.id } as never);
  if (f.files.length && !general) await uploadTodoFiles(me, row.id, f.files);
  if (f.pm && !general) {
    tellManagers(me, siteId, `${siteName}: New to-do assigned to ${f.pm.name}: ${f.text}`);
    void supabase.functions.invoke('notify-todo-assigned', { body: { site_id: siteId, todo_id: row.id, user_id: f.pm.id } }).catch(() => undefined);
  }
  return true;
}

export const setTodoDone = async (id: string, done: boolean) => !!(await db.from('todos').update({ done } as never).eq('id', id).select('id')).data?.length;
export const editTodo = async (id: string, text: string, date: string | null) => !!(await db.from('todos').update({ text, date_required_by: date } as never).eq('id', id).select('id')).data?.length;
export async function assignTodo(me: Profile, siteId: string, siteName: string, t: Todo, pm: Pm | null) {
  const ok = !!(await db.from('todos').update({ assigned_to: pm?.id ?? null } as never).eq('id', t.id).select('id')).data?.length;
  if (ok && pm) tellManagers(me, siteId, `${siteName}: To-do assigned to ${pm.name}: ${t.text}`);
  return ok;
}
export const addComment = async (me: Profile, todoId: string, body: string) => !(await db.from('todo_comments').insert({ todo_id: todoId, body, created_by: me.id } as never)).error;
export async function deleteTodo(me: Profile, siteId: string, t: Todo) {
  const r = mustHit(await db.from('todos').delete().eq('id', t.id).select('id'));
  if (!r.error && me.org_id && siteId !== 'general') void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'todo_deleted', description: `Deleted to-do "${t.text || ''}"` } as never).then(undefined, () => undefined);
  return !r.error;
}
export async function deleteTodoFile(f: TodoFile) {
  const r = mustHit(await db.from('todo_attachments').delete().eq('id', f.id).select('id'));
  if (!r.error) void supabase.storage.from('todo-attachments').remove([f.storage_path]).catch(() => undefined);
  return !r.error;
}
export async function todoFileUrl(f: TodoFile) {
  return (await invokeAsUser<{ url: string }>('todo-attachment-access', { todo_id: f.todo_id, storage_path: f.storage_path })).data?.url ?? null;
}

/** Emails the live list (or just the ticked ones) to the chosen PMs, optionally copying the client contact. */
export async function emailTodos(siteId: string, recipientIds: string[], todoIds: string[] | null, clientCc: string | null): Promise<string | null> {
  try {
    const r = await supabase.functions.invoke('send-todo-email', { body: { site_id: siteId, recipient_ids: recipientIds, todo_ids: todoIds || undefined, client_cc_email: clientCc } });
    const err = (r.data as { error?: string } | null)?.error || (r.error ? 'try again.' : '');
    return err ? `Email failed — ${err}` : null;
  } catch { return 'Could not send email.'; }
}
