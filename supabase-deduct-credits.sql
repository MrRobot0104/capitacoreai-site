-- Multi-credit deduction function (run this in Supabase SQL Editor)
-- Deducts N credits atomically. Returns new balance or -1 if insufficient.

create or replace function public.deduct_credits(user_uuid uuid, amount integer default 1)
returns integer as $$
declare
  current_balance integer;
begin
  select token_balance into current_balance
  from profiles where id = user_uuid for update;

  if current_balance is null or current_balance < amount then
    return -1;
  end if;

  update profiles set token_balance = token_balance - amount where id = user_uuid;

  insert into usage_log (user_id) values (user_uuid);

  return current_balance - amount;
end;
$$ language plpgsql security definer;
