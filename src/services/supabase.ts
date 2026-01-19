import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Create Supabase client with service role key
// Service role key should bypass RLS policies
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-supabase-role': 'service_role',
      },
    },
  }
);

// Log confirmation at startup
console.log('Supabase client initialized with service role key:', config.supabase.serviceKey ? 'Key present' : 'KEY MISSING!');
