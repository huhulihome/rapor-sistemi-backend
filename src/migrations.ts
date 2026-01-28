// Auto-migration script that runs on server startup
// Uses existing Supabase service key to create tables
import { createClient } from '@supabase/supabase-js';
import { config } from './config/index.js';

const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export async function runMigrations() {
    console.log('Checking for pending migrations...');

    try {
        // Check if todos table exists
        const { error: checkError } = await supabase
            .from('todos')
            .select('id')
            .limit(1);

        if (checkError && checkError.message.includes('does not exist')) {
            console.log('❌ The "todos" table does not exist.');
            console.log('📋 Please run the SQL migration in Supabase Dashboard > SQL Editor:');
            console.log('   File: supabase/migrations/009_todos_table.sql');
            console.log('   URL: https://supabase.com/dashboard/project/hyhazfecabmugxkpkutm/sql/new');
            return false;
        } else if (checkError) {
            console.log('⚠️ Could not check todos table:', checkError.message);
            return false;
        } else {
            console.log('✅ The "todos" table exists.');
            return true;
        }
    } catch (err) {
        console.error('Migration check error:', err instanceof Error ? err.message : err);
        return false;
    }
}
