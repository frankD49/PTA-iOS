begin;

create or replace function public.enforce_chat_compliance() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or new.user_id<>auth.uid() or not public.is_approved_member() or not public.is_active_account(auth.uid()) or not public.has_current_legal_acceptance(auth.uid()) then
    raise exception 'Current legal acceptance and an active approved account are required' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_chat_compliance_trigger on public.chat_messages;
create trigger enforce_chat_compliance_trigger before insert on public.chat_messages for each row execute function public.enforce_chat_compliance();

create or replace function public.enforce_pta_upload_compliance() returns trigger language plpgsql security definer set search_path=public,storage as $$
begin
  if new.bucket_id='pta_uploads' and (
    auth.uid() is null or (storage.foldername(new.name))[2]<>auth.uid()::text
    or not public.is_approved_member() or not public.is_active_account(auth.uid()) or not public.has_current_legal_acceptance(auth.uid())
  ) then raise exception 'Current legal acceptance and an active approved account are required' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_pta_upload_compliance_trigger on storage.objects;
create trigger enforce_pta_upload_compliance_trigger before insert on storage.objects for each row execute function public.enforce_pta_upload_compliance();

commit;

