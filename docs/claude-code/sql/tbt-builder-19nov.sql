-- Toolbox Talk builder (applied by Claude on 19 Nov 2026 as migration tbt_builder_19nov). Adds only.
-- Andy, 19 Nov 2026: "create a tbt which mimics the existing designs in rtb roofing please. add it so we can have a
-- template to create". Admin › H&S › Toolbox Talks › + Create A Toolbox Talk makes a talk in RTB Roofing's layout and
-- saves it as a company template; `builder` keeps its wording so ✎ Edit can open it again, and admins may now change
-- their own company's templates (there was no update rule before: only add and remove).
alter table public.tbt_templates add column if not exists builder jsonb;
create policy "admin update tbt templates" on public.tbt_templates for update
  using ((select public.is_admin()) and org_id = (select public.my_org_id()))
  with check ((select public.is_admin()) and org_id = (select public.my_org_id()));
