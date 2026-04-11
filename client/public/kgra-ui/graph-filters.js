// ─── Graph Filter Engine ────────────────────────────────────────
// Animated filtering: nodes fade/dim before hiding.
// Depth slider, progressive reveal, search integration.

const GraphFilters = (() => {

  // ── Apply Filters ─────────────────────────────────────────────

  function applyFilters() {
    const state = GraphState.getState();
    const filters = state.filters;
    const { nodes, edges } = state;
    const animated = state.animationEnabled && !state.reducedMotion;

    for (const n of nodes) {
      const shouldShow = _nodePassesFilters(n, filters);
      const wasVisible = n.visibilityState !== 'filtered' && n.visibilityState !== 'hidden';

      if (shouldShow && !wasVisible) {
        // Entering: fade in
        n.visibilityState = 'visible';
        if (animated) {
          GraphAnimation.animate(n.id, 'animOpacity', 0, 1, 'normal', 'easeOut');
          GraphAnimation.animate(n.id, 'animScale', 0.5, 1, 'normal', 'easeOut');
        } else {
          n.animOpacity = 1;
          n.animScale = 1;
        }
      } else if (!shouldShow && wasVisible) {
        // Exiting: fade out
        n.visibilityState = 'filtered';
        if (animated) {
          GraphAnimation.animate(n.id, 'animOpacity', 1, 0, 'normal', 'easeOut');
          GraphAnimation.animate(n.id, 'animScale', 1, 0.5, 'normal', 'easeOut');
        } else {
          n.animOpacity = 0;
          n.animScale = 0.5;
        }
      }
    }

    // Filter edges: hide if either endpoint is filtered
    const visibleNodeIds = new Set(nodes.filter(n => n.visibilityState === 'visible' || n.visibilityState === 'collapsed').map(n => n.id));
    for (const e of edges) {
      const shouldShow = visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target);
      if (shouldShow && e.visibilityState === 'filtered') {
        e.visibilityState = 'visible';
        if (animated) GraphAnimation.animate(e.id, 'animOpacity', 0, 1, 'fast', 'easeOut');
        else e.animOpacity = 1;
      } else if (!shouldShow && e.visibilityState !== 'filtered') {
        e.visibilityState = 'filtered';
        if (animated) GraphAnimation.animate(e.id, 'animOpacity', 1, 0, 'fast', 'easeOut');
        else e.animOpacity = 0;
      }
    }
  }

  function _nodePassesFilters(node, filters) {
    // Type filter
    if (filters.types.size > 0 && !filters.types.has(node.type)) return false;
    // Family filter
    if (filters.families.size > 0 && !filters.families.has(node.family)) return false;
    // Status filter
    if (filters.status.size > 0 && node.status && !filters.status.has(node.status)) return false;
    // Owner filter
    if (filters.owner.size > 0 && node.owner && !filters.owner.has(node.owner)) return false;
    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!node.label.toLowerCase().includes(q) && !node.id.toLowerCase().includes(q)) return false;
    }
    // Depth filter (relative to selected node)
    if (filters.depth < Infinity) {
      const selectedId = GraphState.get('selectedNodeId');
      if (selectedId && node.id !== selectedId) {
        const dist = _distanceFromNode(node.id, selectedId, filters.depth);
        if (dist > filters.depth) return false;
      }
    }
    // Collapsed by emphasis
    if (node.visibilityState === 'collapsed') return true; // collapsed but still "visible" as stub
    return true;
  }

  // ── Depth Calculation ─────────────────────────────────────────

  function _distanceFromNode(nodeId, fromId, maxDepth) {
    const edges = GraphState.get('edges');
    const visited = new Set([fromId]);
    let frontier = [fromId];
    let depth = 0;

    while (depth < maxDepth && frontier.length > 0) {
      depth++;
      const next = [];
      for (const current of frontier) {
        for (const e of edges) {
          let neighbor = null;
          if (e.source === current && !visited.has(e.target)) neighbor = e.target;
          if (e.target === current && !visited.has(e.source)) neighbor = e.source;
          if (neighbor) {
            if (neighbor === nodeId) return depth;
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
    return Infinity;
  }

  // ── Filter Controls ───────────────────────────────────────────

  function setTypeFilter(types) {
    GraphState.dispatch('SET_FILTER', { types: new Set(types) });
    applyFilters();
  }

  function setFamilyFilter(families) {
    GraphState.dispatch('SET_FILTER', { families: new Set(families) });
    applyFilters();
  }

  function setSearchFilter(query) {
    GraphState.dispatch('SET_FILTER', { search: query });
    applyFilters();
  }

  function setDepth(depth) {
    GraphState.dispatch('SET_FILTER', { depth: depth === '' ? Infinity : parseInt(depth) || Infinity });
    applyFilters();
  }

  function clearFilters() {
    GraphState.dispatch('SET_FILTER', {
      types: new Set(),
      families: new Set(),
      status: new Set(),
      owner: new Set(),
      search: '',
      depth: Infinity,
    });
    // Restore all nodes
    const state = GraphState.getState();
    for (const n of state.nodes) {
      if (n.visibilityState === 'filtered') {
        n.visibilityState = 'visible';
        GraphAnimation.restore(n.id, 'fast');
      }
    }
    for (const e of state.edges) {
      if (e.visibilityState === 'filtered') {
        e.visibilityState = 'visible';
        GraphAnimation.restore(e.id, 'fast');
      }
    }
  }

  // ── Progressive Reveal ────────────────────────────────────────

  function progressiveReveal(nodeIds, delayPerBatch, batchSize) {
    const bs = batchSize || 20;
    const delay = delayPerBatch || 100;
    const animated = GraphState.getState().animationEnabled;

    for (let i = 0; i < nodeIds.length; i += bs) {
      const batch = nodeIds.slice(i, i + bs);
      setTimeout(() => {
        for (const id of batch) {
          const node = GraphState.getState().nodeMap.get(id);
          if (node) {
            node.visibilityState = 'visible';
            if (animated) GraphAnimation.fadeIn(id, 'normal');
            else { node.animOpacity = 1; node.animScale = 1; }
          }
        }
      }, (i / bs) * delay);
    }
  }

  // ── Build Filter UI Panel ─────────────────────────────────────

  function renderFilterPanel(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const nodes = GraphState.get('nodes');
    const types = [...new Set(nodes.map(n => n.type))].sort();
    const families = [...new Set(nodes.map(n => n.family).filter(Boolean))].sort();
    const activeFilters = GraphState.get('filters');

    container.innerHTML = `
      <div style="padding:8px; font-size:11px;">
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">Filters</div>

        <div style="margin-bottom:8px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px;">Entity Types</div>
          ${types.map(t => `
            <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:var(--text-dim); cursor:pointer;">
              <input type="checkbox" checked data-filter-type="${t}" onchange="GraphFilters.onTypeCheckboxChange()"> ${t}
            </label>
          `).join('')}
        </div>

        <div style="margin-bottom:8px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px;">Families</div>
          ${families.map(f => `
            <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:var(--text-dim); cursor:pointer;">
              <input type="checkbox" checked data-filter-family="${f}" onchange="GraphFilters.onFamilyCheckboxChange()"> ${f}
            </label>
          `).join('')}
        </div>

        <div style="margin-bottom:8px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px;">Depth from selected</div>
          <input type="range" min="1" max="10" value="10" style="width:100%;" oninput="GraphFilters.setDepth(this.value==10?'':this.value);this.nextElementSibling.textContent=this.value==10?'All':this.value">
          <span style="font-size:9px; color:var(--text-muted);">All</span>
        </div>

        <button class="btn" onclick="GraphFilters.clearFilters()" style="font-size:10px; padding:3px 8px; width:100%;">Reset Filters</button>
      </div>
    `;
  }

  function onTypeCheckboxChange() {
    const checked = [...document.querySelectorAll('[data-filter-type]:checked')].map(cb => cb.dataset.filterType);
    const all = [...document.querySelectorAll('[data-filter-type]')].map(cb => cb.dataset.filterType);
    // If all checked, clear filter (show all). If some unchecked, filter to checked only.
    if (checked.length === all.length) {
      setTypeFilter([]);
    } else {
      setTypeFilter(checked);
    }
  }

  function onFamilyCheckboxChange() {
    const checked = [...document.querySelectorAll('[data-filter-family]:checked')].map(cb => cb.dataset.filterFamily);
    const all = [...document.querySelectorAll('[data-filter-family]')].map(cb => cb.dataset.filterFamily);
    if (checked.length === all.length) {
      setFamilyFilter([]);
    } else {
      setFamilyFilter(checked);
    }
  }

  return {
    applyFilters, clearFilters,
    setTypeFilter, setFamilyFilter, setSearchFilter, setDepth,
    progressiveReveal, renderFilterPanel,
    onTypeCheckboxChange, onFamilyCheckboxChange,
  };
})();
