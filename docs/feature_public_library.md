# Public Library Publishing - Feature Documentation

## Executive Summary
Enable optional publication of exported STL models to a public, browsable library with persistent storage (Supabase Postgres + Storage). Each published design includes:
- Deduplicated STL file (content-addressed)
- PNG thumbnail preview
- Canonical JSON metadata with parameters
- License information and tags
- Deep-link for state restoration

## Architecture

### Data Flow
```
User Export → STL Generation → Publish (opt-in)
                                    ↓
                         Canonical JSON Hash (ID)
                                    ↓
                         Dedup Check (SELECT by ID)
                                    ↓
              ┌─────────────────────┴─────────────────────┐
              │                                           │
         Exists?                                    New design?
              │                                           │
        Return existing                      Upload STL, PNG, JSON
              │                              Insert DB record
              └─────────────────────┬─────────────────────┘
                                    ↓
                         Return publish result
                         (ID, URLs, duplicate flag)
```

### Components

#### Storage Layer (Supabase)
- **Bucket**: `pots` (public read, service-key write)
- **Paths**:
  - `stl/{id}.stl[.gz]` - STL files (gzipped if >1MB)
  - `thumb/{id}.png` - Thumbnails
  - `meta/{id}.json` - Metadata JSON

#### Database (Postgres)
- **Table**: `pots`
- **Row-Level Security**: Public SELECT, restricted INSERT
- **Indexes**: Primary key (id), style+created_at, GIN on tags

#### Application Layer
- **Library Core** (`potfoundry/library.py`): Canonical hashing, validation, publish logic
- **Supabase Client** (`potfoundry/integrations/supabase_client.py`): Storage/DB wrapper with graceful degradation
- **Deep Link** (`pfui/deeplink.py`): State encoding/decoding for "Open in editor"
- **Library UI** (`pfui/library_ui.py`): Browse, search, filter, pagination

## Data Model

### Table: `pots`
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | text | PRIMARY KEY | sha256 hex of canonical JSON |
| title | text | NOT NULL | User-provided title (1-120 chars) |
| style | text | NOT NULL | Style name (e.g., "HarmonicRipple") |
| size | jsonb | NOT NULL | {height, top_od, bottom_od, wall, bottom, drain, flare_exp} |
| opts | jsonb | NOT NULL | Style-specific options |
| mesh | jsonb | NOT NULL | {n_theta, n_z, preview_detail, twist, etc.} |
| stl_url | text | NOT NULL | Public storage URL |
| thumb_url | text | NOT NULL | Public thumbnail URL |
| created_at | timestamptz | DEFAULT now() | Timestamp |
| tags | text[] | DEFAULT '{}' | Up to 10 tags |
| app_commit | text | | Git commit SHA |
| diagnostics | jsonb | DEFAULT '{}' | {triangle_count, health_badges, etc.} |
| license | text | NOT NULL | License identifier (e.g., "CC BY-NC 4.0") |

### Indexes
```sql
CREATE INDEX pots_style_created_idx ON pots (style, created_at DESC);
CREATE INDEX pots_tags_idx ON pots USING GIN (tags);
```

### Row-Level Security (RLS)
```sql
ALTER TABLE pots ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read access" ON pots
  FOR SELECT USING (true);

-- Service-key only write
CREATE POLICY "Service role insert" ON pots
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

## Canonical JSON & Deduplication

### Canonical Payload Structure
```json
{
  "version": "2.0.0",
  "style": "HarmonicRipple",
  "size": {
    "bottom_od": 95.5,
    "bottom_thickness": 3.0,
    "drain_radius": 6.0,
    "flare_exp": 1.5,
    "height": 120.0,
    "top_od": 105.5,
    "wall_thickness": 2.5
  },
  "opts": {
    "freq": 8.0,
    "amp": 2.5
  },
  "mesh": {
    "n_theta": 144,
    "n_z": 64,
    "twist": 0.0
  },
  "diagnostics": {
    "triangle_count": 18432
  },
  "license": "CC BY-NC 4.0"
}
```

### Normalization Rules
1. All dictionary keys sorted alphabetically
2. Floats rounded to 6 decimal places
3. JSON serialized with `separators=(",", ":")` (no spaces)
4. sha256 hex digest of UTF-8 bytes

### Content ID Generation
```python
import hashlib
import json

