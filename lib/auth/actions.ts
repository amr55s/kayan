'use server';

import { z } from 'zod';
import { authEmailForPhone, normalizeEgyptianPhone } from '@/lib/auth/phone';
import { dashboardPathForRole, type AppRole } from '@/lib/auth/routes';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type LoginResult =
  | { success: true; destination: string }
  | { success: false; message: string };

const loginSchema = z.object({
  phone: z
    .string()
    .transform(normalizeEgyptianPhone)
    .refine((value) => /^01[0125][0-9]{8}$/.test(value)),
  password: z.string().min(1).max(128),
});

const passwordSchema = z.string().min(12).max(128);

async function safelySignOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // A failed cleanup must not replace the useful login error shown to the user.
  }
}

async function resolveAuthenticatedDestination(userId: string): Promise<LoginResult> {
  const admin = createAdminClient();
  const { data: profile, error } = await (admin as any)
    .from('profiles')
    .select('id, role, phone, is_active, must_change_password')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    await safelySignOut();
    return {
      success: false,
      message: 'تعذر التحقق من الحساب مؤقتًا. حاول مرة أخرى بدون إعادة تحميل الصفحة.',
    };
  }

  if (!profile) {
    const { data: request } = await (admin as any)
      .from('account_requests')
      .select('status, rejection_reason')
      .eq('auth_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    await safelySignOut();

    if (request?.status === 'pending') {
      return { success: false, message: 'طلب الحساب ما زال قيد مراجعة الإدارة.' };
    }
    if (request?.status === 'rejected') {
      return {
        success: false,
        message: request.rejection_reason || 'تم رفض طلب الحساب. تواصل مع الإدارة.',
      };
    }
    return {
      success: false,
      message: 'حساب الدخول موجود لكن ملفه التشغيلي غير مكتمل. تواصل مع الإدارة لإصلاحه.',
    };
  }

  if (!profile.is_active) {
    await safelySignOut();
    return { success: false, message: 'الحساب غير مفعل. تواصل مع الإدارة لتفعيله.' };
  }

  if (profile.role === 'driver') {
    const { data: driverProfile, error: driverLookupError } = await (admin as any)
      .from('driver_profiles')
      .select('profile_id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (driverLookupError) {
      await safelySignOut();
      return {
        success: false,
        message: 'تعذر تجهيز مساحة الكابتن مؤقتًا. حاول تسجيل الدخول مرة أخرى.',
      };
    }

    if (!driverProfile) {
      const { error: repairError } = await (admin as any)
        .from('driver_profiles')
        .insert({
          profile_id: userId,
          contact_phone: profile.phone,
          whatsapp: profile.phone,
        });
      if (repairError && repairError.code !== '23505') {
        await safelySignOut();
        return {
          success: false,
          message: 'تعذر ربط مساحة الكابتن تلقائيًا. استخدم زر التنشيط في لوحة الإدارة.',
        };
      }
    }
  }

  return {
    success: true,
    destination: profile.must_change_password
      ? '/login?change-password=1'
      : dashboardPathForRole(profile.role as AppRole),
  };
}

export async function loginWithPhone(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: 'أدخل رقم هاتف مصري وكلمة مرور صحيحين.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmailForPhone(parsed.data.phone),
      password: parsed.data.password,
    });
    if (error || !data.user) {
      return { success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة.' };
    }
    return resolveAuthenticatedDestination(data.user.id);
  } catch (error) {
    console.error('Server-side phone login failed:', error);
    return {
      success: false,
      message: 'تعذر الاتصال بخدمة الدخول. بياناتك محفوظة؛ حاول مرة أخرى.',
    };
  }
}

export async function completeInitialPassword(password: string): Promise<LoginResult> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { success: false, message: 'كلمة المرور يجب أن تتكون من 12 حرفًا على الأقل.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: 'انتهت الجلسة. سجل الدخول مرة أخرى.' };
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: parsed.data,
    });
    if (passwordError) throw passwordError;

    const admin = createAdminClient();
    const { error: profileError } = await (admin as any)
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);
    if (profileError) throw profileError;

    return resolveAuthenticatedDestination(user.id);
  } catch (error) {
    console.error('Initial password completion failed:', error);
    return {
      success: false,
      message: 'تعذر حفظ كلمة المرور مؤقتًا. حاول مرة أخرى دون مغادرة الصفحة.',
    };
  }
}
