import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const phone = process.env.ADMIN_BOOTSTRAP_PHONE?.replace(/\D/g, '').replace(/^20/, '0');
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const displayName = process.env.ADMIN_BOOTSTRAP_NAME || 'مدير كيان سيتي سبوت';
const email = `${phone}@users.kayanhub.app`;

if (!url || !serviceRoleKey || !phone || !password) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_BOOTSTRAP_PHONE, and ADMIN_BOOTSTRAP_PASSWORD.');
}
if (!/^01[0125]\d{8}$/.test(phone) || password.length < 12) {
  throw new Error('Use an Egyptian phone number and a password of at least 12 characters.');
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email,
  email_confirm: true,
  phone: `+2${phone}`,
  password,
  phone_confirm: true,
  user_metadata: { display_name: displayName },
});
if (authError || !authData.user) throw authError ?? new Error('Could not create the administrator.');

const { error: profileError } = await supabase.from('profiles').insert({
  id: authData.user.id,
  role: 'admin',
  phone,
  display_name: displayName,
  must_change_password: false,
});
if (profileError) {
  await supabase.auth.admin.deleteUser(authData.user.id);
  throw profileError;
}
console.log(`Administrator created: ${authData.user.id}`);
