-- Migration: Add total_exports tracking for Pro users
-- Run this in Supabase SQL Editor after init.sql

-- Add total_exports column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS total_exports INTEGER DEFAULT 0;

-- Update increment_exports function to track both monthly and total
CREATE OR REPLACE FUNCTION public.increment_exports()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
  current_user_id UUID;
BEGIN
  current_user_id := (SELECT auth.uid());
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Update monthly count (with auto-reset) and total count
  UPDATE public.profiles
  SET 
    exports_this_month = CASE 
      WHEN exports_reset_at < timezone('utc', now()) - INTERVAL '1 month' 
      THEN 1
      ELSE exports_this_month + 1 
    END,
    exports_reset_at = CASE 
      WHEN exports_reset_at < timezone('utc', now()) - INTERVAL '1 month' 
      THEN timezone('utc', now())
      ELSE exports_reset_at 
    END,
    total_exports = COALESCE(total_exports, 0) + 1
  WHERE id = current_user_id
  RETURNING exports_this_month INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
