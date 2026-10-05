-- P24 transaction metadata only. Document contents and private case data never enter this table.
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(), user_id text not null references public.app_users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254), session_id text not null unique check (char_length(session_id) between 8 and 100),
  amount integer not null check (amount > 0), currency text not null check (currency = 'PLN'), merchant_id integer not null check (merchant_id > 0), pos_id integer not null check (pos_id > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')), p24_token text, p24_order_id bigint, created_at timestamptz not null default now(), paid_at timestamptz
);
create index if not exists payment_orders_user_id_idx on public.payment_orders(user_id);
create index if not exists payment_orders_status_idx on public.payment_orders(status);
alter table public.payment_orders enable row level security;
revoke all on table public.payment_orders from anon, authenticated;
