begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

do $$ begin
  if not exists(select 1 from vault.secrets where name='project_url') then
    perform vault.create_secret('https://pvhfkjinyrgxakvsoblp.supabase.co','project_url','Supabase project URL for scheduled functions');
  end if;
  if not exists(select 1 from vault.secrets where name='compliance_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'compliance_cron_secret','Authentication token for compliance cron');
  end if;
end $$;

create or replace function public.verify_compliance_cron_secret(candidate text)
returns boolean language sql stable security definer set search_path=vault as $$
  select candidate is not null and exists(select 1 from vault.decrypted_secrets where name='compliance_cron_secret' and decrypted_secret=candidate);
$$;
revoke all on function public.verify_compliance_cron_secret(text) from public,anon,authenticated;
grant execute on function public.verify_compliance_cron_secret(text) to service_role;

alter table public.account_deletion_requests
  add column if not exists processing_step text not null default 'queued',
  add column if not exists target_user_id uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists failure_reported_at timestamptz;

update public.account_deletion_requests set target_user_id=user_id where target_user_id is null and user_id is not null;

alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_processing_step_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_processing_step_check
  check (processing_step in ('queued','profile_anonymized','media_deleted','compliance_deleted','auth_deleted','complete','failed'));

create index if not exists account_deletion_due_idx
  on public.account_deletion_requests (next_attempt_at, scheduled_for)
  where status in ('pending','processing');

create or replace function public.claim_due_account_deletions(batch_size integer default 25)
returns setof public.account_deletion_requests
language plpgsql security definer set search_path=public as $$
begin
  return query
  with due as (
    select id from public.account_deletion_requests
    where status in ('pending','processing')
      and scheduled_for <= now()
      and coalesce(next_attempt_at,scheduled_for) <= now()
      and attempt_count < 10
    order by coalesce(next_attempt_at,scheduled_for)
    for update skip locked limit greatest(1,least(batch_size,100))
  ), claimed as (
    update public.account_deletion_requests r
       set status='processing', attempt_count=attempt_count+1,
           last_attempt_at=now(), last_error=null
      from due where r.id=due.id returning r.*
  ) select * from claimed;
end;
$$;
revoke all on function public.claim_due_account_deletions(integer) from public,anon,authenticated;
grant execute on function public.claim_due_account_deletions(integer) to service_role;

create or replace function public.record_deletion_failure(request_id uuid, failure text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.account_deletion_requests
     set last_error=left(failure,2000), processing_step=case when attempt_count>=10 then 'failed' else processing_step end,
         next_attempt_at=case when attempt_count>=10 then null else now() + make_interval(mins => least(1440, power(2,greatest(attempt_count,1))::integer)) end,
         failure_reported_at=case when attempt_count>=10 then now() else failure_reported_at end
   where id=request_id and status='processing';
end;
$$;
revoke all on function public.record_deletion_failure(uuid,text) from public,anon,authenticated;
grant execute on function public.record_deletion_failure(uuid,text) to service_role;

update storage.buckets set public=false where id='pta_uploads';

drop policy if exists "approved members read PTA media" on storage.objects;
create policy "approved members read PTA media" on storage.objects for select to authenticated using (
  bucket_id='pta_uploads' and public.is_approved_member() and public.is_active_account(auth.uid())
);
drop policy if exists "owners delete PTA media" on storage.objects;
create policy "owners delete PTA media" on storage.objects for delete to authenticated using (
  bucket_id='pta_uploads' and (storage.foldername(name))[2]=auth.uid()::text and public.is_active_account(auth.uid())
);

create or replace function public.dispatch_due_account_deletions()
returns void language plpgsql security definer set search_path=public,vault,extensions as $$
declare project_url text; cron_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='project_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name='compliance_cron_secret';
  if project_url is null or cron_secret is null then
    raise warning 'Deletion cron not dispatched: Vault secrets project_url/compliance_cron_secret are required';
    return;
  end if;
  perform net.http_post(
    url := rtrim(project_url,'/') || '/functions/v1/compliance-operations',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',cron_secret),
    body := '{"action":"processDueDeletions","batchSize":25}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.dispatch_due_account_deletions() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from cron.job where jobname='process-due-account-deletions') then
    perform cron.unschedule('process-due-account-deletions');
  end if;
  perform cron.schedule('process-due-account-deletions','*/10 * * * *','select public.dispatch_due_account_deletions()');
end $$;

commit;
