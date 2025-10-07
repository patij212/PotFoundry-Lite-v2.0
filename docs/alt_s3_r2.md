# Alternative Storage: S3/R2 Implementation

## Overview
This document provides an alternative implementation design using **Cloudflare R2** (or AWS S3) as the storage backend instead of Supabase. Use this design if:
- Egress bandwidth costs become significant (>100GB/month)
- You prefer S3-compatible storage
- You want to avoid vendor lock-in to Supabase
- You already have AWS/Cloudflare infrastructure

## Architecture

### Components
1. **Cloudflare R2** (or AWS S3): Object storage for STL, PNG, JSON files
2. **Cloudflare D1** (or AWS DynamoDB): Metadata index for search/filter
3. **Cloudflare Worker** (or AWS Lambda): Presigned upload URL generator and write control
4. **Application**: Same canonical hashing and dedup logic

### Data Flow
```
User Export → Canonical Hash → Worker API (presigned PUT)
                                    ↓
                              R2 Upload (STL, PNG, JSON)
                                    ↓
                              D1 Insert (metadata)
                                    ↓
                              Return publish result

Library Query → D1 Query (filter/search) → R2 URLs
```

## Storage Setup (Cloudflare R2)

### Bucket Configuration
```bash
# Create bucket via Cloudflare Dashboard or API
# Bucket name: pots
# Public access: Read-only via public URL
```

### Bucket Policy (Public Read)
R2 doesn't use traditional IAM policies. Instead, configure:
1. **Public bucket** with custom domain (e.g., `library.potfoundry.com`)
2. **R2.dev subdomain** for automatic public URLs
3. **Cloudflare Access** rules (optional) for write protection

### File Paths
Same as Supabase:
- `stl/{id}.stl` or `stl/{id}.stl.gz`
- `thumb/{id}.png`
- `meta/{id}.json`

### Cost
- Storage: $0.015/GB/month (after 10GB free)
- **Egress: $0** (unlimited free bandwidth)
- Class A ops (writes): $4.50/million
- Class B ops (reads): $0.36/million

**Estimate**: 1,000 publishes/month = ~$0.05-2.00/month

## Metadata Index (Cloudflare D1)

### Schema
```sql
CREATE TABLE pots (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    style TEXT NOT NULL,
    size TEXT NOT NULL,              -- JSON string
    opts TEXT NOT NULL,              -- JSON string
    mesh TEXT NOT NULL,              -- JSON string
    stl_url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    created_at INTEGER NOT NULL,     -- Unix timestamp
    tags TEXT NOT NULL,              -- JSON array string
    app_commit TEXT,
    diagnostics TEXT NOT NULL,       -- JSON string
    license TEXT NOT NULL
);

CREATE INDEX idx_style_created ON pots (style, created_at DESC);
CREATE INDEX idx_created ON pots (created_at DESC);
```

**Note**: D1 (SQLite) doesn't have native JSONB or array types, so store as TEXT and parse in application.

### Queries
```sql
-- Latest designs
SELECT * FROM pots ORDER BY created_at DESC LIMIT 24 OFFSET 0;

-- Filter by style
SELECT * FROM pots WHERE style = 'HarmonicRipple' ORDER BY created_at DESC LIMIT 24;

-- Search by title (SQLite FTS)
SELECT * FROM pots WHERE title LIKE '%flower%' ORDER BY created_at DESC LIMIT 24;

-- Tag search (requires JSON parsing in Worker)
SELECT * FROM pots WHERE tags LIKE '%modern%' ORDER BY created_at DESC LIMIT 24;
```

## Write Control (Cloudflare Worker)

### Worker Endpoint: `POST /api/publish`
```javascript
// worker.js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await request.json()
  
  // Validate signature (shared secret)
  const expectedSig = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body.payload + SECRET_KEY)
  )
  if (body.signature !== bufferToHex(expectedSig)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Validate payload
  const { id, title, style, size, opts, mesh, diagnostics, license, tags } = body
  if (!id || !title || !license) {
    return new Response('Invalid payload', { status: 400 })
  }

  // Check dedup in D1
  const existing = await env.DB.prepare('SELECT id FROM pots WHERE id = ?').bind(id).first()
  if (existing) {
    return Response.json({ duplicate: true, id, stl_url: `https://library.potfoundry.com/stl/${id}.stl` })
  }

  // Generate presigned PUT URLs (R2 supports this via Workers)
  const stlKey = `stl/${id}.stl`
  const thumbKey = `thumb/${id}.png`
  const metaKey = `meta/${id}.json`

  // Return presigned URLs for app to upload directly
  return Response.json({
    stl_upload_url: await generatePresignedPutUrl(env.BUCKET, stlKey),
    thumb_upload_url: await generatePresignedPutUrl(env.BUCKET, thumbKey),
    meta_upload_url: await generatePresignedPutUrl(env.BUCKET, metaKey),
    callback_url: `/api/finalize/${id}`,
  })
}

