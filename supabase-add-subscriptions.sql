-- News subscriptions for NewsPilot
CREATE TABLE IF NOT EXISTS news_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  prompt_text text NOT NULL,
  topics text[] DEFAULT '{}',
  schedule text DEFAULT 'weekly',
  active boolean DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE news_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subs" ON news_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subs" ON news_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own subs" ON news_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own subs" ON news_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service key full access" ON news_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_news_subs_user ON news_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_news_subs_active ON news_subscriptions(active) WHERE active = true;
