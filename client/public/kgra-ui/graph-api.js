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

  // Snapshot endpoints (Phase 5)
  async function fetchSnapshot(at) { return fetch(`${BASE}/graph/snapshot?at=${encodeURIComponent(at)}`).then(r => r.json()).catch(() => null); }
  async function fetchSnapshotRange(from, to) { return fetch(`${BASE}/graph/snapshot/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(r => r.json()).catch(() => null); }
  async function fetchDiff(a, b) { return fetch(`${BASE}/graph/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then(r => r.json()).catch(() => null); }
  async function fetchHistory(nodeId) { return fetch(`${BASE}/graph/history?node_id=${encodeURIComponent(nodeId)}`).then(r => r.json()).catch(() => []); }
  async function fetchActivity(from, to, bucket) {
    let url = `${BASE}/graph/activity?bucket=${bucket || 'day'}`;
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;
    return fetch(url).then(r => r.json()).catch(() => []);
  }

  // Path endpoints (Phase 6)
  async function fetchPath(from, to) { return fetch(`${BASE}/graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(r => r.json()).catch(() => null); }
  async function fetchChain(start, type, depth) { return fetch(`${BASE}/graph/path/chain?start=${encodeURIComponent(start)}&type=${encodeURIComponent(type || 'CALLS')}&depth=${depth || 10}`).then(r => r.json()).catch(() => null); }
  async function fetchImpact(nodeId, depth) { return fetch(`${BASE}/graph/impact?node_id=${encodeURIComponent(nodeId)}&depth=${depth || 3}`).then(r => r.json()).catch(() => null); }

  // Cluster endpoints (Phase 6)
  async function fetchClusters() { return fetch(`${BASE}/graph/clusters`).then(r => r.json()).catch(() => []); }
  async function fetchClusterDetail(id) { return fetch(`${BASE}/graph/clusters/${id}`).then(r => r.json()).catch(() => null); }

  // Live endpoints (Phase 7-8)
  async function fetchPerformance() { return fetch(`${BASE}/graph/performance`).then(r => r.json()).catch(() => null); }

  return {
    fetchEntities, fetchRelationships, fetchModes, fetchCompositions,
    fetchStats, fetchFamilies, fetchTemplates,
    fetchSnapshot, fetchSnapshotRange, fetchDiff, fetchHistory, fetchActivity,
    fetchPath, fetchChain, fetchImpact,
    fetchClusters, fetchClusterDetail,
    fetchPerformance,
  };
})();