async function generatePresignedPutUrl(bucket, key) {
  // R2 via Workers doesn't have traditional presigned URLs
  // Instead, return a token that the app can use with a second Worker endpoint
  const token = await createSecureToken(key)
  return `https://upload.potfoundry.com/put/${key}?token=${token}`
}
```

### Worker Endpoint: `POST /api/finalize/{id}`
```javascript
// Called after app uploads all files
addEventListener('fetch', event => {
  event.respondWith(handleFinalize(event.request))
})

async function handleFinalize(request) {
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()
  const body = await request.json()

  // Verify all files exist in R2
  const stlExists = await env.BUCKET.head(`stl/${id}.stl`)
  const thumbExists = await env.BUCKET.head(`thumb/${id}.png`)
  if (!stlExists || !thumbExists) {
    return new Response('Upload incomplete', { status: 400 })
  }

  // Insert metadata into D1
  await env.DB.prepare(`
    INSERT INTO pots (id, title, style, size, opts, mesh, stl_url, thumb_url, created_at, tags, diagnostics, license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.title,
    body.style,
    JSON.stringify(body.size),
    JSON.stringify(body.opts),
    JSON.stringify(body.mesh),
    `https://library.potfoundry.com/stl/${id}.stl`,
    `https://library.potfoundry.com/thumb/${id}.png`,
    Math.floor(Date.now() / 1000),
    JSON.stringify(body.tags),
    JSON.stringify(body.diagnostics),
    body.license
  ).run()

  return Response.json({ success: true, id })
}
```

### Security
- **Shared secret**: App signs requests with HMAC-SHA256
- **Token-based uploads**: Short-lived tokens (5 min expiry)
- **Rate limiting**: Cloudflare built-in or custom logic in Worker
- **Content validation**: Check file sizes, MIME types

## Application Changes

### Config
```toml
# .streamlit/secrets.toml
[connections.r2]
worker_url = "https://api.potfoundry.com"
secret_key = "your-shared-secret-key"
library_base_url = "https://library.potfoundry.com"
```

### Publish Flow
```python
import hashlib
import hmac
import requests

def publish_design_r2(stl_bytes, payload, title, tags, license):
    # Generate canonical ID
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    content_hash = hashlib.sha256(canonical_json.encode()).hexdigest()
    
    # Create signature
    signature = hmac.new(
        SECRET_KEY.encode(),
        canonical_json.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Request presigned URLs
    resp = requests.post(
        f"{WORKER_URL}/api/publish",
        json={
            "id": content_hash,
            "title": title,
            "style": payload["style"],
            "size": payload["size"],
            "opts": payload["opts"],
            "mesh": payload["mesh"],
            "diagnostics": payload["diagnostics"],
            "license": license,
            "tags": tags,
            "signature": signature,
            "payload": canonical_json,
        }
    )
    
    if resp.json().get("duplicate"):
        return resp.json()
    
    urls = resp.json()
    
    # Upload files to presigned URLs
    requests.put(urls["stl_upload_url"], data=stl_bytes)
    requests.put(urls["thumb_upload_url"], data=thumb_bytes)
    requests.put(urls["meta_upload_url"], data=canonical_json.encode())
    
    # Finalize
    final_resp = requests.post(
        urls["callback_url"],
        json={"title": title, "style": payload["style"], ...}
    )
    
    return final_resp.json()
```

### Query Flow
```python
def list_published_r2(style=None, tags=None, offset=0, limit=24):
    # Query D1 via Worker endpoint
    params = {"offset": offset, "limit": limit}
    if style:
        params["style"] = style
    if tags:
        params["tags"] = ",".join(tags)
    
    resp = requests.get(f"{WORKER_URL}/api/library", params=params)
    items = resp.json()["items"]
    
    # Parse JSON strings back to dicts
    for item in items:
        item["size"] = json.loads(item["size"])
        item["opts"] = json.loads(item["opts"])
        item["tags"] = json.loads(item["tags"])
    
    return items
```

## AWS S3 + DynamoDB Variant

### S3 Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::potfoundry-library/*"
    }
  ]
}
```

### IAM Policy for Lambda (write control)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::potfoundry-library/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/pots"
    }
  ]
}
```

### DynamoDB Table
```javascript
// Table name: pots
// Primary key: id (String)
// GSI: style-created-index (Partition: style, Sort: created_at)
{
  TableName: "pots",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "style", AttributeType: "S" },
    { AttributeName: "created_at", AttributeType: "N" }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "style-created-index",
      KeySchema: [
        { AttributeName: "style", KeyType: "HASH" },
        { AttributeName: "created_at", KeyType: "RANGE" }
      ],
      Projection: { ProjectionType: "ALL" }
    }
  ],
  BillingMode: "PAY_PER_REQUEST"
}
```

### Lambda Function (Python)
```python
import boto3
import json
from datetime import datetime, timedelta

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('pots')

