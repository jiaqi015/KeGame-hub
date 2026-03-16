# AI Model Sabrina

AI Model Sabrina is a Vercel-ready front-end concept for comparing model personalities, product angles, and prompt responses in one polished board. It is designed to be pushed from GitHub and preview-deployed immediately without backend setup.

## What changed

- Reworked into a pure Vite + React deployment path.
- Added a richer visual system, prompt presets, and staged comparison cards.
- Removed the local Express server dependency so Vercel can build it as a static site.
- Added explicit `vercel.json` config for cleaner project setup.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to Vercel

This repo is configured for Vercel preview deployments:

```bash
vercel
```

If you want a production deploy later:

```bash
vercel --prod
```

## Notes

The current comparison flow is a front-end demo layer. It is intentionally API-free so the first deployment works immediately. Live model adapters can be added later behind API routes or a separate backend.
