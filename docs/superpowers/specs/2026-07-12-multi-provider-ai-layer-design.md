# Multi-Provider AI Layer with Native Web Search — Design

Date: 2026-07-12
Status: Approved (user said "do it / do all"), with the hashing→encryption correction below.

## Goal

Add a provider-agnostic AI layer to the RPM app that can talk to **Claude, OpenAI,
z.ai (GLM), and DeepSeek** through one library (**Vercel AI SDK v5**), with **native
embedded web search** (no third-party search API), an interactive **chat screen** with a
model picker, and a scaffolded **RPM Coach** endpoint that reuses the layer.

API keys are entered **in-app (Settings), per user**, stored **encrypted at rest**.

## Key decisions

- **Surface:** one shared backend AI layer, feeding both a chat screen and the coach.
- **Web search:** native per-provider (verified July 2026), behind one `webSearch` flag.
  No Tavily/Exa.
- **Models:** curated registry (editable config), each model flagged for web-search support.
- **Persistence:** conversations + messages saved to Postgres.
- **API keys:** per-user, entered in Settings, **AES-256-GCM encrypted at rest** (NOT hashed).

## SECURITY: keys are encrypted, not hashed

Hashing is one-way and would make the key unusable (we must send the real key to the
provider). We therefore **encrypt** with AES-256-GCM:

- Server holds a 32-byte master secret `AI_KEYS_SECRET` (base64) in backend env (Coolify).
  If absent, key storage is disabled (fail safe) and the Settings UI says so.
- On save: `iv = randomBytes(12)`; `cipher = aes-256-gcm(masterKey, iv)`; store
  `{ ciphertext, iv, auth_tag, last4 }`. Plaintext key never persisted.
- On use: decrypt in memory only, at provider-call time. Never logged.
- To the client: only ever return masked form `provider · ••••last4` and a boolean
  `configured`. The plaintext is never returned after save.

## Provider wiring (Vercel AI SDK v5)

| Provider  | AI SDK package                         | Native web search                                   |
|-----------|----------------------------------------|-----------------------------------------------------|
| Claude    | `@ai-sdk/anthropic`                    | `anthropic.tools.webSearch_20250305()`              |
| OpenAI    | `@ai-sdk/openai`                       | `openai.tools.webSearch({})`                        |
| z.ai/GLM  | `zhipu-ai-provider` (community)        | `tools:[{ type:'web_search', web_search:{enable:true} }]` |
| DeepSeek  | `@ai-sdk/anthropic` → `api.deepseek.com/anthropic` | native `server_tool_use` on the Anthropic-compatible endpoint |

Note: AI SDK v5 is ESM-only; the CommonJS backend loads it via a cached dynamic
`import()` (a tiny `esm.js` loader).

## Backend structure — `rpm-system/backend/src/ai/`

- `crypto.js` — `encryptSecret(plain)`, `decryptSecret(record)` (AES-256-GCM), `mask(last4)`.
- `registry.js` — curated `MODELS[]`: `{ id, provider, label, contextWindow, webSearch, reasoning }`.
- `esm.js` — cached dynamic `import()` of the ESM AI SDK packages.
- `providers.js` — `getModel(userId, modelId)`: resolve provider, load the user's decrypted
  key (or env fallback for the owner), build the AI SDK model instance (right baseURL).
- `webSearch.js` — `searchToolFor(provider)`: returns the correct native tool object.
- `service.js` — `runChat({ userId, modelId, messages, webSearch, stream })` → uniform
  `streamText`/`generateText`; yields token stream + collected `sources`.
- `coach.js` — assembles a user's RPM context and calls `service` with a Compass prompt.
- `keys.js` — CRUD for the per-user key records (store/list-masked/delete).

## Endpoints (all `authenticateToken`)

- `GET  /api/ai/models` — registry filtered to providers the user has a key for (or env fallback).
- `GET  /api/ai/keys` — masked list of configured providers.
- `PUT  /api/ai/keys/:provider` — save/replace a key (encrypts).
- `DELETE /api/ai/keys/:provider` — remove a key.
- `POST /api/ai/chat` — `{ conversationId?, modelId, message, webSearch }` → **SSE** token
  stream; final event carries `sources[]`; persists user + assistant messages.
- `GET  /api/ai/conversations` / `GET /api/ai/conversations/:id` / `DELETE …`.
- `POST /api/ai/coach/compass` — today's compass (reuses the layer). Scaffold only.

## Data model (new tables; manual prod migration per existing pattern)

```sql
user_api_keys (
  id uuid pk, user_id uuid fk, provider text,
  ciphertext text, iv text, auth_tag text, last4 text,
  created_at, updated_at, unique(user_id, provider)
)
ai_conversations (
  id uuid pk, user_id uuid fk, title text, model text, created_at, updated_at
)
ai_messages (
  id uuid pk, conversation_id uuid fk, role text, content text,
  model text, sources jsonb, created_at
)
```

## Frontend

- `src/pages/AssistantPage.jsx` (+ css) at `/assistant`: conversation list, chat pane,
  provider-grouped model dropdown, 🌐 web-search toggle (disabled when the registry marks
  the model unsupported), streaming render, per-message source links.
- `src/pages/SettingsPage.jsx` (+ css) at `/settings`: per-provider key fields showing
  masked/`configured` state; save/remove; a note when `AI_KEYS_SECRET` is missing.
- Nav: "Assistant" item; Settings reachable from the user menu.
- `App.jsx` `api`: methods for models, keys, chat (SSE), conversations, coach.
- Errors via existing `ToastProvider`.

## Config / env (docker-compose + Coolify)

- `AI_KEYS_SECRET` — 32-byte base64 master key (generated at deploy; feature-gates storage).
- Optional owner fallback keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ZHIPU_API_KEY`,
  `DEEPSEEK_API_KEY` (used only if a user has not set their own).

## Error handling & testing

- Normalized errors: missing key → "Add your <provider> key in Settings"; unsupported
  web search → toggle disabled; rate limit → toast; stream error → persist partial + error event.
- Backend smoke script (runs when keys present): trivial prompt + one web-search prompt per
  provider; registry consistency check; coach exercised against mock user designdemo2026.

## Scope (YAGNI)

**In:** backend AI layer (4 providers, registry, native web search, streaming chat,
persistence, per-user encrypted keys), Assistant chat UI, Settings key UI, coach endpoint.
**Deferred:** full Daily Compass ritual UI, usage/billing metering, vision/image,
non-search tool-calling, RAG/knowledge base.