def lambda_handler(event, context):
    # Parse request
    body = json.loads(event['body'])
    
    # Validate signature
    # ... (same as Worker)
    
    # Check dedup
    resp = table.get_item(Key={'id': body['id']})
    if 'Item' in resp:
        return {'statusCode': 200, 'body': json.dumps({'duplicate': True, 'id': body['id']})}
    
    # Generate presigned PUT URLs
    stl_url = s3.generate_presigned_url(
        'put_object',
        Params={'Bucket': 'potfoundry-library', 'Key': f"stl/{body['id']}.stl"},
        ExpiresIn=300
    )
    thumb_url = s3.generate_presigned_url(
        'put_object',
        Params={'Bucket': 'potfoundry-library', 'Key': f"thumb/{body['id']}.png"},
        ExpiresIn=300
    )
    
    return {'statusCode': 200, 'body': json.dumps({
        'stl_upload_url': stl_url,
        'thumb_upload_url': thumb_url,
        'callback_url': f"/finalize/{body['id']}"
    })}
```

## Cost Comparison

| Service | Storage (1,000 designs) | Bandwidth (100GB) | Database | Total/month |
|---------|-------------------------|-------------------|----------|-------------|
| **Supabase** | Free (1GB tier) | Free (2GB tier) | Free | **$0-25** |
| **Cloudflare R2** | $0.15 (10GB) | $0 (unlimited) | $5 (D1 paid) | **$5-10** |
| **AWS S3+DDB** | $0.23 (10GB) | $9 (egress) | $2.50 (DDB) | **$12-15** |

**Winner**: Supabase for small scale; R2 for high bandwidth.

## Migration Path

### Export from Supabase
```sql
-- Export metadata
COPY (SELECT * FROM pots ORDER BY created_at) TO '/tmp/pots.csv' CSV HEADER;
```

```python
# Download files
import supabase
client = supabase.create_client(url, key)
rows = client.table('pots').select('*').execute()

for row in rows.data:
    stl_bytes = requests.get(row['stl_url']).content
    thumb_bytes = requests.get(row['thumb_url']).content
    # Save locally for re-upload
```

### Import to R2
```python
import boto3
s3 = boto3.client('s3', endpoint_url='https://<account>.r2.cloudflarestorage.com')

for row in rows:
    s3.put_object(Bucket='pots', Key=f"stl/{row['id']}.stl", Body=stl_bytes)
    s3.put_object(Bucket='pots', Key=f"thumb/{row['id']}.png", Body=thumb_bytes)
    
    # Insert to D1 via Worker API
    requests.post(f"{WORKER_URL}/api/import", json=row)
```

## Recommendations

### Use Supabase if:
- Starting out (free tier sufficient)
- Want integrated solution (less ops)
- Prefer SQL/Postgres
- Don't expect high egress (< 50GB/month)

### Use R2 if:
- Egress costs matter (>100GB/month downloads)
- Already use Cloudflare
- Want S3 compatibility
- Budget for D1 paid tier ($5/month base)

### Use S3+DDB if:
- Enterprise AWS environment
- Need multi-region replication
- Require AWS-specific features (Glacier, S3 Select)
- Can optimize costs with Reserved Capacity

## References
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- AWS S3: https://aws.amazon.com/s3/
- AWS DynamoDB: https://aws.amazon.com/dynamodb/
- AWS Lambda: https://aws.amazon.com/lambda/
