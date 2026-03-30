import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// NOTE: We intentionally avoid binding generated Database types here.
// In this codebase, schema/type drift caused PostgREST generics to collapse to `{}` and break `tsc`.
// Runtime behavior is unchanged; typing can be reintroduced once database.types.ts matches Supabase output.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
