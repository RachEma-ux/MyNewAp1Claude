# Test fixtures

## `mock-provider-server.ts`

Local HTTP server fixture used by the Model Access test suite. Mocks the three provider shapes the runtime talks to:

- OpenAI-compatible: `GET /v1/models`, `POST /v1/chat/completions`
- Anthropic Messages: `GET /v1/models`, `POST /v1/messages`
- Ollama: `GET /api/tags`, `POST /api/chat`

CI runs against this fixture exclusively. **No real OpenAI/Anthropic API key is required to run `npm run test`.**

### Live provider tests (manual only)

Tests that hit a real provider endpoint (e.g. `api.openai.com`, `api.anthropic.com`) are gated behind:

```sh
RUN_LIVE_PROVIDER_TESTS=1 \
  OPENAI_API_KEY=sk-… \
  ANTHROPIC_API_KEY=sk-ant-… \
  npx vitest run path/to/live.test.ts
```

Live tests are **manual only**:

- They are not added to the default `npm run test` set.
- CI never sets `RUN_LIVE_PROVIDER_TESTS`.
- The opt-in env var is checked through `liveProviderTestsEnabled()` in `mock-provider-server.ts` so individual live tests can early-skip cleanly.

### Why this exists

Plan v3 Decision D6 (DECISION_RECORD.md): CI uses mocks/local provider fixtures; live provider tests are opt-in only. Without this fixture, every Model Access test would either need a real PAT or have to monkey-patch `fetch` — the first leaks credentials into CI, the second skips wire-level coverage. The mock server gives us the same end-to-end coverage with zero secret exposure.
