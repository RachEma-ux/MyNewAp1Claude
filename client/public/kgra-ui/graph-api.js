// ─── Graph API Client ───────────────────────────────────────────
// All graph data fetching in one place.

const GraphAPI = (() => {
  const BASE = '/api/kgra-proxy';

  async function fetchEntities(hubCount, mode) {
    const modeParam = mode && mode !== 'all' ? `&mode=${mode}` : '';
    return fetch(`${BASE}/v1/analytics/entities?hub_count=${hubCount || 10}${modeParam}`).then(r => r.json()).catch(() => []);
  }

  async function fetchRelationships(mode) {
    const modeParam = mode && mode !== 'all' ? `?mode=${mode}` : '';
    return fetch(`${BASE}/v1/analytics/relationships${modeParam}`).then(r => r.json()).catch(() => []);
  }

  async function fetchModes() {
    return fetch(`${BASE}/modes`).then(r => r.json()).catch(() => []);
  }

  async function fetchCompositions() {
    return fetch(`${BASE}/modes/compositions`).then(r => r.json()).catch(() => []);
  }

  async function fetchStats() {
    return fetch(`${BASE}/graphrag/stats`).then(r => r.json()).catch(() => ({}));
  }

  async function fetchFamilies() {
    return fetch(`${BASE}/reference/families`).then(r => r.json()).catch(() => ({}));
  }

  async function fetchTemplates() {
    return fetch(`${BASE}/templates`).then(r => r.json()).catch(() => []);
  }

  // Future endpoints (Phase 5+)
  async function fetchSnapshot(at) { return fetch(`${BASE}/graph/snapshot?at=${at}`).then(r => r.json()).catch(() => null); }
  async function fetchDiff(a, b) { return fetch(`${BASE}/graph/diff?a=${a}&b=${b}`).then(r => r.json()).catch(() => null); }
  async function fetchPath(from, to) { return fetch(`${BASE}/graph/path?from=${from}&to=${to}`).then(r => r.json()).catch(() => null); }
  async function fetchImpact(nodeId, depth) { return fetch(`${BASE}/graph/impact?node_id=${nodeId}&depth=${depth || 3}`).then(r => r.json()).catch(() => null); }
  async function fetchClusters() { return fetch(`${BASE}/graph/clusters`).then(r => r.json()).catch(() => []); }

  return {
    fetchEntities, fetchRelationships, fetchModes, fetchCompositions,
    fetchStats, fetchFamilies, fetchTemplates,
    fetchSnapshot, fetchDiff, fetchPath, fetchImpact, fetchClusters,
  };
})();
