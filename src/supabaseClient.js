import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bcojibvfncbficjvxjdo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_X8gY4YCjNoWJSVsSsu-JAg_3btKyGF5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
