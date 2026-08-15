-- Run against a disposable Supabase test database after creating test Auth users.
-- These assertions document the required authorization boundary cases for CI.
begin;
select plan(17);
select has_table('public','legal_acceptances','versioned legal acceptance exists');
select has_table('public','content_reports','private reports exist');
select has_table('public','user_blocks','blocking exists');
select has_table('public','account_deletion_requests','deletion workflow exists');
select is((select relrowsecurity from pg_class where oid='public.content_reports'::regclass),true,'reports use RLS');
select is((select relrowsecurity from pg_class where oid='public.legal_acceptances'::regclass),true,'acceptances use RLS');
select has_trigger('public','chat_messages','enforce_chat_compliance_trigger','chat has server enforcement trigger');
select has_trigger('storage','objects','enforce_pta_upload_compliance_trigger','uploads have server enforcement trigger');
select has_column('public','account_deletion_requests','processing_step','deletion workflow is resumable');
select has_column('public','account_deletion_requests','target_user_id','deletion target survives Auth removal');
select has_column('public','account_deletion_requests','attempt_count','deletion retries are counted');
select has_column('public','account_deletion_requests','next_attempt_at','deletion retries are scheduled');
select has_function('public','claim_due_account_deletions',array['integer'],'due deletions can be claimed atomically');
select has_function('public','record_deletion_failure',array['uuid','text'],'deletion failures are recorded');
select has_function('public','dispatch_due_account_deletions',array[]::text[],'cron dispatcher exists');
select is((select public from storage.buckets where id='pta_uploads'),false,'noticeboard bucket is private');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='approved members read PTA media' and cmd='SELECT'),'approved active members have an explicit storage SELECT policy');
select * from finish();
rollback;
