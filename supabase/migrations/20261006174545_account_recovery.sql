-- All operations run through the server-only service role. No vault material.
alter table public.app_users add column if not exists email_verified_at timestamptz;
alter table public.app_users add column if not exists credential_version bigint not null default 0;
grant select,insert,update,delete on public.app_users,public.app_sessions to service_role;

create table if not exists public.app_account_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text not null references public.app_users(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, purpose)
);
create index if not exists app_account_tokens_expiry_idx on public.app_account_tokens(expires_at);
alter table public.app_account_tokens enable row level security;
revoke all on table public.app_account_tokens from public, anon, authenticated;
grant all on table public.app_account_tokens to service_role;

create table if not exists public.app_auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  request_count integer not null,
  reset_at timestamptz not null
);
create index if not exists app_auth_rate_limits_reset_idx on public.app_auth_rate_limits(reset_at);
alter table public.app_auth_rate_limits enable row level security;
revoke all on table public.app_auth_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.app_auth_rate_limits to service_role;

create or replace function public.take_app_auth_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer; v_reset timestamptz;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid limiter configuration';
  end if;
  delete from public.app_auth_rate_limits where reset_at < now()-interval '1 day';
  insert into public.app_auth_rate_limits(key_hash,request_count,reset_at)
  values(p_key,1,now()+p_window_seconds*interval '1 second')
  on conflict(key_hash) do update set
    request_count = case when public.app_auth_rate_limits.reset_at <= now() then 1 else public.app_auth_rate_limits.request_count+1 end,
    reset_at = case when public.app_auth_rate_limits.reset_at <= now() then now()+p_window_seconds*interval '1 second' else public.app_auth_rate_limits.reset_at end
  returning request_count,reset_at into v_count,v_reset;
  if v_count <= p_limit then return 0; end if;
  return greatest(1,ceil(extract(epoch from(v_reset-now())))::integer);
end;
$$;

create or replace function public.issue_app_account_token(
  p_user_id text, p_purpose text, p_token_hash text, p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.app_users where id = p_user_id for update;
  if not found then return false; end if;
  if p_purpose not in ('verify_email', 'reset_password')
    or p_expires_at <= now() or p_expires_at > now() + interval '24 hours 1 minute' then return false; end if;
  if exists(select 1 from public.app_account_tokens where user_id = p_user_id and purpose = p_purpose
    and created_at > now() - interval '60 seconds') then return false; end if;
  delete from public.app_account_tokens where user_id = p_user_id and purpose = p_purpose;
  insert into public.app_account_tokens(token_hash,user_id,purpose,expires_at)
    values(p_token_hash,p_user_id,p_purpose,p_expires_at);
  return true;
end;
$$;

create or replace function public.consume_app_account_token(
  p_token_hash text, p_purpose text, p_expected_user_id text, p_password_hash text, p_password_salt text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id text;
begin
  select user_id into v_user_id from public.app_account_tokens where token_hash = p_token_hash;
  if v_user_id is null then return false; end if;
  -- User row is the common lock for reset, issuing codes and creating sessions.
  perform 1 from public.app_users where id = v_user_id for update;
  perform 1 from public.app_account_tokens where token_hash = p_token_hash and purpose = p_purpose
    and expires_at > now() and (p_expected_user_id is null or user_id = p_expected_user_id) for update;
  if not found then return false; end if;
  if p_purpose = 'verify_email' then
    if p_expected_user_id is null then return false; end if;
    update public.app_users set email_verified_at = coalesce(email_verified_at,now()) where id = v_user_id;
    delete from public.app_account_tokens where token_hash = p_token_hash;
  elsif p_purpose = 'reset_password' then
    if p_password_hash is null or p_password_hash !~ '^[a-f0-9]{128}$'
      or p_password_salt is null or p_password_salt !~ '^[a-f0-9]{32}$' then return false; end if;
    update public.app_users set password_hash = p_password_hash, password_salt = p_password_salt,
      email_verified_at = coalesce(email_verified_at,now()), credential_version = credential_version + 1 where id = v_user_id;
    delete from public.app_sessions where user_id = v_user_id;
    delete from public.app_account_tokens where user_id = v_user_id;
  else return false;
  end if;
  return true;
end;
$$;

create or replace function public.create_app_session(
  p_user_id text, p_token_hash text, p_expires_at timestamptz, p_expected_credential_version bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_version bigint;
begin
  select credential_version into v_version from public.app_users where id = p_user_id for update;
  if v_version is null or (p_expected_credential_version is not null and v_version <> p_expected_credential_version)
    or p_expires_at <= now() then return false; end if;
  insert into public.app_sessions(token_hash,user_id,expires_at) values(p_token_hash,p_user_id,p_expires_at);
  return true;
end;
$$;

create or replace function public.rotate_app_sessions(
  p_current_token_hash text, p_new_token_hash text, p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_user_id text;
begin
  select user_id into v_user_id from public.app_sessions where token_hash = p_current_token_hash;
  if v_user_id is null or p_expires_at <= now() then return false; end if;
  perform 1 from public.app_users where id = v_user_id for update;
  perform 1 from public.app_sessions where token_hash = p_current_token_hash and expires_at > now() for update;
  if not found then return false; end if;
  delete from public.app_sessions where user_id = v_user_id;
  insert into public.app_sessions(token_hash,user_id,expires_at) values(p_new_token_hash,v_user_id,p_expires_at);
  return true;
end;
$$;

revoke execute on function public.issue_app_account_token(text,text,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.consume_app_account_token(text,text,text,text,text) from public,anon,authenticated;
revoke execute on function public.create_app_session(text,text,timestamptz,bigint) from public,anon,authenticated;
revoke execute on function public.rotate_app_sessions(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_app_account_token(text,text,text,timestamptz) to service_role;
grant execute on function public.consume_app_account_token(text,text,text,text,text) to service_role;
grant execute on function public.create_app_session(text,text,timestamptz,bigint) to service_role;
grant execute on function public.rotate_app_sessions(text,text,timestamptz) to service_role;
revoke execute on function public.take_app_auth_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.take_app_auth_rate_limit(text,integer,integer) to service_role;
