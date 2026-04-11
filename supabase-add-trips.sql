-- Create trips table for shareable trip URLs
CREATE TABLE IF NOT EXISTS trips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  title text,
  trip_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Allow service key full access
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can read (for shared trips)
CREATE POLICY "Trips are viewable by everyone" ON trips
  FOR SELECT USING (true);

-- Policy: service role can insert
CREATE POLICY "Service role can insert trips" ON trips
  FOR INSERT WITH CHECK (true);