def canonical_payload(style, size, opts, mesh, diagnostics, license, version="2.0.0"):
    """Generate canonical payload dict with normalized floats."""
    # Round all float values to 6 decimals, sort keys
    return sorted_dict

def content_id(payload):
    """Return sha256 hex of canonical JSON."""
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
```

## Validation & Safety

### Input Validation
- **Title**: 1-120 characters, blocklist check
- **Tags**: Max 10, each ≤24 chars, alphanumeric+dash+underscore only
- **License**: Must be in allowed list
- **STL size**: Max 25MB after compression
- **Triangle count**: Max 5,000,000
- **Blocklist**: Hardcoded list of inappropriate terms (case-insensitive regex)

### Rate Limiting (Client-Side)
- Track publish timestamps in session state
- Max 5 publishes per 60 seconds
- Minimum 10 seconds between consecutive publishes
- User-friendly error messages

### Abuse Controls
- Only server-generated STLs accepted (no arbitrary file uploads)
- Content-type validation on storage
- Tag/title length limits
- Blocklist enforcement

## UI Integration

### Export Section (app.py)
After STL generation button, add:
```
☐ Publish to Public Library
  Title: [________] (default: "{style} pot - {date}")
  Tags: [________] (comma-separated, e.g., "fluted,tall,modern")
  License: [Dropdown: CC BY-NC 4.0, CC BY 4.0, CC0 1.0]
  ☐ I grant permission to publish under this license
  
  [Export & Publish STL]
```

On success:
```
✓ Published! ID: a3f2e9d8...
  Copy library link: [📋 Copy Link]
```

### Library Tab (new)
```
Public Library
--------------
[Search: ________]  [Style: All ▼]  [Tags: ________]  [Sort: Newest ▼]

┌─────────────┬─────────────┬─────────────┬─────────────┐
│ [Thumbnail] │ [Thumbnail] │ [Thumbnail] │ [Thumbnail] │
│ Title       │ Title       │ Title       │ Title       │
│ Style       │ Style       │ Style       │ Style       │
│ #tag1 #tag2 │ #tag1       │ #tag1 #tag2 │ #tag1 #tag3 │
│ CC BY-NC    │ CC BY       │ CC0         │ CC BY-NC    │
│ [Download]  │ [Download]  │ [Download]  │ [Download]  │
│ [Open]      │ [Open]      │ [Open]      │ [Open]      │
└─────────────┴─────────────┴─────────────┴─────────────┘

