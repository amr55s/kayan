import { AdminWorkspace } from '@/components/operations/AdminWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export default async function AdminDashboard() {
  const profile = await requireProfile(['admin']);
  const supabase = await createClient();

  const [
    { data: merchants },
    { data: profiles },
    { data: orders },
    { data: branches },
    { data: places },
    { data: pendingRequests },
    { data: feedbackRequests },
    { data: drivers },
    { data: auditLog },
  ] = await Promise.all([
    (supabase as any)
      .from('merchants')
      .select('id, display_name, is_active')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('profiles')
      .select('id, display_name, phone, role, is_active, merchant_id, must_change_password')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('delivery_orders')
      .select('id, public_code, status, recipient_name, delivery_area, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    (supabase as any)
      .from('merchant_branches')
      .select('id, merchant_id, place_id, name, phone, address, area, is_default, is_active')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('places')
      .select('id, title, category, phone, whatsapp, instapay_vfcash, description, images, is_featured, created_at')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('pending_requests')
      .select('id, title, category, phone, whatsapp, instapay_vfcash, description, images, status, created_at')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('feedback_requests')
      .select('id, target_place_id, place_name_or_phone, feedback_type, source, submitted_by, rating, contact_phone, proposed_phone, proposed_title, proposed_category, proposed_whatsapp, proposed_instapay_vfcash, proposed_description, notes, images, proposed_images, status, created_at')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('drivers')
      .select('id, name, phone, whatsapp, vehicle_type, is_active, active_until, created_at')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('audit_log')
      .select('id, action, entity_type, entity_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <>
      <DashboardHeader displayName={profile.display_name} role="admin" />
      <AdminWorkspace
        merchants={merchants ?? []}
        profiles={profiles ?? []}
        orders={orders ?? []}
        branches={branches ?? []}
        places={places ?? []}
        pendingRequests={pendingRequests ?? []}
        feedbackRequests={feedbackRequests ?? []}
        drivers={drivers ?? []}
        auditLog={auditLog ?? []}
      />
    </>
  );
}
