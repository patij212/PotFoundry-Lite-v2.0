# ADR 0001: Public Library Storage with Supabase

## Status
Accepted

## Context
The PotFoundry application needs persistent storage for a public library of user-published 3D pot designs. Each published design includes:
- Binary STL file (potentially large: 1-25MB)
- PNG thumbnail (500KB max)
- JSON metadata (parameters, diagnostics)
- Search/filter metadata (title, tags, style)

### Requirements
1. **Persistence**: Data must survive app container restarts/sleep
2. **Public access**: Anyone can browse and download (no auth required for read)
3. **Controlled writes**: Only the app can publish (prevent spam/abuse)
4. **Deduplication**: Content-addressed storage to avoid redundancy
5. **Search/filter**: Query by style, tags, creation date
6. **Cost-effective**: Free tier sufficient for MVP; reasonable scaling costs
7. **Developer-friendly**: Easy to set up, good DX, minimal ops overhead

### Options Considered

#### Option 1: Supabase (Postgres + Storage)
**Pros:**
- **Integrated solution**: Database + file storage in one service
- **Row-Level Security (RLS)**: Built-in auth/authorization at DB level
- **Generous free tier**: 1GB storage, 500MB DB, 2GB bandwidth/month
- **Real-time capabilities**: Future feature potential (live updates)
- **Postgres full-text search**: Built-in search without additional services
- **Simple setup**: Web UI for schema management, RLS policies
- **Python SDK**: Official `supabase-py` library
- **CDN included**: Global edge caching for fast downloads

**Cons:**
- **Vendor lock-in**: Postgres-specific features (JSONB, RLS) harder to migrate
- **Cold start**: Free tier may have slight latency on first request
- **Storage limits**: 1GB free tier may fill quickly with many designs

**Cost Estimate (after free tier):**
- Pro tier: $25/month (8GB storage, 100GB bandwidth)
- Pay-as-you-go storage: $0.021/GB/month
- Est. 1,000 publishes/month: ~$1-5/month

#### Option 2: AWS S3 + DynamoDB
**Pros:**
- **Highly scalable**: Industry-standard object storage
- **Granular control**: Fine-tuned IAM policies, lifecycle rules
- **Mature ecosystem**: Many tools, SDKs, integrations
- **Cost optimization**: Lifecycle policies for archival (Glacier)

**Cons:**
- **Complex setup**: IAM policies, bucket configuration, serverless endpoint
- **Multiple services**: S3 (storage) + DynamoDB (metadata) + Lambda (write control)
- **Higher cognitive overhead**: More moving parts to maintain
- **Cost**: Less predictable; egress fees can surprise
- **No free tier for DynamoDB**: Charges start immediately

**Cost Estimate:**
- S3: $0.023/GB/month + $0.09/GB egress
- DynamoDB: $0.25/GB/month (on-demand)
- Lambda: $0.20/million requests
- Est. 1,000 publishes/month: ~$10-20/month

#### Option 3: Cloudflare R2 + D1/KV
**Pros:**
- **Zero egress fees**: Unlimited free bandwidth
- **S3-compatible API**: Easy migration path
- **Generous free tier**: 10GB storage/month
- **Edge compute**: Workers for write control

**Cons:**
- **Newer service**: Less mature than S3 (D1 still beta)
- **Limited query capabilities**: KV is key-value only; D1 has row limits
- **Workers complexity**: Need to write/deploy serverless functions
- **No built-in auth**: Must implement in Workers

**Cost Estimate:**
- R2: $0.015/GB/month storage (after 10GB free)
- Workers: $0.50/million requests (after 100k free)
- Est. 1,000 publishes/month: ~$2-5/month

#### Option 4: GitHub Releases / Git-LFS Branch
**Pros:**
- **No additional cost**: Included with GitHub repo
- **Version control**: All designs versioned by default
- **Simple API**: GitHub REST API

**Cons:**
- **Not designed for this**: Abuse of release system
- **LFS costs**: $0.07/GB/month after 1GB; egress limits
- **No search/filter**: Must implement custom indexing
- **Rate limits**: API throttling on free tier
- **Slow writes**: Commits/releases not optimized for frequent updates

**Not recommended** for this use case.

## Decision
**Choose Supabase** for the primary implementation.

