# Cloudflare Pages Deployment

This project is configured for deployment on **Cloudflare Pages**.

## Automated Deployment

Deployment is triggered automatically by pushing to the `refactor/core-migration` branch (and others if configured in Cloudflare Dashboard).

-   **Build Command**: `npm run build`
-   **Output Directory**: `dist`

## Local Development (with Functions)

To run the application locally with Cloudflare Functions support (which normal `npm run dev` doesn't strictly emulate for the backend parts):

```bash
npm run dev:wrangler
```

This uses `wrangler pages dev` to proxy requests and emulate the Cloudflare environment while using Vite for HMR.

## Manual Deployment

If you need to manually deploy from your local machine:

```bash
npm run deploy
```

## Secrets

The following environment variables must be configured in the Cloudflare Pages Project Settings > Environment variables:

-   `STRIPE_SECRET_KEY`
-   `SUPABASE_URL`
-   `SUPABASE_SERVICE_KEY`
-   `STRIPE_WEBHOOK_SECRET` (if using webhooks)
