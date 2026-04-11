// ─── Graph Layout Engine ────────────────────────────────────────
// Force-directed, hierarchy, circular layouts with controls.
// Stabilization detection, freeze/unfreeze, presets.
// Decoupled from rendering — updates positions in GraphState.

const GraphLayout = (() => {
  let _running = false;
  let _frame = null;
  let _iter = 0;
  let _maxIter = 120;
  let _onStabilize = null;

  // ── Presets ───────────────────────────────────────────────────

  const PRESETS = {
    balanced:    { repel: 800,  linkDist: 80,  centerForce: 0.01,  description: 'Default balanced layout' },
    compact:     { repel: 400,  linkDist: 40,  centerForce: 0.05,  description: 'Dense, tight grouping' },
    spread:      { repel: 1500, linkDist: 150, centerForce: 0.005, description: 'Sparse, readable spread' },
    investigation: { repel: 1000, linkDist: 100, centerForce: 0.01, description: 'Balanced + auto-stabilize' },
    'dense-safe':  { repel: 300,  linkDist: 30,  centerForce: 0.08, description: 'For 500+ node graphs' },
  };

  // ── Force Layout ──────────────────────────────────────────────

  function startForce(options) {
    stop();
    const state = GraphState.getState();
    const { nodes, edges, nodeMap } = state;
    if (!nodes.length) return;

    const params = { ...state.layoutParams, ...(options || {}) };
    _maxIter = Math.min(120, Math.max(40, 8000 / nodes.length));
    _iter = 0;
    _running = true;

    GraphState.dispatch('SET_LAYOUT', { layout: 'force', stabilized: false, frozen: false });

    function step() {
      if (!_running) return;
      const decay = 1 - _iter / _maxIter;

      // Repulsion (all pairs)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = (params.repel * decay) / (dist * dist);
          nodes[i].x -= dx / dist * force;
          nodes[i].y -= dy / dist * force;
          nodes[j].x += dx / dist * force;
          nodes[j].y += dy / dist * force;
        }
      }

      // Attraction (edges)
      for (const e of edges) {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt) continue;
        let dx = tgt.x - src.x;
        let dy = tgt.y - src.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = (dist - params.linkDist) * 0.008 * decay;
        src.x += dx / dist * force;
        src.y += dy / dist * force;
        tgt.x -= dx / dist * force;
        tgt.y -= dy / dist * force;
      }

      // Center gravity
      for (const n of nodes) {
        n.x *= (1 - params.centerForce);
        n.y *= (1 - params.centerForce);
      }

      _iter++;
      if (_iter >= _maxIter) {
        _running = false;
        GraphState.dispatch('SET_LAYOUT', { stabilized: true });
        if (_onStabilize) _onStabilize();
      } else {
        _frame = requestAnimationFrame(step);
      }
    }

    _frame = requestAnimationFrame(step);
  }

  // ── Hierarchy Layout ──────────────────────────────────────────

  function startHierarchy() {
    stop();
    const { nodes, edges } = GraphState.getState();
    if (!nodes.length) return;

    GraphState.dispatch('SET_LAYOUT', { layout: 'hierarchy', stabilized: true, frozen: true });

    const conns = {};
    edges.forEach(e => { conns[e.source] = (conns[e.source] || 0) + 1; conns[e.target] = (conns[e.target] || 0) + 1; });
    const sorted = [...nodes].sort((a, b) => (conns[b.id] || 0) - (conns[a.id] || 0));
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const spacing = Math.max(60, 400 / Math.sqrt(sorted.length));

    // Animate positions
    const state = GraphState.getState();
    sorted.forEach((n, i) => {
      const tx = (i % cols - cols / 2) * spacing;
      const ty = (Math.floor(i / cols) - Math.floor(sorted.length / cols) / 2) * spacing * 0.8;
      if (state.animationEnabled && !state.reducedMotion) {
        GraphAnimation.animate(n.id, 'x', n.x, tx, 'slow', 'easeInOut');
        GraphAnimation.animate(n.id, 'y', n.y, ty, 'slow', 'easeInOut');
      } else {
        n.x = tx; n.y = ty;
      }
    });

    setTimeout(() => GraphCamera.fitAll(state.animationEnabled ? 400 : 0), state.animationEnabled ? 650 : 10);
  }

  // ── Circular Layout ───────────────────────────────────────────

  function startCircular() {
    stop();
    const { nodes } = GraphState.getState();
    if (!nodes.length) return;

    GraphState.dispatch('SET_LAYOUT', { layout: 'circular', stabilized: true, frozen: true });

    const radius = Math.max(150, nodes.length * 8);
    const state = GraphState.getState();

    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const tx = Math.cos(angle) * radius;
      const ty = Math.sin(angle) * radius;
      if (state.animationEnabled && !state.reducedMotion) {
        GraphAnimation.animate(n.id, 'x', n.x, tx, 'slow', 'easeInOut');
        GraphAnimation.animate(n.id, 'y', n.y, ty, 'slow', 'easeInOut');
      } else {
        n.x = tx; n.y = ty;
      }
    });

    setTimeout(() => GraphCamera.fitAll(state.animationEnabled ? 400 : 0), state.animationEnabled ? 650 : 10);
  }

  // ── Controls ──────────────────────────────────────────────────

  function stop() {
    _running = false;
    if (_frame) cancelAnimationFrame(_frame);
    _frame = null;
  }

  function freeze() {
    stop();
    GraphState.dispatch('SET_LAYOUT', { frozen: true, stabilized: true });
  }

  function unfreeze() {
    GraphState.dispatch('SET_LAYOUT', { frozen: false });
    startForce();
  }

  function restart() {
    // Re-randomize positions, then start force
    const nodes = GraphState.get('nodes');
    for (const n of nodes) {
      n.x = (Math.random() - 0.5) * 800;
      n.y = (Math.random() - 0.5) * 800;
    }
    startForce();
  }

  function setParams(params) {
    GraphState.dispatch('SET_LAYOUT', { params });
    // If force is active, restart with new params
    if (GraphState.get('layout') === 'force' && !GraphState.get('layoutFrozen')) {
      startForce(params);
    }
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    setParams(preset);
  }

  function switchLayout(layout) {
    if (layout === 'force') startForce();
    else if (layout === 'hierarchy') startHierarchy();
    else if (layout === 'circular') startCircular();
  }

  function onStabilize(fn) { _onStabilize = fn; }
  function isRunning() { return _running; }

  return {
    startForce, startHierarchy, startCircular,
    stop, freeze, unfreeze, restart,
    setParams, applyPreset, switchLayout,
    onStabilize, isRunning,
    PRESETS,
  };
})();
