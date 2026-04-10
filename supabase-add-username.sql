-- ============================================
-- Add first_name and username to profiles
-- Run this in Supabase SQL Editor
-- ============================================

-- Add columns
alter table profiles add column first_name text;
alter table profiles add column username text;

-- Unique constraint on username (prevents duplicates)
create unique index profiles_username_unique on profiles (lower(username));

-- Update the trigger to save name/username from signup metadata
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, username)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    lower(new.raw_user_meta_data ->> 'username')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Function to check if username is available (callable from frontend)
create or replace function public.check_username_available(uname text)
returns boolean as $$
begin
  return not exists (select 1 from profiles where lower(username) = lower(uname));
end;
$$ language plpgsql security definer;
