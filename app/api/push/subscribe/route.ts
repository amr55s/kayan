import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ message: 'اشتراك Push غير صالح.' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ message: 'غير مصرح.' }, { status: 401 });
    const { error } = await (supabase as any).from('push_subscriptions').upsert({
      profile_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: request.headers.get('user-agent'),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ message: 'تعذر حفظ اشتراك الإشعارات.' }, { status: 500 });
  }
}
