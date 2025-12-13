-- PotFoundry Security Fix Migration (v2 - with reviewer feedback)
-- Fixes: function_search_path_mutable linter warnings
-- Run this in Supabase SQL Editor
-- 
-- This sets an immutable search_path on all SECURITY DEFINER functions
-- to prevent search_path injection attacks.
--
-- All function calls are explicitly schema-qualified to work with empty search_path.
-- All timestamp comparisons use defensive COALESCE to handle NULL values.

-- ============================================================================
-- Fix handle_new_user function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Use ON CONFLICT to handle edge cases gracefully
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,  -- Can be NULL for some auth flows
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name',
      pg_catalog.split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  
  RETURN NEW;
END;
$$;

-- Security: prevent direct execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ============================================================================
-- Fix handle_updated_at function
-- Now includes SECURITY DEFINER for consistency with other functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  RETURN NEW;
END;
$$;

-- Security: prevent direct execution (trigger-only)
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, authenticated;

-- ============================================================================
-- Fix reset_monthly_exports function
-- Added defensive COALESCE for exports_reset_at NULL handling
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_monthly_exports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    exports_this_month = 0, 
    exports_reset_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE COALESCE(exports_reset_at, '1970-01-01'::timestamptz) 
        < pg_catalog.timezone('utc', pg_catalog.now()) - INTERVAL '1 month';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_monthly_exports() FROM anon, authenticated;

-- ============================================================================
-- Fix increment_exports function
-- Added defensive COALESCE for exports_reset_at NULL handling
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_exports()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_count INTEGER;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Update and reset if needed (atomic operation)
  -- Uses COALESCE to defensively handle NULL exports_reset_at
  UPDATE public.profiles
  SET 
    exports_this_month = CASE 
      WHEN COALESCE(exports_reset_at, '1970-01-01'::timestamptz) 
           < pg_catalog.timezone('utc', pg_catalog.now()) - INTERVAL '1 month' 
      THEN 1  -- Reset to 1 (this export)
      ELSE exports_this_month + 1 
    END,
    exports_reset_at = CASE 
      WHEN COALESCE(exports_reset_at, '1970-01-01'::timestamptz) 
           < pg_catalog.timezone('utc', pg_catalog.now()) - INTERVAL '1 month' 
      THEN pg_catalog.timezone('utc', pg_catalog.now())
      ELSE exports_reset_at 
    END
  WHERE id = current_user_id
  RETURNING exports_this_month INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$;

-- Grant only to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_exports() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_exports() FROM anon;

-- ============================================================================
-- Fix update_subscription_status function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_subscription_status(
  p_email TEXT,
  p_tier TEXT,
  p_status TEXT,
  p_customer_id TEXT DEFAULT NULL,
  p_subscription_id TEXT DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET 
    subscription_tier = COALESCE(p_tier, subscription_tier),
    subscription_status = COALESCE(p_status, subscription_status),
    stripe_customer_id = COALESCE(p_customer_id, stripe_customer_id),
    stripe_subscription_id = COALESCE(p_subscription_id, stripe_subscription_id),
    subscription_period_end = COALESCE(p_period_end, subscription_period_end),
    cancel_at_period_end = COALESCE(p_cancel_at_period_end, cancel_at_period_end),
    updated_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE email = p_email;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count = 0 THEN
    RETURN pg_catalog.json_build_object('success', false, 'message', 'No profile found for email: ' || p_email);
  END IF;
  
  RETURN pg_catalog.json_build_object('success', true, 'message', 'Updated ' || p_email || ' to ' || p_tier);
END;
$$;

-- Grant execute to service role only (webhook uses service key)
REVOKE EXECUTE ON FUNCTION public.update_subscription_status(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN
) FROM anon, authenticated;

-- ============================================================================
-- VERIFICATION: Run this query after applying to verify fix
-- ============================================================================

-- Verify search_path is set correctly:
SELECT proname, prosecdef as security_definer, proconfig 
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace 
  AND proname IN ('handle_new_user', 'handle_updated_at', 'reset_monthly_exports', 
                  'increment_exports', 'update_subscription_status');

-- Expected output:
-- proname                      | security_definer | proconfig
-- handle_new_user              | t                | {search_path=""}
-- handle_updated_at            | t                | {search_path=""}
-- reset_monthly_exports        | t                | {search_path=""}
-- increment_exports            | t                | {search_path=""}
-- update_subscription_status   | t                | {search_path=""}
