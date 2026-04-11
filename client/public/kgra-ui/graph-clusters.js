// ─── Graph Cluster Overlay ──────────────────────────────────────
// Community grouping, merge/split view, community sweep.

const GraphClusters = (() => {
  let _clusters = [];
  let _sweepIndex = 0;
  let _sweepInterval = null;

  // ── Load Clusters ─────────────────────────────────────────────

  async function loadClusters() {
    _clusters = await GraphAPI.fetchClusters();
    return _clusters;
  }

  // ── Toggle Cluster Mode ───────────────────────────────────────

  async function toggleClusterMode() {
    const isActive = GraphState.get('clusterMode');
    if (!isActive) {
      await enableClusterMode();
    } else {
      disableClusterMode();
    }
  }

  async function enableClusterMode() {
    if (!_clusters.length) await loadClusters();
    GraphState.dispatch('SET_CLUSTER', { clusterMode: true });

    const state = GraphState.getState();
    const animated = state.animationEnabled && !state.reducedMotion;

    // Group nodes by their type/family (as cluster ID)
    const clusterMap = new Map();
    for (const c of _clusters) {
      for (const member of c.members || []) {
        clusterMap.set(member, c.name);
      }
    }

    // Position nodes in cluster groups
    const clusterPositions = new Map();
    const numClusters = _clusters.length;
    _clusters.forEach((c, i) => {
      const angle = (2 * Math.PI * i) / numClusters;
      const radius = 300 + numClusters * 30;
      clusterPositions.set(c.name, {
        cx: Math.cos(angle) * radius,
        cy: Math.sin(angle) * radius,
      });
    });

    // Move each node toward its cluster center
    for (const n of state.nodes) {
      const clusterName = clusterMap.get(n.id) || clusterMap.get(n.label) || n.community;
      const pos = clusterPositions.get(clusterName);
      if (pos) {
        const tx = pos.cx + (Math.random() - 0.5) * 80;
        const ty = pos.cy + (Math.random() - 0.5) * 80;
        if (animated) {
          GraphAnimation.animate(n.id, 'x', n.x, tx, 'slow', 'easeInOut');
          GraphAnimation.animate(n.id, 'y', n.y, ty, 'slow', 'easeInOut');
        } else {
          n.x = tx; n.y = ty;
        }
      }
    }

    setTimeout(() => GraphCamera.fitAll(animated ? 400 : 0), animated ? 700 : 10);
  }

  function disableClusterMode() {
    GraphState.dispatch('SET_CLUSTER', { clusterMode: false, activeClusterId: null });
    // Re-run layout to restore natural positions
    if (typeof GraphLayout !== 'undefined') {
      GraphLayout.startForce();
    }
  }

  // ── Community Sweep ───────────────────────────────────────────

  async function startSweep(durationPerCommunity) {
    stopSweep();
    if (!_clusters.length) await loadClusters();
    if (!_clusters.length) return;

    _sweepIndex = 0;
    const duration = durationPerCommunity || 1500;
    const state = GraphState.getState();
    const animated = state.animationEnabled && !state.reducedMotion;

    _highlightCommunity(_sweepIndex, animated);

    _sweepInterval = setInterval(() => {
      _sweepIndex++;
      if (_sweepIndex >= _clusters.length) { stopSweep(); return; }
      _highlightCommunity(_sweepIndex, animated);
    }, duration);
  }

  function _highlightCommunity(index, animated) {
    const cluster = _clusters[index];
    if (!cluster) return;

    const state = GraphState.getState();
    const memberSet = new Set(cluster.members || []);

    // Active community: full opacity + glow
    // Others: dimmed
    for (const n of state.nodes) {
      if (memberSet.has(n.id) || memberSet.has(n.label)) {
        n.highlightState = 'cluster-active';
        if (animated) GraphAnimation.restore(n.id, 'fast');
      } else {
        n.highlightState = 'default';
        if (animated) GraphAnimation.dimTo(n.id, 0.2, 'fast');
        else n.animOpacity = 0.2;
      }
    }

    GraphState.dispatch('SET_CLUSTER', { activeClusterId: index + 1 });

    // Inspector shows community summary
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Community: ${cluster.name}</div>
        <div style="font-size:10px; color:var(--text-dim); line-height:1.6;">
          <div><strong>Nodes:</strong> ${cluster.nodeCount}</div>
          <div><strong>Type:</strong> ${cluster.type || 'auto'}</div>
          <div style="margin-top:4px;"><strong>Members (top 20):</strong></div>
          ${(cluster.members || []).slice(0, 20).map(m => `<div style="font-size:9px; color:var(--text-muted); padding:1px 0;">${typeof m === 'string' ? m.split('/').pop() : m}</div>`).join('')}
        </div>
        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="btn" onclick="GraphClusters.stopSweep()" style="font-size:9px; padding:2px 6px;">Stop Sweep</button>
        </div>
      `;
    }
  }

  function stopSweep() {
    if (_sweepInterval) { clearInterval(_sweepInterval); _sweepInterval = null; }
    // Restore all nodes
    const state = GraphState.getState();
    for (const n of state.nodes) {
      n.highlightState = 'default';
      GraphAnimation.restore(n.id, 'fast');
    }
    GraphState.dispatch('SET_CLUSTER', { activeClusterId: null });
  }

  return { loadClusters, toggleClusterMode, enableClusterMode, disableClusterMode, startSweep, stopSweep };
})();
