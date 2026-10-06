-- Synthetic integration scenario. Run against local/staging PostgreSQL only.
-- Transaction rollback leaves no test accounts or credentials behind.
begin;
insert into public.app_users(id,name,email,email_normalized,password_hash,password_salt)
values ('recovery-test-a','Test A','a@example.test','a@example.test',repeat('a',128),repeat('a',32)),
       ('recovery-test-b','Test B','b@example.test','b@example.test',repeat('b',128),repeat('b',32));
insert into public.sync_records(record_id,user_id,payload) values('recovery-test-envelope','recovery-test-a','{"ciphertext":"opaque-synthetic"}');
grant select on public.sync_records to service_role;
set local role service_role;

do $$
declare accepted boolean;
begin
  if public.take_app_auth_rate_limit(repeat('e',64),2,900) <> 0
    or public.take_app_auth_rate_limit(repeat('e',64),2,900) <> 0
    or public.take_app_auth_rate_limit(repeat('e',64),2,900) <= 0 then raise exception 'Shared rate limiter failed'; end if;
  accepted := public.issue_app_account_token('recovery-test-a','verify_email',repeat('1',64),now()+interval '24 hours');
  if not accepted then raise exception 'Verification issue failed'; end if;
  accepted := public.consume_app_account_token(repeat('1',64),'verify_email','recovery-test-b',null,null);
  if accepted then raise exception 'Cross-account verification accepted'; end if;
  accepted := public.consume_app_account_token(repeat('1',64),'verify_email','recovery-test-a',null,null);
  if not accepted then raise exception 'Own verification failed'; end if;
  if (select email_verified_at is null from public.app_users where id='recovery-test-a') then raise exception 'Verification not persisted'; end if;
  if public.consume_app_account_token(repeat('1',64),'verify_email','recovery-test-a',null,null) then raise exception 'Verification replay accepted'; end if;

  if not public.create_app_session('recovery-test-a','session-a1',now()+interval '30 days',0)
    or not public.create_app_session('recovery-test-a','session-a2',now()+interval '30 days',0)
    or not public.create_app_session('recovery-test-b','session-b1',now()+interval '30 days',0) then raise exception 'Session creation failed'; end if;
  if not public.rotate_app_sessions('session-a1','session-a-new',now()+interval '30 days') then raise exception 'Rotation failed'; end if;
  if (select count(*) from public.app_sessions where user_id='recovery-test-a') <> 1 then raise exception 'Rotation failed to revoke all old sessions'; end if;
  if public.rotate_app_sessions('session-a1','bad-replay',now()+interval '30 days') then raise exception 'Old session replay accepted'; end if;

  if not public.issue_app_account_token('recovery-test-a','reset_password',repeat('2',64),now()+interval '30 minutes') then raise exception 'Reset issue failed'; end if;
  if public.issue_app_account_token('recovery-test-a','reset_password',repeat('3',64),now()+interval '30 minutes') then raise exception 'Resend cooldown bypassed'; end if;
  if not public.consume_app_account_token(repeat('2',64),'reset_password',null,repeat('c',128),repeat('c',32)) then raise exception 'Reset failed'; end if;
  if exists(select 1 from public.app_sessions where user_id='recovery-test-a') then raise exception 'Reset left an active session'; end if;
  if not exists(select 1 from public.app_sessions where user_id='recovery-test-b') then raise exception 'Other account was logged out'; end if;
  if public.create_app_session('recovery-test-a','stale-login',now()+interval '30 days',0) then raise exception 'Stale credentials created a session'; end if;
  if not public.create_app_session('recovery-test-a','new-login',now()+interval '30 days',1) then raise exception 'New credentials cannot create a session'; end if;
  if public.consume_app_account_token(repeat('2',64),'reset_password',null,repeat('d',128),repeat('d',32)) then raise exception 'Reset replay accepted'; end if;
  if (select payload->>'ciphertext' from public.sync_records where record_id='recovery-test-envelope') <> 'opaque-synthetic' then raise exception 'Reset changed vault envelope'; end if;
end;
$$;

insert into public.app_account_tokens(token_hash,user_id,purpose,expires_at)
values(repeat('4',64),'recovery-test-a','reset_password',now()-interval '1 second');
do $$ begin
  if public.consume_app_account_token(repeat('4',64),'reset_password',null,repeat('d',128),repeat('d',32)) then raise exception 'Expired token accepted'; end if;
end; $$;

set local role anon;
do $$ begin
  begin
    perform public.issue_app_account_token('recovery-test-a','reset_password',repeat('5',64),now()+interval '30 minutes');
    raise exception 'Anonymous role executed recovery RPC';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