### Rationale
1. **Best DX**: Single service with integrated DB + storage reduces complexity
2. **RLS**: Natural fit for "public read, restricted write" security model
3. **Free tier**: Sufficient for MVP and testing (1GB = ~500-1000 designs)
4. **JSONB**: Native support for flexible metadata queries
5. **Search**: Built-in full-text search without additional indexing service
6. **Scaling path**: Clear upgrade path to Pro tier when needed
7. **Python SDK**: First-class support with `supabase-py`

### Alternative Documented
Maintain documentation for **Cloudflare R2 + D1** as a fallback design in `docs/alt_s3_r2.md`:
- S3-compatible storage (zero egress costs)
- D1 (SQLite at edge) for metadata
- Workers for write control and presigned URLs
- Use case: If Supabase costs exceed budget or egress becomes dominant cost

## Implementation

### Supabase Setup
1. Create project: https://app.supabase.com
2. Create storage bucket `pots` (public read policy)
3. Create table `pots` (see migration: `db/migrations/0001_create_pots.sql`)
4. Enable RLS policies (public SELECT, service role INSERT)
5. Obtain service role key (Settings → API)

### Application Integration
- Module: `potfoundry/integrations/supabase_client.py`
- Secrets: `.streamlit/secrets.toml` → `[connections.supabase]`
- Graceful degradation: If not configured, hide publish UI
- Feature flag: `DISABLE_LIBRARY=1` env var for emergency disable

### Security Model
```
┌─────────────────────────────────────────────┐
│            Public Internet                  │
│  (Read: STL, PNG, JSON via CDN)            │
└──────────────────┬──────────────────────────┘
                   │ (HTTP GET, no auth)
                   ▼
┌─────────────────────────────────────────────┐
│         Supabase Storage (public)           │
│  Bucket: pots                               │
│  Policy: Allow public SELECT                │
└──────────────────┬──────────────────────────┘
                   │
                   │ (Service key)
                   │
┌─────────────────────────────────────────────┐
│      Streamlit App (write control)          │
│  - Validates input                          │
│  - Generates canonical hash                 │
│  - Checks dedup                             │
│  - Uploads via service key                  │
└──────────────────┬──────────────────────────┘
                   │ (Service role auth)
                   ▼
┌─────────────────────────────────────────────┐
│         Supabase Postgres (RLS)             │
│  Table: pots                                │
│  Policy: Service role INSERT only           │
└─────────────────────────────────────────────┘
```

## Consequences

### Positive
- Rapid development: Less boilerplate than multi-service AWS setup
- Low maintenance: Managed service handles backups, scaling, security patches
- Built-in CDN: Fast global access without configuring CloudFront
- Real-time potential: Can add live library updates in future
- Developer-friendly: Web UI for quick debugging/inspection

### Negative
- Vendor lock-in: Migrating off Supabase requires rewriting RLS logic
- Postgres-specific: JSONB queries not portable to MySQL/MongoDB
- Storage limits: May need to upgrade or add cleanup policies for old designs
- No multi-region: Data stored in single region (user-selected at project creation)

### Mitigations
- **Lock-in**: Document R2 alternative; canonical JSON makes data portable
- **Limits**: Implement deduplication aggressively; monitor usage
- **Cleanup**: Add "delete old unpopular designs" script (future)
- **Multi-region**: Acceptable for MVP; consider replication if latency issues arise

## Alternatives Retained for Reference

### When to Consider S3/R2
- **Egress costs dominate**: If downloads exceed 100GB/month, R2's zero-egress is cheaper
- **Multi-region required**: S3 cross-region replication more mature
- **Complex lifecycle**: Need automated archival to Glacier
- **Existing AWS infra**: If team already operates in AWS ecosystem

### Migration Path (if needed)
1. Export all `pots` table rows to JSON
2. Download all STL/PNG files from Supabase Storage
3. Upload to S3/R2 with same paths (`stl/{id}.stl`)
4. Import metadata to DynamoDB/D1
5. Update app to use new storage backend
6. Canonical IDs ensure no data loss/duplication

## References
- Supabase: https://supabase.com
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase Python SDK: https://github.com/supabase-community/supabase-py
- Alternative design: `docs/alt_s3_r2.md`

## Notes
- **Date**: 2024
- **Author**: PotFoundry Team
- **Supersedes**: None (initial ADR)
