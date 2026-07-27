-- ====================================================================
-- Kayan Hub: Hyper-Local Directory Database Schema & RLS Security Script
-- Execute this complete script in the Supabase SQL Editor.
-- ====================================================================

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table: Delivery Drivers (أفراد التوصيل المتاحون)
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) DEFAULT 'كابتن توصيل',
    phone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    active_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table: Active Places & Services (الأماكن والخدمات المعروضة في الدليل)
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

-- 3. Table: Pending Submissions (الطلبات المعلقة للمراجعة والموافقة)
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

-- 4. Table: Feedback & Change Requests (جدول الشكاوى والاقتراحات وتحديث المنيو الجديد)
CREATE TABLE IF NOT EXISTS public.feedback_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_name_or_phone VARCHAR(150) NOT NULL,
    feedback_type VARCHAR(50) NOT NULL, -- 'menu_update', 'phone_change', 'report_issue', 'general_suggestion'
    contact_phone VARCHAR(20) NOT NULL,
    notes TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'resolved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 🛑 التأكد من إضافة الأعمدة في حال كانت الجداول مجودة سابقاً
-- ====================================================================
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS instapay_vfcash VARCHAR(30);
ALTER TABLE public.pending_requests ADD COLUMN IF NOT EXISTS instapay_vfcash VARCHAR(30);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS active_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours');

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

-- Drivers RLS Policies
DROP POLICY IF EXISTS "Allow public read access for drivers" ON public.drivers;
CREATE POLICY "Allow public read access for drivers"
ON public.drivers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for drivers" ON public.drivers;
CREATE POLICY "Allow public insert for drivers"
ON public.drivers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update active status for drivers" ON public.drivers;
CREATE POLICY "Allow public update active status for drivers"
ON public.drivers FOR UPDATE USING (true);

-- Places RLS Policies
DROP POLICY IF EXISTS "Allow public read access for places" ON public.places;
CREATE POLICY "Allow public read access for places"
ON public.places FOR SELECT USING (true);

-- Pending Requests RLS Policies
DROP POLICY IF EXISTS "Allow public insert for pending requests" ON public.pending_requests;
CREATE POLICY "Allow public insert for pending requests"
ON public.pending_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select for pending requests" ON public.pending_requests;
CREATE POLICY "Allow public select for pending requests"
ON public.pending_requests FOR SELECT USING (true);

-- Feedback Requests RLS Policies
DROP POLICY IF EXISTS "Allow public insert for feedback requests" ON public.feedback_requests;
CREATE POLICY "Allow public insert for feedback requests"
ON public.feedback_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select for feedback requests" ON public.feedback_requests;
CREATE POLICY "Allow public select for feedback requests"
ON public.feedback_requests FOR SELECT USING (true);

-- ====================================================================
-- STORAGE BUCKET SETUP FOR IMAGES
-- ====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Objects Policies (حساسية الحروف الكبيرة في امتدادات الصور)
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

-- ====================================================================
-- REAL PRODUCTION SEED DATA
-- ====================================================================

INSERT INTO public.drivers (name, phone, whatsapp, is_active, active_until) VALUES
('مازن (كابتن توصيل)', '01554838312', '01554838312', true, NOW() + INTERVAL '2 hours'),
('آسر (كابتن توصيل)', '01109226431', '01109226431', true, NOW() + INTERVAL '2 hours'),
('حسام (كابتن توصيل)', '01103284284', '01103284284', true, NOW() + INTERVAL '2 hours'),
('عمر (كابتن توصيل)', '01109226432', '01109226432', true, NOW() + INTERVAL '2 hours'),
('أدهم (كابتن توصيل)', '01015719851', '01015719851', true, NOW() + INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

INSERT INTO public.places (title, category, phone, whatsapp, instapay_vfcash, description, images, is_featured) VALUES
('خضار وفاكهة الطازج', 'veggies', '01069256298', '01069256298', '01069256298', 'تشكيلة يومية طازجة من الخضروات والفواكه من المزرعة مباشرة وتوصيل سريع للطلبات.', ARRAY['https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80'], true),
('كشري العاصمة', 'restaurants', '01040446383', '01040446383', '01040446383', 'أطعم وألذ كشري وطواجن في المنطقة. خدمة التوصيل السريع للمنازل.', ARRAY['https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80'], true),
('عم السمك للمأكولات البحرية', 'restaurants', '01067716803', '01067716803', '01067716803', 'أسماك طازجة، جمبري، ومشويات بحرية يومياً بأفضل جودة وطعم.', ARRAY['https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80'], false),
('خدمات وصيانة السباكة (سباك)', 'services', '01068556273', '01068556273', '01068556273', 'صيانة وتأسيس سباكة بالكامل بأعلى جودة وسرعة في الحضور والاستجابة.', ARRAY[]::TEXT[], false),
('صيدلية الخدمة الطبية 24 ساعة', 'pharmacy', '01094090100', '01094090100', '01094090100', 'توصيل أدوية ومستلزمات طبية ومستحضرات تجميل وقياس ضغط وسكر مجاناً.', ARRAY['https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=600&auto=format&fit=crop&q=80'], true),
('مكتبة بوبو للأدوات والطباعة', 'services', '01214244662', '01214244662', '01214244662', 'أدوات مكتبية، تصوير وطباعة مستندات، وكروت متميزة لجميع الأغراض.', ARRAY[]::TEXT[], false),
('بيت الحصري للمأكولات والوجبات', 'restaurants', '01080995965', '01080995965', '01080995965', 'أشهى المأكولات والوجبات السريعة والشرقية بأسعار ممتازة وتوصيل دليفري.', ARRAY['https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'], false),
('سوبر ماركت هايبر بداية وخضرواتي', 'market', '01030219271', '01067283836', '01030219271', 'جميع المواد الغذائية، الخضروات، الألبان، والمستلزمات المنزلية بأسعار الجملة.', ARRAY['https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=600&auto=format&fit=crop&q=80'], true)
ON CONFLICT DO NOTHING;
