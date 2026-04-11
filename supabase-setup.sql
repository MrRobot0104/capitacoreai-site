-- ============================================
-- CapitaCoreAI / DashPilot - Database Setup
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================

-- Profiles table (linked to Supabase Auth)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  token_balance integer default 0,
  created_at timestamptz default now()
);

-- Purchase history
create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  package text not null,
  tokens_purchased integer not null,
  amount_cents integer not null,
  stripe_session_id text unique,
  created_at timestamptz default now()
);

-- Dashboard generation log
create table usage_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  prompt text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table usage_log enable row level security;

-- RLS: Users can only read their own data
create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users read own transactions" on transactions for select using (auth.uid() = user_id);
create policy "Users read own usage" on usage_log for select using (auth.uid() = user_id);

-- Auto-create profile when user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Atomic token deduction (prevents race conditions)
create function public.deduct_token(user_uuid uuid)
returns integer as $$
declare
  current_balance integer;
begin
  select token_balance into current_balance
  from profiles where id = user_uuid for update;

  if current_balance is null or current_balance <= 0 then
    return -1;
  end if;

  update profiles set token_balance = token_balance - 1 where id = user_uuid;

  insert into usage_log (user_id) values (user_uuid);

  return current_balance - 1;
end;
$$ language plpgsql security definer;

-- Credit tokens after purchase
create function public.credit_tokens(user_uuid uuid, amount integer)
returns void as $$
begin
  update profiles set token_balance = token_balance + amount where id = user_uuid;
end;
$$ language plpgsql security definer;
