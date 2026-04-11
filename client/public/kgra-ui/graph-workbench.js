// ─── Graph Workbench ────────────────────────────────────────────
// Shell orchestrator: mounts canvas, panels, controls.
// Loads data via GraphAPI, populates GraphState, starts render loop.

const GraphWorkbench = (() => {
  let _mounted = false;
  let _renderLoop = null;
  let _fpsFrames = 0;
  let _fpsLast = performance.now();

  // ── Mount ─────────────────────────────────────────────────────

  function mount(container) {
    if (_mounted) return;
    _mounted = true;

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; margin:-24px -20px;">
        <!-- Top Bar -->
        <div id="wb-topbar" style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; font-size:11px;">
          <input class="input" id="wb-search" placeholder="Search nodes..." style="width:140px; font-size:11px; padding:4px 8px;" onkeydown="if(event.key==='Enter')GraphWorkbench.searchFocus()" />
          <button class="btn btn-primary" onclick="GraphWorkbench.searchFocus()" style="font-size:10px; padding:3px 8px;">Search</button>
          <button class="btn" onclick="GraphWorkbench.reload()" style="font-size:10px; padding:3px 8px;">Reload</button>
          <div style="display:flex; align-items:center; gap:3px;">
            <label style="font-size:9px; color:var(--text-dim);">Hubs:</label>
            <input type="range" id="wb-hub-slider" min="5" max="50" step="1" value="10" style="width:60px; accent-color:#6366f1;" oninput="GraphWorkbench.setHubCount(this.value)" />
            <span id="wb-hub-display" style="font-size:10px; color:var(--text); min-width:16px;">10</span>
          </div>
          <div id="wb-mode-bar" style="display:flex; gap:2px; border:1px solid var(--border); border-radius:4px; padding:1px; flex-wrap:wrap;"></div>
          <select id="wb-compose-select" onchange="if(this.value)GraphWorkbench.setComposition(this.value)" class="input" style="width:auto; font-size:10px; padding:2px 4px;"><option value="">Compose...</option></select>
          <select id="wb-layout-select" onchange="GraphWorkbench.setLayout(this.value)" class="input" style="width:auto; font-size:10px; padding:2px 4px;">
            <option value="force">Force</option>
            <option value="hierarchy">Hierarchy</option>
            <option value="circular">Circular</option>
          </select>
          <button class="btn" onclick="GraphCamera.fitAll(400)" style="font-size:10px; padding:3px 8px;">Fit</button>
        </div>
        <!-- Body -->
        <div style="flex:1; display:flex; overflow:hidden;">
          <!-- Canvas -->
          <div style="flex:1; position:relative; overflow:hidden; background:#0a0c0f;">
            <canvas id="wb-canvas" style="width:100%; height:100%; cursor:grab;"></canvas>
            <!-- Legend -->
            <div id="wb-legend" style="position:absolute; top:8px; right:8px; background:rgba(13,13,13,0.9); border:1px solid var(--border); border-radius:6px; padding:6px 10px; font-size:9px; display:none;"></div>
            <!-- Inspector (right overlay) -->
            <div id="wb-inspector" style="display:none; position:absolute; top:8px; right:8px; width:220px; max-height:calc(100% - 16px); overflow-y:auto; background:rgba(13,13,13,0.95); border:1px solid var(--border); border-radius:8px; padding:10px; font-size:11px;"></div>
            <!-- Status bar -->
            <div id="wb-status" style="position:absolute; bottom:8px; left:8px; right:8px; display:flex; justify-content:space-between; font-size:9px; color:#555;">
              <span id="wb-status-fps"></span>
              <span id="wb-status-graph"></span>
              <span id="wb-status-mode"></span>
              <span id="wb-status-layout"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize subsystems
    const canvas = document.getElementById('wb-canvas');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    GraphCamera.setCanvas(canvas);
    GraphRenderer.setCanvas(canvas);
    GraphInteraction.bind(canvas);
    GraphInspector.setContainer(document.getElementById('wb-inspector'));

    // Resize handler
    window.addEventListener('resize', () => {
      const r = canvas.parentElement.getBoundingClientRect();
      canvas.width = r.width * window.devicePixelRatio;
      canvas.height = r.height * window.devicePixelRatio;
      const c = canvas.getContext('2d');
      c.scale(window.devicePixelRatio, window.devicePixelRatio);
      GraphCamera.resize();
    });

    // State change → re-render
    GraphState.subscribe(() => {
      // Render is driven by the animation loop, not individual state changes
    });

    // Sync reduced motion preference
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      GraphAnimation.setReducedMotion(mq.matches);
      mq.addEventListener?.('change', e => {
        GraphAnimation.setReducedMotion(e.matches);
        GraphState.dispatch('SET_ACCESSIBILITY', { reducedMotion: e.matches });
      });
    }

    // Load data + start render loop
    _loadModeButtons();
    _loadCompositions();
    loadData();
    _startRenderLoop();
  }

  function unmount() {
    _mounted = false;
    if (_renderLoop) cancelAnimationFrame(_renderLoop);
    _renderLoop = null;
  }

  // ── Data Loading ──────────────────────────────────────────────

  let _hubCount = 10;
  let _hubDebounce = null;

  async function loadData() {
    const state = GraphState.getState();
    const mode = state.activeMode;

    const [entities, rels] = await Promise.all([
      GraphAPI.fetchEntities(_hubCount, mode),
      GraphAPI.fetchRelationships(mode),
    ]);

    const nodeIdSet = new Set(entities.map(e => e.id));
    const maxConn = Math.max(1, ...entities.map(e => e.connections || 1));

    const nodes = entities.map(e => ({
      id: e.id, label: e.name, type: e.type || 'ENTITY',
      family: e._family || e.community || '', community: e.community || '',
      source: e.source || 'auto', connections: e.connections || 0,
      x: (Math.random() - 0.5) * 800, y: (Math.random() - 0.5) * 800,
      radius: Math.max(6, Math.min(28, 6 + Math.sqrt((e.connections || 1) / maxConn) * 22)),
      animOpacity: 1, animScale: 1, highlightState: 'default', visibilityState: 'visible',
      _badge: null,
    }));

    const edges = rels
      .filter(r => nodeIdSet.has(r.source_id) && nodeIdSet.has(r.target_id))
      .map((r, i) => ({
        id: `e${i}`, source: r.source_id, target: r.target_id,
        type: r.type || 'RELATED_TO', category: r.relationship_category || '',
        weight: r.weight || 1, sourceLayer: r.source || 'auto',
        linkStrength: r.link_strength || 'hard', confidence: r.confidence,
        animOpacity: 1, highlightState: 'default', visibilityState: 'visible',
      }));

    GraphState.dispatch('SET_GRAPH', { nodes, edges });

    // Apply emphasis from active mode
    _applyModeEmphasis();

    // Run layout
    const layout = state.layout || 'force';
    if (layout === 'hierarchy') _runHierarchy();
    else if (layout === 'circular') _runCircular();
    else _runForceAnimated();

    _updateStatus();
  }

  // ── Layout Engines ────────────────────────────────────────────

  let _forceFrame = null;

  function _runForceAnimated() {
    const state = GraphState.getState();
    const { nodes, edges, nodeMap } = state;
    if (!nodes.length) return;

    let iter = 0;
    const maxIter = Math.min(120, Math.max(40, 8000 / nodes.length));

    function step() {
      const decay = 1 - iter / maxIter;
      const params = state.layoutParams;

      // Repulsion
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
      // Attraction
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

      iter++;
      if (iter < maxIter) {
        _forceFrame = requestAnimationFrame(step);
      } else {
        GraphState.dispatch('SET_LAYOUT', { stabilized: true });
        _updateStatus();
      }
    }
    GraphState.dispatch('SET_LAYOUT', { stabilized: false });
    if (_forceFrame) cancelAnimationFrame(_forceFrame);
    _forceFrame = requestAnimationFrame(step);
  }

  function _runHierarchy() {
    const { nodes, edges, nodeMap } = GraphState.getState();
    if (!nodes.length) return;
    const conns = {};
    edges.forEach(e => { conns[e.source] = (conns[e.source] || 0) + 1; conns[e.target] = (conns[e.target] || 0) + 1; });
    const sorted = [...nodes].sort((a, b) => (conns[b.id] || 0) - (conns[a.id] || 0));
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const spacing = Math.max(60, 400 / Math.sqrt(sorted.length));
    sorted.forEach((n, i) => {
      n.x = (i % cols - cols / 2) * spacing;
      n.y = (Math.floor(i / cols) - Math.floor(sorted.length / cols) / 2) * spacing * 0.8;
    });
    GraphCamera.fitAll(0);
    GraphState.dispatch('SET_LAYOUT', { stabilized: true });
  }

  function _runCircular() {
    const { nodes } = GraphState.getState();
    if (!nodes.length) return;
    const radius = Math.max(150, nodes.length * 8);
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      n.x = Math.cos(angle) * radius;
      n.y = Math.sin(angle) * radius;
    });
    GraphCamera.fitAll(0);
    GraphState.dispatch('SET_LAYOUT', { stabilized: true });
  }

  // ── Mode Emphasis ─────────────────────────────────────────────

  function _applyModeEmphasis() {
    const state = GraphState.getState();
    const modeData = state.activeModeData;
    if (!modeData || !modeData.emphasis_rules) return;

    for (const rule of modeData.emphasis_rules) {
      if (rule.type === 'collapse' && rule.families) {
        for (const n of state.nodes) {
          if (rule.families.includes(n.family)) n.visibilityState = 'collapsed';
        }
      }
      if (rule.type === 'badge' && rule.field) {
        for (const n of state.nodes) {
          if (n.connections >= 10) n._badge = n.connections;
        }
      }
    }
  }

  // ── Render Loop ───────────────────────────────────────────────

  function _startRenderLoop() {
    function frame() {
      GraphRenderer.render();
      _measureFPS();
      _renderLoop = requestAnimationFrame(frame);
    }
    _renderLoop = requestAnimationFrame(frame);
  }

  function _measureFPS() {
    _fpsFrames++;
    const now = performance.now();
    if (now - _fpsLast >= 1000) {
      const fps = Math.round(_fpsFrames * 1000 / (now - _fpsLast));
      GraphState.dispatch('SET_PERFORMANCE', { fps });
      _fpsFrames = 0;
      _fpsLast = now;
      // Auto performance mode
      const nc = GraphState.get('nodeCount');
      let mode = 'full';
      if (nc > 1000 || fps < 15) mode = 'safe';
      else if (nc > 500 || fps < 30) mode = 'balanced';
      GraphState.dispatch('SET_PERFORMANCE', { performanceMode: mode });
      _updateStatus();
    }
  }

  // ── Controls ──────────────────────────────────────────────────

  function setHubCount(val) {
    _hubCount = parseInt(val) || 10;
    const disp = document.getElementById('wb-hub-display');
    if (disp) disp.textContent = _hubCount;
    clearTimeout(_hubDebounce);
    _hubDebounce = setTimeout(() => loadData(), 300);
  }

  function setLayout(layout) {
    GraphState.dispatch('SET_LAYOUT', { layout });
    if (layout === 'force') _runForceAnimated();
    else if (layout === 'hierarchy') _runHierarchy();
    else if (layout === 'circular') _runCircular();
  }

  function reload() { loadData(); }

  function searchFocus() {
    const q = document.getElementById('wb-search')?.value?.toLowerCase();
    if (!q) return;
    const nodes = GraphState.get('nodes');
    const match = nodes.find(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    if (match) {
      GraphState.dispatch('SELECT_NODE', { nodeId: match.id });
      match.highlightState = 'selected';
      GraphCamera.focusNode(match.id, 400);
      GraphInspector.showNode(match.id);
      GraphAnimation.pulse(match.id, 300);
    }
  }

  async function setMode(modeId) {
    if (modeId === 'all') {
      GraphState.dispatch('SET_MODE', { mode: 'all', modeData: null });
    } else {
      const modes = await GraphAPI.fetchModes();
      const mode = modes.find(m => m.mode_id === modeId);
      GraphState.dispatch('SET_MODE', { mode: modeId, modeData: mode || null });
      // Apply mode's layout
      if (mode?.default_view_layout) {
        const sel = document.getElementById('wb-layout-select');
        if (sel) sel.value = mode.default_view_layout;
        GraphState.dispatch('SET_LAYOUT', { layout: mode.default_view_layout });
      }
    }
    _updateModeButtons();
    loadData();
  }

  async function setComposition(compName) {
    const comps = await GraphAPI.fetchCompositions();
    const comp = comps.find(c => c.name === compName);
    if (!comp) return;
    const modes = await GraphAPI.fetchModes();
    const matched = modes.filter(m => (comp.mode_ids || []).includes(m.mode_id));
    // Merge includes
    const mergedFamilies = new Set();
    const mergedRels = new Set();
    const mergedEmphasis = [];
    for (const m of matched) {
      for (const f of m.includes?.node_families || []) mergedFamilies.add(f);
      for (const r of m.includes?.relationship_types || []) mergedRels.add(r);
      for (const e of m.emphasis_rules || []) mergedEmphasis.push(e);
    }
    GraphState.dispatch('SET_MODE', {
      mode: comp.mode_ids.join(','),
      modeData: {
        name: compName, includes: { node_families: [...mergedFamilies], relationship_types: [...mergedRels] },
        emphasis_rules: mergedEmphasis, default_view_layout: matched[0]?.default_view_layout || 'force',
        primary_question: matched.map(m => m.primary_question).filter(Boolean).join(' + '),
      },
    });
    _updateModeButtons();
    loadData();
  }

  // ── UI Helpers ────────────────────────────────────────────────

  async function _loadModeButtons() {
    const modes = await GraphAPI.fetchModes();
    const bar = document.getElementById('wb-mode-bar');
    if (!bar) return;
    const activeMode = GraphState.get('activeMode');
    bar.innerHTML = `<button class="btn ${activeMode === 'all' ? 'btn-primary' : ''}" onclick="GraphWorkbench.setMode('all')" style="font-size:10px; padding:2px 6px; border-radius:3px;">All</button>` +
      modes.map(m => `<button class="btn ${activeMode === m.mode_id ? 'btn-primary' : ''}" onclick="GraphWorkbench.setMode('${m.mode_id}')" style="font-size:10px; padding:2px 6px; border-radius:3px;">${m.name}</button>`).join('');
  }

  function _updateModeButtons() {
    const bar = document.getElementById('wb-mode-bar');
    if (!bar) return;
    const activeMode = GraphState.get('activeMode');
    bar.querySelectorAll('.btn').forEach(b => {
      b.classList.toggle('btn-primary', b.textContent === 'All' ? activeMode === 'all' : b.onclick?.toString().includes(activeMode));
    });
  }

  async function _loadCompositions() {
    const comps = await GraphAPI.fetchCompositions();
    const sel = document.getElementById('wb-compose-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Compose...</option>' + comps.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  function _updateStatus() {
    const s = GraphState.getState();
    const fpsEl = document.getElementById('wb-status-fps');
    const graphEl = document.getElementById('wb-status-graph');
    const modeEl = document.getElementById('wb-status-mode');
    const layoutEl = document.getElementById('wb-status-layout');
    if (fpsEl) fpsEl.textContent = `${s.fps}fps [${s.performanceMode}]`;
    if (graphEl) graphEl.textContent = `${s.nodeCount} nodes · ${s.edgeCount} edges`;
    if (modeEl) modeEl.textContent = s.activeMode !== 'all' ? `Mode: ${s.activeModeData?.name || s.activeMode}` : '';
    if (layoutEl) layoutEl.textContent = `Layout: ${s.layout}${s.layoutStabilized ? ' (stable)' : ''}`;
  }

  return {
    mount, unmount, loadData, reload,
    setHubCount, setLayout, setMode, setComposition, searchFocus,
  };
})();
