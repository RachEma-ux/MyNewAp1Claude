# Mock worker — single container image used by all five staging worker
# slots (graphrag / data-acquisition / external-orchestrator /
# sandbox-wf / kgra). The WORKER_NAME env var differentiates the
# /health response so logs and Phase 4 evidence can tell them apart.
#
# This is staging-mock only. Real workers ship from their own repos.

FROM node:20-alpine

WORKDIR /app

COPY server.js /app/server.js

ENV WORKER_PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
