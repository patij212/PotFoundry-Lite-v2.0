# PotFoundry Web - Cloudflare Pages Deployment

This folder contains a standalone React + Vite application for PotFoundry.

## Deployment to Cloudflare Pages

### Option 1: Via GitHub (Recommended)

1. Push this folder to a GitHub repository
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Click "Create a project"
4. Connect your GitHub repo
5. Configure build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `potfoundry-web`
6. Deploy!

### Option 2: Direct Upload

1. Build locally: `npm run build`
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Click "Upload assets"
4. Upload the `dist` folder contents

## Environment Variables (for later phases)

Once you add Supabase Auth, you'll need these env vars:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Build Stats

- **JS:** 523 KB (159 KB gzipped)
- **CSS:** 48 KB (8 KB gzipped)
- **Total (gzipped):** ~167 KB

## Local Development

```bash
npm install
npm run dev     # Opens at http://127.0.0.1:3000/
npm run build   # Creates dist/ folder
npm run preview # Preview production build
```
