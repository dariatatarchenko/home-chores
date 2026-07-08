import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bcojibvfncbficjvxjdo.supabase.co";
const ANON_KEY = "sb_publishable_X8gY4YCjNoWJSVsSsu-JAg_3btKyGF5";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { access_token } = req.body || {};
  if (!access_token) {
    res.status(400).json({ error: 'Missing access token' });
    return;
  }

  // Verify the caller really is who they claim to be, using their own session token
  const supabaseAsUser = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: userErr } = await supabaseAsUser.auth.getUser(access_token);
  if (userErr || !user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  // Now use the secret service_role key (only available server-side) to actually delete them
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Server misconfigured: missing service role key' });
    return;
  }
  const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey);
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (delErr) {
    res.status(500).json({ error: delErr.message });
    return;
  }

  res.status(200).json({ success: true });
}
