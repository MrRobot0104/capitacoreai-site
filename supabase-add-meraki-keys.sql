-- Encrypted Meraki API key storage for MerakiPilot
-- Keys are encrypted client-side with AES-256-GCM before reaching this table.
-- The server NEVER sees the raw API key.

CREATE TABLE IF NOT EXISTS meraki_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,                -- org name or user-chosen label
  org_id text,                        -- Meraki org ID for reference
  encrypted_key text NOT NULL,        -- AES-256-GCM encrypted, base64 encoded
  salt text NOT NULL,                 -- PBKDF2 salt, base64 encoded
  iv text NOT NULL,                   -- AES-GCM IV, base64 encoded
  key_hint text,                      -- last 4 chars of raw key (for identification)
  created_at timestamptz DEFAULT now()
);

-- RLS: users can only access their own keys
ALTER TABLE meraki_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own keys" ON meraki_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own keys" ON meraki_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own keys" ON meraki_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Service key can manage all (for admin operations)
CREATE POLICY "Service key full access" ON meraki_keys
  FOR ALL USING (auth.role() = 'service_role');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_meraki_keys_user_id ON meraki_keys(user_id);
