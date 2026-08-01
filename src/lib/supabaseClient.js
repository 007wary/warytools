import { createClient } from "@supabase/supabase-js";

// Public anon client — safe to use in the browser. Row-level security on
// the `short_urls` table controls what operations are actually allowed.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
