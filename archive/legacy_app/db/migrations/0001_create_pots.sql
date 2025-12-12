-- Migration: 0001_create_pots
-- Description: Create pots table for public library with RLS policies
-- Date: 2024

-- Create the pots table
CREATE TABLE IF NOT EXISTS pots (
    id text PRIMARY KEY,                   -- sha256 hex of canonical JSON (64 chars)
    title text NOT NULL CHECK (length(title) >= 1 AND length(title) <= 120),
    style text NOT NULL,                   -- Style name (e.g., "HarmonicRipple")
    size jsonb NOT NULL,                   -- Size parameters: {height, top_od, bottom_od, wall, bottom, drain, flare_exp}
    opts jsonb NOT NULL,                   -- Style-specific options
    mesh jsonb NOT NULL,                   -- Mesh quality: {n_theta, n_z, twist, etc.}
    stl_url text NOT NULL,                 -- Public storage URL for STL file
    thumb_url text NOT NULL,               -- Public storage URL for thumbnail PNG
    created_at timestamptz NOT NULL DEFAULT now(),
    tags text[] NOT NULL DEFAULT '{}',     -- Up to 10 tags
    app_commit text,                       -- Git commit SHA of app version
    diagnostics jsonb NOT NULL DEFAULT '{}', -- {triangle_count, health_badges, etc.}
    license text NOT NULL                  -- License identifier (e.g., "CC BY-NC 4.0")
);

-- Add comments for documentation
COMMENT ON TABLE pots IS 'Public library of published pot designs';
COMMENT ON COLUMN pots.id IS 'Content-addressed ID: sha256 hex of canonical JSON payload';
COMMENT ON COLUMN pots.title IS 'User-provided title (1-120 characters)';
COMMENT ON COLUMN pots.style IS 'Style name (matches STYLES registry in app)';
COMMENT ON COLUMN pots.size IS 'Size parameters: height, top_od, bottom_od, wall_thickness, bottom_thickness, drain_radius, flare_exp';
COMMENT ON COLUMN pots.opts IS 'Style-specific options (e.g., freq, amp for HarmonicRipple)';
COMMENT ON COLUMN pots.mesh IS 'Mesh quality settings: n_theta, n_z, twist, etc.';
COMMENT ON COLUMN pots.stl_url IS 'Public URL to STL file in storage bucket';
COMMENT ON COLUMN pots.thumb_url IS 'Public URL to thumbnail PNG in storage bucket';
COMMENT ON COLUMN pots.tags IS 'User-provided tags for search/filter (max 10)';
COMMENT ON COLUMN pots.app_commit IS 'Git commit SHA of app version that generated this design';
COMMENT ON COLUMN pots.diagnostics IS 'Design diagnostics: triangle_count, estimated dimensions, health checks';
COMMENT ON COLUMN pots.license IS 'License identifier (e.g., CC BY-NC 4.0, CC BY 4.0, CC0 1.0)';

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS pots_style_created_idx ON pots (style, created_at DESC);
CREATE INDEX IF NOT EXISTS pots_created_idx ON pots (created_at DESC);
CREATE INDEX IF NOT EXISTS pots_tags_idx ON pots USING GIN (tags);

-- Enable Row-Level Security
ALTER TABLE pots ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access
-- Anyone can SELECT from pots (no authentication required)
CREATE POLICY "Public read access"
ON pots
FOR SELECT
USING (true);

-- Policy: Service role can insert
-- Only the app backend (with service_role key) can INSERT
CREATE POLICY "Service role insert"
ON pots
FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
);

-- Policy: Service role can update (for future corrections)
-- Optional: Allow app to update tags/title on existing designs
CREATE POLICY "Service role update"
ON pots
FOR UPDATE
USING (
    auth.role() = 'service_role'
)
WITH CHECK (
    auth.role() = 'service_role'
);

-- Storage bucket setup (executed via Supabase Dashboard or API)
-- Note: This SQL is for documentation; actual bucket creation uses Supabase UI or API
/*
Bucket name: pots
Public: true (allows unauthenticated reads)
File size limit: 26214400 (25MB)
Allowed MIME types: application/octet-stream, image/png, application/json

Bucket policies:
1. Public read access:
   INSERT INTO storage.buckets (id, name, public) VALUES ('pots', 'pots', true);

2. Service role write access (configured via RLS on storage.objects):
   CREATE POLICY "Service role upload" ON storage.objects
   FOR INSERT WITH CHECK (
     bucket_id = 'pots' AND auth.role() = 'service_role'
   );

3. Public download:
   CREATE POLICY "Public download" ON storage.objects
   FOR SELECT USING (bucket_id = 'pots');
*/

-- Optional: Add constraint to validate tags array length
-- (Can also be enforced in application layer)
ALTER TABLE pots ADD CONSTRAINT pots_tags_max_10 CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 10);

-- Optional: Add constraint to validate license values
-- (Can be updated as new licenses are supported)
ALTER TABLE pots ADD CONSTRAINT pots_license_valid CHECK (
    license IN (
        'CC BY-NC 4.0',
        'CC BY 4.0',
        'CC BY-SA 4.0',
        'CC0 1.0',
        'MIT',
        'Apache 2.0',
        'GPL-3.0'
    )
);

-- Sample query patterns (for testing)
/*
-- Get latest designs:
SELECT id, title, style, created_at, tags, thumb_url
FROM pots
ORDER BY created_at DESC
LIMIT 24;

-- Filter by style:
SELECT id, title, style, created_at, tags, thumb_url
FROM pots
WHERE style = 'HarmonicRipple'
ORDER BY created_at DESC
LIMIT 24;

-- Search by tag:
SELECT id, title, style, created_at, tags, thumb_url
FROM pots
WHERE 'modern' = ANY(tags)
ORDER BY created_at DESC
LIMIT 24;

-- Full-text search on title:
SELECT id, title, style, created_at, tags, thumb_url
FROM pots
WHERE title ILIKE '%flower%'
ORDER BY created_at DESC
LIMIT 24;

-- Check for duplicate by ID:
SELECT id, stl_url, thumb_url FROM pots WHERE id = 'a3f2e9d8...';
*/
