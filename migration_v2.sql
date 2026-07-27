-- ====================================================================
-- KAYAN HUB - MIGRATION V2: ANALYTICS VIEW & GOVERNANCE FUNCTIONS
-- Execute this complete script in the Supabase SQL Editor.
-- ====================================================================

-- 0. Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ensure all tables and required columns exist
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) DEFAULT 'كابتن توصيل',
    phone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    active_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20),
    instapay_vfcash VARCHAR(30),
    description TEXT,
    images TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pending_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20),
    instapay_vfcash VARCHAR(30),
    description TEXT,
    images TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feedback_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_name_or_phone VARCHAR(150) NOT NULL,
    feedback_type VARCHAR(50) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    notes TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist if tables pre-date v2
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS instapay_vfcash VARCHAR(30);
ALTER TABLE public.pending_requests ADD COLUMN IF NOT EXISTS instapay_vfcash VARCHAR(30);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS active_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours');

-- ====================================================================
-- 2. CREATE RPC FUNCTION FOR DYNAMIC ADMIN KPI METRICS IN 1 FAST QUERY
-- ====================================================================
CREATE OR REPLACE FUNCTION get_admin_metrics()
RETURNS TABLE (
    total_places BIGINT,
    active_drivers BIGINT,
    pending_additions BIGINT,
    pending_feedbacks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.places) AS total_places,
        (SELECT COUNT(*) FROM public.drivers WHERE is_active = true AND (active_until IS NULL OR active_until > NOW())) AS active_drivers,
        (SELECT COUNT(*) FROM public.pending_requests WHERE status = 'pending') AS pending_additions,
        (SELECT COUNT(*) FROM public.feedback_requests WHERE status = 'pending') AS pending_feedbacks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 3. RLS SECURITY POLICIES FOR ADMIN GOVERNANCE (FULL CRUD)
-- ====================================================================
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full admin control on places" ON public.places;
CREATE POLICY "Allow full admin control on places" ON public.places FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow full admin control on drivers" ON public.drivers;
CREATE POLICY "Allow full admin control on drivers" ON public.drivers FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow full admin control on feedback_requests" ON public.feedback_requests;
CREATE POLICY "Allow full admin control on feedback_requests" ON public.feedback_requests FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow full admin control on pending_requests" ON public.pending_requests;
CREATE POLICY "Allow full admin control on pending_requests" ON public.pending_requests FOR ALL USING (true);

-- ====================================================================
-- 4. STORAGE BUCKET & POLICIES
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public uploads to listing-images" ON storage.objects;
CREATE POLICY "Allow public uploads to listing-images"
ON storage.objects FOR INSERT
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
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-images');
