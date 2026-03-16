# AI Model Sabrina II

AI Model Sabrina II is a Vite + React comparison app with a Vercel-compatible backend. The UI stays aligned with the provided Sabrina reference project, while model visibility and provider routing are controlled entirely by backend configuration.

## Current Status

- Production: [https://ai-model-sabrina.vercel.app](https://ai-model-sabrina.vercel.app)
- Frontend UI: unchanged visual structure, model list comes from `/api/models`
- Enabled models today: 4 Volcengine text models
- Hidden models: any model with `enabled: false` in the registry

## Stack

- Frontend: React, TypeScript, Vite, Tailwind
- Local backend: Express via `server.ts`
- Vercel backend: `api/models.ts` and `api/compare.ts`
- Providers:
  - Volcengine Ark
  - IKunCode

## Model Configuration

Single source of truth:

- [/Users/jiaqi/Desktop/sabrina/AI-Model-Sabrina/lib/models.ts](/Users/jiaqi/Desktop/sabrina/AI-Model-Sabrina/lib/models.ts)

Each model entry controls:

- `enabled`: whether the UI shows it
- `channel`: `china` or `global`
- `provider`: which backend adapter handles it
- `upstreamModel`: the real model ID sent to the provider

The UI does not hardcode model cards. It fetches `/api/models`, so disabled models stay hidden automatically.

## Environment Variables

```env
ARK_API_KEY=
IKUN_API_KEY=
```

Configured on Vercel environments:

- `Production`
- `Preview`
- `Development`

## Provider Notes

### Volcengine Ark

- Working in production
- Verified with live `/api/compare` response on **2026-03-16**

### IKunCode

- Adapter implemented in [/Users/jiaqi/Desktop/sabrina/AI-Model-Sabrina/lib/ikun.ts](/Users/jiaqi/Desktop/sabrina/AI-Model-Sabrina/lib/ikun.ts)
- Requested target models were added to config as disabled placeholders:
  - `gpt5.4`
  - `claude-sonnet-4-6`
  - `gemini-3.1-pro-preview`
- As of **2026-03-16**, the provided IKunCode key's `/v1/models` response did not return those exact model IDs, so they are intentionally not displayed
- A live chat call with a returned IKun model ID responded with `No available channel`, so no IKun model is exposed in UI yet

## Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
```

## Backend Flow

1. Frontend loads `/api/models`
2. User only sees enabled models
3. Frontend posts prompt + selected model IDs to `/api/compare`
4. Backend resolves each model from the registry and routes by provider
5. Results are returned in the original Sabrina UI
