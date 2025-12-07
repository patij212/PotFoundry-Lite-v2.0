-- PotFoundry Subscription Schema Migration
-- Run this in Supabase SQL Editor AFTER init.sql
-- Adds columns for comprehensive Stripe subscription management

-- ============================================================================
-- Add Stripe Subscription Columns
-- ============================================================================

-- Stripe customer ID (links user to Stripe)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Stripe subscription ID (active subscription)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Subscription status for granular state tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';

-- When the current billing period ends
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ;

-- Whether subscription will cancel at period end
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

-- ============================================================================
-- Constraints (run separately if constraint already exists)
-- ============================================================================

-- Restrict subscription_status to allowed values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_status_check
      CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'paused', 'trialing'));
  END IF;
END $$;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Index for looking up users by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id 
  ON public.profiles (stripe_customer_id);

-- Index for looking up users by subscription ID
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id 
  ON public.profiles (stripe_subscription_id);

-- ============================================================================
-- Helper function to update subscription status
-- Called by webhook after Stripe events
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
RETURNS JSON AS $$
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
    updated_at = timezone('utc', now())
  WHERE email = p_email;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No profile found for email: ' || p_email);
  END IF;
  
  RETURN json_build_object('success', true, 'message', 'Updated ' || p_email || ' to ' || p_tier);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role only (webhook uses service key)
REVOKE EXECUTE ON FUNCTION public.update_subscription_status FROM anon, authenticated;
