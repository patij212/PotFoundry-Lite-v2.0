-- PotFoundry Designs Table
-- Run this in Supabase SQL Editor if not already created
-- This table stores public library designs

-- ============================================================================
-- Designs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  style TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  license TEXT DEFAULT 'CC BY-NC 4.0',
  
  -- Design parameters as JSONB
  size JSONB DEFAULT '{}'::jsonb,  -- Contains: height, top_od, bottom_od, wall_thickness, etc.
  opts JSONB DEFAULT '{}'::jsonb,  -- Style-specific options
  
  -- Media URLs (can be null initially)
  thumb_url TEXT,
  stl_url TEXT,
  
  -- Optional user reference (for tracking who published)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Enable Row Level Security
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Anyone can read designs (it's a public library)
CREATE POLICY "Designs are viewable by everyone"
  ON public.designs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only authenticated users can insert (publish)
CREATE POLICY "Authenticated users can publish designs"
  ON public.designs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own designs
CREATE POLICY "Users can update own designs"
  ON public.designs
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can delete their own designs
CREATE POLICY "Users can delete own designs"
  ON public.designs
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_designs_style ON public.designs(style);
CREATE INDEX IF NOT EXISTS idx_designs_created_at ON public.designs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_designs_user_id ON public.designs(user_id);
CREATE INDEX IF NOT EXISTS idx_designs_tags ON public.designs USING GIN(tags);

-- Full text search index on title
CREATE INDEX IF NOT EXISTS idx_designs_title_search ON public.designs USING GIN(to_tsvector('english', title));

-- ============================================================================
-- Updated_at trigger
-- ============================================================================

DROP TRIGGER IF EXISTS designs_updated_at ON public.designs;
CREATE TRIGGER designs_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
