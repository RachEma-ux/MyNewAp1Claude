// ─── Graph Path Overlay ─────────────────────────────────────────
// Shortest path tracing, workflow chain playback, dependency ripple.

const GraphPaths = (() => {
  let _activeChain = [];
  let _chainStep = 0;
  let _chainInterval = null;

  // ── Shortest Path ─────────────────────────────────────────────

  async function tracePath(fromId, toId) {
    clearPath();
    const result = await GraphAPI.fetchPath(fromId, toId);
    if (!result || !result.path || result.length < 0) {
      if (typeof showToast === 'function') showToast('No path found', 'error');
      return;
    }

    const state = GraphState.getState();
    const pathIds = new Set(result.path);
    const animated = state.animationEnabled && !state.reducedMotion;

    // Highlight path nodes
    GraphState.dispatch('SET_SELECTED_PATH', { path: result.path });
    for (const n of state.nodes) {
      if (pathIds.has(n.id)) {
        n.highlightState = 'path-active';
        if (animated) GraphAnimation.pulse(n.id, 400);
      }
    }

    // Highlight path edges
    for (let i = 0; i < result.path.length - 1; i++) {
      const src = result.path[i];
      const tgt = result.path[i + 1];
      for (const e of state.edges) {
        if ((e.source === src && e.target === tgt) || (e.source === tgt && e.target === src)) {
          e.highlightState = 'path-active';
        }
      }
    }

    // Fit camera to path
    GraphCamera.fitNodes(result.path, 400);

    // Show in inspector
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Path: ${result.path.length} nodes</div>
        <div style="font-size:10px; color:var(--text-dim); line-height:1.8;">
          ${result.path.map((id, i) => {
            const node = state.nodeMap.get(id);
            return `<span style="cursor:pointer; ${i > 0 ? 'margin-left:4px;' : ''}" onclick="GraphCamera.focusNode('${id}',300)">${i > 0 ? '→ ' : ''}${node?.label || id}</span>`;
          }).join('')}
        </div>
        <button class="btn" onclick="GraphPaths.clearPath()" style="font-size:9px; padding:2px 6px; margin-top:8px;">Clear Path</button>
      `;
    }
  }

  function clearPath() {
    const state = GraphState.getState();
    GraphState.dispatch('SET_SELECTED_PATH', { path: [] });
    for (const n of state.nodes) {
      if (n.highlightState === 'path-active') n.highlightState = 'default';
    }
    for (const e of state.edges) {
      if (e.highlightState === 'path-active') e.highlightState = 'default';
    }
  }

  // ── Workflow Chain Playback ────────────────────────────────────

  async function playChain(startNodeId, edgeType, stepDuration) {
    stopChain();
    const result = await fetch(`/api/kgra-proxy/graph/path/chain?start=${startNodeId}&type=${edgeType || 'CALLS'}&depth=20`).then(r => r.json()).catch(() => null);
    if (!result || !result.chain || result.chain.length < 2) {
      if (typeof showToast === 'function') showToast('No chain found', 'error');
      return;
    }

    _activeChain = result.chain;
    _chainStep = 0;
    const duration = stepDuration || 500;
    const state = GraphState.getState();
    const animated = state.animationEnabled && !state.reducedMotion;

    // Highlight first node
    _highlightChainStep(0, animated);

    // Step through chain
    _chainInterval = setInterval(() => {
      _chainStep++;
      if (_chainStep >= _activeChain.length) { stopChain(); return; }
      _highlightChainStep(_chainStep, animated);
    }, duration);

    GraphCamera.fitNodes(_activeChain, 400);
  }

  function _highlightChainStep(step, animated) {
    const state = GraphState.getState();
    const nodeId = _activeChain[step];
    const node = state.nodeMap.get(nodeId);

    // Previous steps stay highlighted (dimmer)
    for (let i = 0; i < step; i++) {
      const prev = state.nodeMap.get(_activeChain[i]);
      if (prev) prev.highlightState = 'related';
    }

    // Current step pulses
    if (node) {
      node.highlightState = 'path-active';
      if (animated) GraphAnimation.pulse(nodeId, 300);
      GraphCamera.focusNode(nodeId, 200);
    }

    // Update inspector
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Chain Step ${step + 1}/${_activeChain.length}</div>
        <div style="font-size:10px; color:var(--text-dim);">${node?.label || nodeId}</div>
        <div style="font-size:9px; color:var(--text-muted); margin-top:4px;">Type: ${node?.type || '—'}</div>
        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="btn" onclick="GraphPaths.stopChain()" style="font-size:9px; padding:2px 6px;">Stop</button>
        </div>
      `;
    }
  }

  function stopChain() {
    if (_chainInterval) { clearInterval(_chainInterval); _chainInterval = null; }
    // Clear chain highlights
    const state = GraphState.getState();
    for (const id of _activeChain) {
      const node = state.nodeMap.get(id);
      if (node) node.highlightState = 'default';
    }
    _activeChain = [];
    _chainStep = 0;
  }

  // ── Dependency Ripple ─────────────────────────────────────────

  async function showRipple(nodeId, maxDepth) {
    clearPath();
    const result = await GraphAPI.fetchImpact(nodeId, maxDepth || 3);
    if (!result || !result.layers) return;

    const state = GraphState.getState();
    const animated = state.animationEnabled && !state.reducedMotion;

    // Source node
    const source = state.nodeMap.get(nodeId);
    if (source) {
      source.highlightState = 'path-active';
      if (animated) GraphAnimation.pulse(nodeId, 400);
    }

    // Ripple layers with delay
    const allImpacted = [nodeId];
    result.layers.forEach((layer, depth) => {
      setTimeout(() => {
        for (const id of layer) {
          const node = state.nodeMap.get(id);
          if (node) {
            node.highlightState = 'related';
            if (animated) {
              GraphAnimation.animate(node.id, 'animScale', 0.8, 1.1, 'normal', 'spring');
              setTimeout(() => GraphAnimation.animate(node.id, 'animScale', 1.1, 1, 'fast', 'easeOut'), 300);
            }
          }
          allImpacted.push(id);
        }
      }, (depth + 1) * 300);
    });

    // Fit camera after ripple
    setTimeout(() => {
      GraphCamera.fitNodes(allImpacted, 400);
    }, (result.layers.length + 1) * 300);

    // Inspector
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Impact Analysis</div>
        <div style="font-size:10px; color:var(--text-dim); line-height:1.6;">
          <div><strong>Source:</strong> ${source?.label || nodeId}</div>
          <div><strong>Total impacted:</strong> ${result.totalImpacted}</div>
          <div><strong>Depth:</strong> ${result.depth} hops</div>
          ${result.layers.map((l, i) => `<div>Layer ${i + 1}: ${l.length} nodes</div>`).join('')}
        </div>
        <button class="btn" onclick="GraphPaths.clearPath()" style="font-size:9px; padding:2px 6px; margin-top:8px;">Clear</button>
      `;
    }
  }

  return { tracePath, clearPath, playChain, stopChain, showRipple };
})();
