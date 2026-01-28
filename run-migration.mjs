// Direct approach - use postgres module to run migration
import pg from 'pg';

const { Client } = pg;

const connectionString = 'postgres://postgres.hyhazfecabmugxkpkutm:CokZorBirSifre123%40@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const migrationSQL = `
-- Personal To-Do List table
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed_at TIMESTAMPTZ,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_is_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own todos') THEN
        CREATE POLICY "Users can view own todos" ON todos FOR SELECT
          USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own todos') THEN
        CREATE POLICY "Users can insert own todos" ON todos FOR INSERT
          WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own todos') THEN
        CREATE POLICY "Users can update own todos" ON todos FOR UPDATE
          USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own todos') THEN
        CREATE POLICY "Users can delete own todos" ON todos FOR DELETE
          USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
END $$;

COMMENT ON TABLE todos IS 'Personal to-do list for daily non-work tasks. Private to user and admin.';
`;

async function runMigration() {
  console.log('Connecting to Supabase PostgreSQL...');

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    console.log('Running migration...');
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('The todos table has been created with RLS policies.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.log('\n⚠️ Need correct database password from Supabase Dashboard > Settings > Database');
    }
  } finally {
    await client.end();
  }
}

runMigration();