[← Previous]  Page 1 of 5  [Next →]
```

### Deep Link Format
URL: `?state=<base64url-encoded-json>`
Example: `?state=eyJzdHlsZSI6Ikhhcm1vbmljUmlwcGxlIiwiaGVpZ2h0IjoxMjAuMH0=`

Decoded:
```json
{
  "style": "HarmonicRipple",
  "height": 120.0,
  "top_od": 105.5,
  "bottom_od": 95.5,
  "wall_thickness": 2.5,
  "opts": {"freq": 8.0, "amp": 2.5}
}
```

## Feature Degradation

### Missing Configuration
If Supabase credentials not configured:
- Export section: Publish controls hidden
- Library tab: Not shown in navigation
- No errors; app functions normally for local export

### Feature Flag
Environment variable: `DISABLE_LIBRARY=1`
- Overrides configuration check
- Allows temporary disable without removing secrets

## Security & Privacy

### Data Handling
- All published data is **public** (read by anyone)
- Users must explicitly consent to license terms
- No personal information collected
- STL files are user-generated content

### RLS Policies
- Read: Public (no authentication required)
- Write: Service role key only (app backend)
- No direct user writes to prevent abuse

### Secrets Management
- Service key stored in `.streamlit/secrets.toml` (gitignored)
- Streamlit Cloud: Configure in app settings
- Never expose in client code or logs

## Performance & Cost

### Deduplication Benefits
- Identical designs share storage (single copy)
- Reduced storage costs
- Faster publish for duplicates (DB query only)

### Storage Optimization
- Gzip compression for STL >1MB (~70-80% reduction)
- Thumbnail size limit: 500KB (reasonable quality)
- Metadata JSON: <10KB per design

### Expected Costs (Supabase Free Tier)
- Storage: 1GB free (est. 500-1000 designs)
- Database rows: 500MB free (est. 50,000+ designs)
- Bandwidth: 2GB/month free
- Upgrade triggers: ~1,000 unique publishes/month

## Testing Strategy

### Unit Tests
- Canonical JSON normalization (key order invariance)
- Content ID stability (repeated hashing)
- Float rounding precision
- Validation functions (title, tags, license)
- Rate limit enforcement

### Integration Tests (Mocked Supabase)
- Publish new design (full flow)
- Publish duplicate (dedup path)
- Library listing with filters
- Deep link encode/decode roundtrip
- Blocklist rejection

### Manual QA Checklist
- [ ] Export without publish works
- [ ] Publish creates DB record and uploads
- [ ] Duplicate publish skips upload
- [ ] Library tab shows published designs
- [ ] Search filters results
- [ ] Deep link restores state
- [ ] Rate limit blocks rapid publishes
- [ ] Blocklist blocks inappropriate titles
- [ ] Feature degrades gracefully without config

## Deployment

### Prerequisites
1. Supabase project created
2. Bucket `pots` configured with public read policy
3. Table `pots` created with RLS policies
4. Service role key obtained

### Configuration Steps
1. Copy `.streamlit/secrets-example.toml` to `.streamlit/secrets.toml`
2. Fill in Supabase URL and service key
3. Deploy to Streamlit Cloud
4. Add secrets in Streamlit Cloud app settings
5. Test publish flow

### Rollback Plan
1. Set `DISABLE_LIBRARY=1` environment variable
2. Remove secrets from Streamlit Cloud
3. Restart app
4. Feature gracefully disabled; existing data preserved

## Operational

### Monitoring
- Log events: `publish_attempt`, `publish_success`, `publish_fail`, `library_view`, `deeplink_apply`
- Track in session state: `_library_events`
- Optional: Send to external analytics (future enhancement)

### Maintenance
- Review blocklist periodically
- Monitor storage usage in Supabase dashboard
- Adjust rate limits if abuse detected
- Consider adding admin moderation tools (future)

## Future Enhancements

### Phase 2 (Optional)
- User authentication for private collections
- Design remixing (fork published design)
- Like/favorite system
- Comments/discussions
- Admin moderation dashboard
- Watermarking for attribution
- Download counter/analytics
- Advanced search (full-text, faceted filters)

### Alternative Storage
- S3/R2 implementation (see `docs/alt_s3_r2.md`)
- Hybrid: hot designs in CDN, cold in archival tier
- IPFS for decentralized storage

## Acceptance Criteria

### Must Have
- [x] Canonical hashing generates stable IDs
- [x] Deduplication works (no redundant uploads)
- [x] Publish flow handles errors gracefully
- [x] Library UI shows designs with pagination
- [x] Deep link restores design state
- [x] Rate limiting prevents spam
- [x] Blocklist blocks inappropriate content
- [x] Feature degrades without config
- [x] Tests pass with >75% coverage
- [x] Documentation complete

### Nice to Have
- [ ] Thumbnails are deterministic
- [ ] Admin moderation tools
- [ ] Usage analytics dashboard
- [ ] Email notifications for new designs
- [ ] RSS feed for library updates

## References
- Supabase Docs: https://supabase.com/docs
- Row-Level Security: https://supabase.com/docs/guides/auth/row-level-security
- Storage: https://supabase.com/docs/guides/storage
- Streamlit Secrets: https://docs.streamlit.io/library/advanced-features/secrets-management
