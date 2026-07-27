-- ====================================================================
-- KAYAN HUB - PERMISSIONS & SUBMISSIONS FIX (fix_permissions.sql)
-- Execute this complete script in the Supabase SQL Editor.
-- ====================================================================

-- 1. Ensure RLS is enabled on all tables
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

-- 2. RESET POLICIES FOR PENDING REQUESTS (إضافة مكان/خدمة جديدة)
DROP POLICY IF EXISTS "Allow anon insert for pending_requests" ON public.pending_requests;
CREATE POLICY "Allow anon insert for pending_requests"
ON public.pending_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admin select/all for pending_requests" ON public.pending_requests;
CREATE POLICY "Allow admin select/all for pending_requests"
ON public.pending_requests FOR ALL TO anon, authenticated USING (true);

-- 3. RESET POLICIES FOR FEEDBACK & MENU REQUESTS (طلبات التعديل والمنيو)
DROP POLICY IF EXISTS "Allow anon insert for feedback_requests" ON public.feedback_requests;
CREATE POLICY "Allow anon insert for feedback_requests"
ON public.feedback_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admin select/all for feedback_requests" ON public.feedback_requests;
CREATE POLICY "Allow admin select/all for feedback_requests"
ON public.feedback_requests FOR ALL TO anon, authenticated USING (true);

-- 4. RESET POLICIES FOR DRIVERS (تسجيل وتجديد الكباتن)
DROP POLICY IF EXISTS "Allow anon insert for drivers" ON public.drivers;
CREATE POLICY "Allow anon insert for drivers"
ON public.drivers FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update active status for drivers" ON public.drivers;
CREATE POLICY "Allow anon update active status for drivers"
ON public.drivers FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public read active drivers" ON public.drivers;
CREATE POLICY "Allow public read active drivers"
ON public.drivers FOR SELECT TO anon, authenticated USING (true);

-- 5. RESET POLICIES FOR PLACES (الأماكن المعروضة)
DROP POLICY IF EXISTS "Allow public read places" ON public.places;
CREATE POLICY "Allow public read places"
ON public.places FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow full control on places" ON public.places;
CREATE POLICY "Allow full control on places"
ON public.places FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. STORAGE BUCKET POLICIES FOR PUBLIC UPLOADS
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public uploads to listing-images" ON storage.objects;
CREATE POLICY "Allow public uploads to listing-images"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'listing-images'
  AND (
    LOWER(storage.extension(name)) = 'jpg'
    OR LOWER(storage.extension(name)) = 'jpeg'
    OR LOWER(storage.extension(name)) = 'png'
    OR LOWER(storage.extension(name)) = 'webp'
  )
);

DROP POLICY IF EXISTS "Allow public read from listing-images" ON storage.objects;
CREATE POLICY "Allow public read from listing-images"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'listing-images');
