-- PotFoundry Supabase Schema
-- Run this ENTIRE file in the Supabase SQL Editor
-- Last updated: 2024-12-07

-- ============================================================================
-- Profiles Table
-- ============================================================================

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,  -- Nullable: some auth flows (SSO/phone) may not have email
  display_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  exports_this_month INTEGER DEFAULT 0,
  exports_reset_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies (explicit TO authenticated for clarity)
-- ============================================================================

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Policy: New users can create their profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

-- Note: service_role bypasses RLS automatically, no explicit policy needed

-- ============================================================================
-- Auto-create profile on signup (with ON CONFLICT handling)
-- ============================================================================

-- Function to create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    updated_at = timezone('utc', now());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security: prevent direct execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ============================================================================
-- Updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Reset monthly exports (run via cron/edge function as service_role)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_monthly_exports()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET 
    exports_this_month = 0, 
    exports_reset_at = timezone('utc', now())
  WHERE exports_reset_at < timezone('utc', now()) - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.reset_monthly_exports() FROM anon, authenticated;

-- ============================================================================
-- Increment exports function (atomic, secure)
-- ============================================================================

-- Drop any existing versions (both signatures)
DROP FUNCTION IF EXISTS public.increment_exports();
DROP FUNCTION IF EXISTS public.increment_exports(UUID);

-- Secure function: uses auth.uid() so users can only increment their own count
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
  
  -- Update and reset if needed (atomic operation)
  UPDATE public.profiles
  SET 
    exports_this_month = CASE 
      WHEN exports_reset_at < timezone('utc', now()) - INTERVAL '1 month' 
      THEN 1  -- Reset to 1 (this export)
      ELSE exports_this_month + 1 
    END,
    exports_reset_at = CASE 
      WHEN exports_reset_at < timezone('utc', now()) - INTERVAL '1 month' 
      THEN timezone('utc', now())
      ELSE exports_reset_at 
    END
  WHERE id = current_user_id
  RETURNING exports_this_month INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant only to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_exports() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_exports() FROM anon;

-- ============================================================================
-- Index for performance (for reset queries on large tables)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_exports_reset 
  ON public.profiles(exports_reset_at);
