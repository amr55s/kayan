-- ====================================================================
-- KAYAN HUB - MIGRATION V3: DRIVER PIN & STRUCTURED FEEDBACK ENGINE
-- Execute this complete script in the Supabase SQL Editor.
-- ====================================================================

-- 1. Add PIN code column to drivers table
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS pin_code VARCHAR(5);

-- Generate random 5-digit PIN for existing drivers without a PIN
UPDATE public.drivers
SET pin_code = FLOOR(10000 + RANDOM() * 90000)::TEXT
WHERE pin_code IS NULL;

-- 2. Add structured change columns to feedback_requests
ALTER TABLE public.feedback_requests
ADD COLUMN IF NOT EXISTS target_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS proposed_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS proposed_images TEXT[] DEFAULT '{}';
