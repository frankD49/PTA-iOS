begin;

create extension if not exists pgcrypto;

create table if not exists public.legal_documents (
  document_type text primary key check (document_type in ('terms','privacy','community_guidelines')),
  current_version text not null,
  public_path text not null,
  required boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.legal_documents (document_type,current_version,public_path,required) values
  ('terms','2026-08-15','legal/terms.html',true),
  ('privacy','2026-08-15','legal/privacy.html',true),
  ('community_guidelines','2026-08-15','legal/community-guidelines.html',true)
on conflict (document_type) do update set current_version=excluded.current_version, public_path=excluded.public_path, required=excluded.required, updated_at=now();

create table if not exists public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null references public.legal_documents(document_type),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id,document_type,document_version)
);

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended','deletion_pending')),
  reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

alter table public.chat_messages add column if not exists moderation_status text not null default 'visible' check (moderation_status in ('visible','hidden','removed'));
alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.chat_messages add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.chat_messages alter column user_id drop not null;
alter table public.chat_messages drop constraint if exists chat_messages_user_id_fkey;
alter table public.chat_messages add constraint chat_messages_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  message_id bigint references public.chat_messages(id) on delete set null,
  reason text not null check (reason in ('harassment','sexual_content','child_safety','privacy','spam_impersonation','illegal_content','school_confidentiality','other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  moderator_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists content_reports_status_created_idx on public.content_reports(status,created_at);
create index if not exists content_reports_reporter_idx on public.content_reports(reporter_id);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '14 days'),
  completed_at timestamptz,
  unique(user_id,status)
);

create or replace function public.is_compliance_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean,false)
    or lower(coalesce(auth.jwt()->>'email','')) = any(array['precioustotsacademy@outlook.com','precioustotsacademy@gmail.com','admin@precioustotsacademy.com','2frankincense4m@gmail.com']);
$$;

create or replace function public.has_current_legal_acceptance(uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select not exists (
    select 1 from public.legal_documents d where d.required and not exists (
      select 1 from public.legal_acceptances a where a.user_id=uid and a.document_type=d.document_type and a.document_version=d.current_version));
$$;

create or replace function public.is_active_account(uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select status='active' from public.account_status where user_id=uid),true);
$$;

create or replace function public.is_approved_member() returns boolean language sql stable as $$
  select public.is_compliance_admin() or coalesce(auth.jwt()->'app_metadata'->>'invite_status','')='approved';
$$;

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.account_status enable row level security;
alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy "legal documents are public" on public.legal_documents for select using (true);
create policy "users read own acceptances" on public.legal_acceptances for select to authenticated using (user_id=auth.uid() or public.is_compliance_admin());
create policy "users accept current documents" on public.legal_acceptances for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.legal_documents d where d.document_type=legal_acceptances.document_type and d.current_version=legal_acceptances.document_version));
create policy "users read own account status" on public.account_status for select to authenticated using (user_id=auth.uid() or public.is_compliance_admin());
create policy "users manage own blocks" on public.user_blocks for all to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
create policy "reporters and admins read reports" on public.content_reports for select to authenticated using (reporter_id=auth.uid() or public.is_compliance_admin());
create policy "members create reports" on public.content_reports for insert to authenticated with check (reporter_id=auth.uid() and reported_user_id<>auth.uid() and public.is_approved_member() and public.is_active_account(auth.uid()));
create policy "admins update reports" on public.content_reports for update to authenticated using (public.is_compliance_admin()) with check (public.is_compliance_admin());
create policy "users read own deletion requests" on public.account_deletion_requests for select to authenticated using (user_id=auth.uid() or public.is_compliance_admin());

drop policy if exists "authenticated users read chat" on public.chat_messages;
drop policy if exists "users send own messages" on public.chat_messages;
create policy "members read visible unblocked chat" on public.chat_messages for select to authenticated using (
  public.is_approved_member() and public.is_active_account(auth.uid()) and (moderation_status='visible' or user_id=auth.uid() or public.is_compliance_admin())
  and not exists(select 1 from public.user_blocks b where b.blocker_id=auth.uid() and b.blocked_user_id=chat_messages.user_id));
create policy "accepted active members send chat" on public.chat_messages for insert to authenticated with check (
  auth.uid()=user_id and public.is_approved_member() and public.is_active_account(auth.uid()) and public.has_current_legal_acceptance(auth.uid()));

grant select on public.legal_documents to anon,authenticated;
grant select,insert on public.legal_acceptances to authenticated;
grant select on public.account_status to authenticated;
grant select,insert on public.content_reports to authenticated;
grant select,insert,delete on public.user_blocks to authenticated;
grant select on public.account_deletion_requests to authenticated;

-- Storage uploads are restricted to accepted, active users and their own folder.
drop policy if exists "accepted members upload PTA media" on storage.objects;
create policy "accepted members upload PTA media" on storage.objects for insert to authenticated with check (
  bucket_id='pta_uploads' and (storage.foldername(name))[2]=auth.uid()::text
  and public.is_approved_member() and public.is_active_account(auth.uid()) and public.has_current_legal_acceptance(auth.uid()));

commit;
