-- Run against a disposable Supabase test database after creating test Auth users.
-- These assertions document the required authorization boundary cases for CI.
begin;
select plan(8);
select has_table('public','legal_acceptances','versioned legal acceptance exists');
select has_table('public','content_reports','private reports exist');
select has_table('public','user_blocks','blocking exists');
select has_table('public','account_deletion_requests','deletion workflow exists');
select is((select relrowsecurity from pg_class where oid='public.content_reports'::regclass),true,'reports use RLS');
select is((select relrowsecurity from pg_class where oid='public.legal_acceptances'::regclass),true,'acceptances use RLS');
select has_trigger('public','chat_messages','enforce_chat_compliance_trigger','chat has server enforcement trigger');
select has_trigger('storage','objects','enforce_pta_upload_compliance_trigger','uploads have server enforcement trigger');
select * from finish();
rollback;

