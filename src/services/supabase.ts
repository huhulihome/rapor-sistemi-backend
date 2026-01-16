import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
