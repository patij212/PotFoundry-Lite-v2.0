-- PotFoundry Designs Table
-- Run this in Supabase SQL Editor
-- This table stores public library designs
-- 
-- Prerequisites: pgcrypto extension (usually pre-enabled on Supabase)
-- Dependencies: None (includes handle_updated_at function)

-- ============================================================================
-- Helper Function: updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  RETURN NEW;
END;
$$;

-- Security: prevent direct execution by clients
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, authenticated;

-- ============================================================================
-- Designs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core fields with validation
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  style TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  license TEXT DEFAULT 'CC BY-NC 4.0' CHECK (license = ANY (ARRAY[
    'CC BY-NC 4.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC0 1.0', 'MIT', 'Apache 2.0', 'GPL-3.0'
  ])),
  
  -- Design parameters as JSONB (flexible schema)
  size JSONB DEFAULT '{}'::jsonb,  -- height, top_od, bottom_od, wall_thickness, etc.
  opts JSONB DEFAULT '{}'::jsonb,  -- Style-specific options
  
  -- Media URLs (can be null initially, populated async)
  thumb_url TEXT,
  stl_url TEXT,
  
  -- Visibility control (allows private/draft designs)
  is_public BOOLEAN DEFAULT true NOT NULL,
  
  -- Soft delete (NULL = active, timestamp = deleted)
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  
  -- Full-text search vector (auto-updated via trigger)
  title_search TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', title)) STORED,
  
  -- Ownership (nullable for legacy/anonymous designs)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Add column comments for documentation
COMMENT ON TABLE public.designs IS 'Public library of user-published pot designs';
COMMENT ON COLUMN public.designs.size IS 'Geometry parameters: height, top_od, bottom_od, wall_thickness, bottom_thickness, drain_radius, flare_exp';
COMMENT ON COLUMN public.designs.opts IS 'Style-specific options matching the style schema';
COMMENT ON COLUMN public.designs.user_id IS 'Owner of the design, NULL for anonymous/legacy designs';
COMMENT ON COLUMN public.designs.is_public IS 'If false, design is private/draft and only visible to owner';
COMMENT ON COLUMN public.designs.deleted_at IS 'Soft delete timestamp, NULL means active';
COMMENT ON COLUMN public.designs.title_search IS 'Auto-generated tsvector for full-text search on title';

-- Enable Row Level Security
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies (with security hardening)
-- ============================================================================

-- Anyone can read PUBLIC, NON-DELETED designs
-- Owners can always see their own designs (even private/deleted)
DROP POLICY IF EXISTS "Designs are viewable by everyone" ON public.designs;
CREATE POLICY "Designs are viewable by everyone"
  ON public.designs
  FOR SELECT
  TO anon, authenticated
  USING (
    -- Public, non-deleted designs visible to everyone
    (is_public = true AND deleted_at IS NULL)
    OR
    -- Owners can see all their own designs (private, deleted, etc.)
    ((SELECT auth.uid()) = user_id)
  );

-- Authenticated users can insert, but user_id must match their auth.uid() or be NULL
-- Prevents impersonation by forcing correct ownership
DROP POLICY IF EXISTS "Authenticated users can publish designs" ON public.designs;
CREATE POLICY "Authenticated users can publish designs"
  ON public.designs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- Users can update their own designs
-- WITH CHECK prevents changing user_id to another user (ownership escalation)
DROP POLICY IF EXISTS "Users can update own designs" ON public.designs;
CREATE POLICY "Users can update own designs"
  ON public.designs
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Users can delete their own designs
DROP POLICY IF EXISTS "Users can delete own designs" ON public.designs;
CREATE POLICY "Users can delete own designs"
  ON public.designs
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- Indexes (optimized for query patterns)
-- ============================================================================

-- Composite index for common query: filter by style, order by created_at DESC
-- Partial index excludes deleted designs for better performance
CREATE INDEX IF NOT EXISTS idx_designs_style_created 
  ON public.designs(style, created_at DESC)
  WHERE deleted_at IS NULL;

-- Public listing query optimization
CREATE INDEX IF NOT EXISTS idx_designs_public_created 
  ON public.designs(created_at DESC)
  WHERE is_public = true AND deleted_at IS NULL;

-- User's own designs lookup (includes private/deleted for owner view)
CREATE INDEX IF NOT EXISTS idx_designs_user_id 
  ON public.designs(user_id);

-- GIN index for tag array search (@> contains, && overlaps)
CREATE INDEX IF NOT EXISTS idx_designs_tags_gin 
  ON public.designs USING GIN (tags);

-- Full-text search index on title_search column
CREATE INDEX IF NOT EXISTS idx_designs_title_fts 
  ON public.designs USING GIN (title_search);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at on any row modification
DROP TRIGGER IF EXISTS designs_updated_at ON public.designs;
CREATE TRIGGER designs_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Server-side Ownership Enforcement (Security Enhancement)
-- ============================================================================
-- This trigger enforces that user_id is always set from the JWT token,
-- preventing clients from tampering with or spoofing ownership.

CREATE OR REPLACE FUNCTION public.set_owner_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Always set user_id from the authenticated user's JWT
  -- Overrides any client-provided value to prevent spoofing
  IF (SELECT auth.uid()) IS NOT NULL THEN
    NEW.user_id := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Security: prevent direct execution by clients
REVOKE EXECUTE ON FUNCTION public.set_owner_on_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS designs_set_owner ON public.designs;
CREATE TRIGGER designs_set_owner
  BEFORE INSERT ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_on_insert();

-- ============================================================================
-- Validation: Verify pgcrypto extension (required for gen_random_uuid)
-- ============================================================================
-- Run this to verify: SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
-- If missing, run: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Soft Delete Helper Functions (optional convenience)
-- ============================================================================

-- Soft delete a design (sets deleted_at, doesn't actually remove)
CREATE OR REPLACE FUNCTION public.soft_delete_design(design_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.designs 
  SET deleted_at = pg_catalog.timezone('utc', pg_catalog.now())
  WHERE id = design_id AND user_id = (SELECT auth.uid());
  RETURN FOUND;
END;
$$;

-- Restore a soft-deleted design
CREATE OR REPLACE FUNCTION public.restore_design(design_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.designs 
  SET deleted_at = NULL
  WHERE id = design_id AND user_id = (SELECT auth.uid());
  RETURN FOUND;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.soft_delete_design(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_design(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_design(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_design(UUID) FROM anon;

-- ============================================================================
-- Usage Examples
-- ============================================================================
-- 
-- Full-text search on title:
--   .from('designs').select('*').textSearch('title_search', 'flower pot')
-- 
-- Soft delete via RPC:
--   await supabase.rpc('soft_delete_design', { design_id: 'uuid-here' })
-- 
-- Restore via RPC:
--   await supabase.rpc('restore_design', { design_id: 'uuid-here' })
-- 
-- Get user's deleted designs:
--   .from('designs').select('*').not('deleted_at', 'is', null)
