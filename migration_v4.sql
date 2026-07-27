-- ====================================================================
-- KAYAN HUB - MIGRATION V4: HOME-MADE CATEGORY & CRAFTS SPLIT
-- ====================================================================

-- Update category definitions and check constraints if any exist
-- Categories supported:
-- 'restaurants' -> مطاعم وكافيهات
-- 'home_made'   -> أكل بيتي وصنع يدي
-- 'market'      -> سوبرماركت وماركت
-- 'veggies'     -> خضار وفاكهة
-- 'pharmacy'    -> صيدليات وطب
-- 'crafts'      -> حرف وصيانة منزلية
-- 'services'    -> خدمات ومكاتب
-- 'other'       -> أخرى

-- Migration: Update existing 'services' that are craft-based if needed
UPDATE public.places
SET category = 'crafts'
WHERE category = 'services' AND (title LIKE '%سباك%' OR title LIKE '%كهربائ%' OR title LIKE '%صيانة%' OR description LIKE '%سباكة%');

-- Update pending_requests if applicable
UPDATE public.pending_requests
SET category = 'crafts'
WHERE category = 'services' AND (title LIKE '%سباك%' OR title LIKE '%كهربائ%' OR title LIKE '%صيانة%');
