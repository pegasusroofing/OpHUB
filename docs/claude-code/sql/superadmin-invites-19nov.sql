-- Applied 19 Nov 2026 (additive, read-only): the platform owner can see every company's invites, so Platform Admin
-- can show a new company's waiting admin invite with Email Invite (Andy: "nothing in emails").
create policy "superadmin view all invites" on public.invites for select to authenticated using ((select public.is_superadmin()));
