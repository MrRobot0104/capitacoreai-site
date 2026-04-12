-- Allow users to update their own profile (name, username only)
-- Run this in Supabase SQL Editor

create policy "Users update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
