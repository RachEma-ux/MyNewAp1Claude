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
          <select id="wb-preset-select" onchange="if(this.value){GraphLayout.applyPreset(this.value);this.value='';}" class="input" style="width:auto; font-size:10px; padding:2px 4px;">
            <option value="">Presets...</option>
            <option value="balanced">Balanced</option>
            <option value="compact">Compact</option>
            <option value="spread">Spread</option>
            <option value="investigation">Investigation</option>
            <option value="dense-safe">Dense Safe</option>
          </select>
          <button class="btn" onclick="GraphLayout.freeze()" style="font-size:10px; padding:3px 8px;" title="Freeze layout">❄</button>
          <button class="btn" onclick="GraphLayout.unfreeze()" style="font-size:10px; padding:3px 8px;" title="Unfreeze layout">▶</button>
          <button class="btn" onclick="GraphLayout.restart()" style="font-size:10px; padding:3px 8px;" title="Rerun layout">↻</button>
          <button class="btn" onclick="GraphCamera.fitAll(400)" style="font-size:10px; padding:3px 8px;">Fit</button>
          <button class="btn" onclick="GraphWorkbench.showCompare()" style="font-size:10px; padding:3px 8px;">Compare</button>
          <button class="btn" id="wb-live-btn" onclick="GraphWorkbench.toggleLive()" style="font-size:10px; padding:3px 8px;">● Live</button>
          <button class="btn" id="wb-filter-toggle" onclick="GraphWorkbench.toggleFilters()" style="font-size:10px; padding:3px 8px;">☰ Filter</button>
        </div>
        <!-- Playback Bar (visible when timeline enabled) -->
        <div id="wb-playback-bar" style="display:none; padding:4px 12px; border-bottom:1px solid var(--border); background:var(--bg-base);"></div>
        <!-- Body -->
        <div style="flex:1; display:flex; overflow:hidden;">
          <!-- Left Filter Panel -->
          <div id="wb-filter-panel" style="width:0; flex-shrink:0; background:var(--bg-base); border-right:1px solid var(--border); overflow:hidden; transition:width 200ms ease-out;">
            <div id="wb-filter-content" style="width:180px; overflow-y:auto; scrollbar-width:none; height:100%;"></div>
          </div>
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
              <span id="wb-status-live"></span>
              <span id="wb-status-timeline"></span>
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
    if (typeof GraphInteraction.init === 'function') GraphInteraction.init(canvas);
    else GraphInteraction.bind(canvas);
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

    // Initialize subsystems
    if (typeof GraphA11y !== 'undefined') GraphA11y.init();
    if (typeof GraphPerf !== 'undefined') GraphPerf.init();

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
      createdAt: e.created_at || null, updatedAt: e.updated_at || null,
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
        createdAt: r.created_at || null,
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
      // Feed to performance guard
      if (typeof GraphPerf !== 'undefined') GraphPerf.recordFps(fps);
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
    if (typeof GraphLayout !== 'undefined') {
      GraphLayout.switchLayout(layout);
    } else {
      // Fallback to built-in
      if (layout === 'force') _runForceAnimated();
      else if (layout === 'hierarchy') _runHierarchy();
      else if (layout === 'circular') _runCircular();
    }
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
    if (fpsEl) {
      const rmIcon = s.reducedMotion ? ' 🔇' : '';
      const animIcon = s.animationEnabled ? '' : ' ⏸';
      fpsEl.textContent = `${s.fps}fps [${s.performanceMode}]${rmIcon}${animIcon}`;
    }
    if (graphEl) graphEl.textContent = `${s.nodeCount} nodes · ${s.edgeCount} edges`;
    if (modeEl) {
      let modeText = s.activeMode !== 'all' ? `Mode: ${s.activeModeData?.name || s.activeMode}` : '';
      if (s.liveMode) modeText += s.liveConnected ? ' · Live: ●' : ' · Live: ○';
      if (s.timeline.enabled) modeText += ` · Timeline: ${s.timeline.playing ? '▶' : '❚❚'}`;
      modeEl.textContent = modeText;
    }
    if (layoutEl) layoutEl.textContent = `Layout: ${s.layout}${s.layoutFrozen ? ' (frozen)' : s.layoutStabilized ? ' (stable)' : ''}`;

    const liveEl = document.getElementById('wb-status-live');
    if (liveEl) {
      if (s.liveMode) {
        const status = typeof GraphLive !== 'undefined' ? GraphLive.getStatus() : {};
        liveEl.textContent = s.liveConnected
          ? `Live: connected${status.paused ? ` (${status.buffered} buffered)` : ''}`
          : 'Live: disconnected';
        liveEl.style.color = s.liveConnected ? '#10b981' : '#ef4444';
      } else {
        liveEl.textContent = '';
      }
    }

    const timeEl = document.getElementById('wb-status-timeline');
    if (timeEl) {
      if (s.timeline.enabled) {
        timeEl.textContent = `Timeline: ${s.timeline.playing ? '▶' : '❚❚'} ${s.timeline.position ? new Date(s.timeline.position).toLocaleString() : ''}`;
      } else {
        timeEl.textContent = '';
      }
    }

    _updateLiveButton();
  }

  let _filtersOpen = false;
  function toggleFilters() {
    _filtersOpen = !_filtersOpen;
    const panel = document.getElementById('wb-filter-panel');
    if (panel) {
      panel.style.width = _filtersOpen ? '200px' : '0';
      if (_filtersOpen) _renderFullLeftPanel();
    }
  }

  function _renderFullLeftPanel() {
    const container = document.getElementById('wb-filter-content');
    if (!container) return;
    const s = GraphState.getState();
    const params = s.layoutParams;

    container.innerHTML = `
      <div style="padding:8px; font-size:11px;">
        <div style="font-weight:600; color:var(--text); margin-bottom:8px;">Controls</div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Search</div>
          <input class="input" id="wb-panel-search" placeholder="Search nodes..." style="width:100%; font-size:10px; padding:3px 6px;" onkeydown="if(event.key==='Enter')GraphWorkbench.searchFocus()" />
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Filters</div>
          <div id="wb-panel-filters"></div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Depth from selected</div>
          <input type="range" min="1" max="10" value="10" style="width:100%;" oninput="GraphFilters.setDepth(this.value==10?'':this.value);this.nextElementSibling.textContent=this.value==10?'All':this.value">
          <span style="font-size:9px; color:var(--text-muted);">All</span>
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Layout</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; align-items:center; gap:4px;">
              <label style="font-size:9px; color:var(--text-dim); width:50px;">Repel</label>
              <input type="range" min="100" max="2000" value="${params.repel}" style="flex:1;" oninput="GraphLayout.setParams({repel:parseInt(this.value)})">
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <label style="font-size:9px; color:var(--text-dim); width:50px;">Distance</label>
              <input type="range" min="20" max="200" value="${params.linkDist}" style="flex:1;" oninput="GraphLayout.setParams({linkDist:parseInt(this.value)})">
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <label style="font-size:9px; color:var(--text-dim); width:50px;">Center</label>
              <input type="range" min="1" max="100" value="${Math.round(params.centerForce * 1000)}" style="flex:1;" oninput="GraphLayout.setParams({centerForce:parseInt(this.value)/1000})">
            </div>
            <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer;">
              <input type="checkbox" ${s.layoutFrozen ? 'checked' : ''} onchange="this.checked ? GraphLayout.freeze() : GraphLayout.unfreeze()"> Stabilize (freeze)
            </label>
          </div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Clusters</div>
          <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer; margin-bottom:4px;">
            <input type="checkbox" ${s.clusterMode ? 'checked' : ''} onchange="GraphClusters.toggleClusterMode()"> Cluster mode
          </label>
          <button class="btn" onclick="GraphClusters.startSweep()" style="font-size:9px; padding:2px 6px; width:100%;">Sweep communities</button>
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Timeline</div>
          <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer; margin-bottom:4px;">
            <input type="checkbox" ${s.timeline.enabled ? 'checked' : ''} onchange="GraphWorkbench.toggleTimeline(this.checked)"> Timeline mode
          </label>
          <div id="wb-panel-playback"></div>
          ${s.timeline.enabled ? `
            <div style="margin-top:6px;">
              <div style="display:flex; gap:4px;">
                <button class="btn" onclick="GraphTimeline.restart()" style="font-size:9px; padding:2px 6px;">|◀</button>
                <button class="btn" onclick="${s.timeline.playing ? 'GraphTimeline.pause()' : 'GraphTimeline.play()'}" style="font-size:9px; padding:2px 6px;">${s.timeline.playing ? '❚❚' : '▶'}</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Live Updates</div>
          <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer;">
            <input type="checkbox" ${s.liveMode ? 'checked' : ''} onchange="GraphWorkbench.toggleLive()"> Live mode
          </label>
          ${s.liveMode ? `
            <div style="font-size:9px; color:${s.liveConnected ? '#10b981' : '#ef4444'}; margin-top:2px;">${s.liveConnected ? '● Connected' : '○ Disconnected'}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">
              <button class="btn" onclick="GraphLive.pause()" style="font-size:9px; padding:2px 6px;">Pause</button>
              <button class="btn" onclick="GraphLive.resume()" style="font-size:9px; padding:2px 6px;">Resume</button>
              <button class="btn" onclick="GraphLive.jumpToLatest()" style="font-size:9px; padding:2px 6px;">Jump Latest</button>
            </div>
          ` : ''}
        </div>

        <div style="margin-bottom:10px;">
          <div style="color:var(--text-dim); margin-bottom:3px; font-size:10px; font-weight:600;">Accessibility</div>
          <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer; margin-bottom:4px;">
            <input type="checkbox" ${!s.animationEnabled ? 'checked' : ''} onchange="GraphA11y.setAnimationEnabled(!this.checked)"> Disable animation
          </label>
          <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:var(--text-dim); cursor:pointer;">
            <input type="checkbox" ${s.reducedMotion ? 'checked' : ''} onchange="GraphA11y.setReducedMotion(this.checked)"> Reduced motion
          </label>
        </div>

        <button class="btn" onclick="GraphFilters.clearFilters()" style="font-size:9px; padding:3px 6px; width:100%;">Reset All Filters</button>
      </div>
    `;

    // Render filter checkboxes
    if (typeof GraphFilters !== 'undefined') {
      GraphFilters.renderFilterPanel('wb-panel-filters');
    }

    // Render playback bar if timeline enabled
    if (s.timeline.enabled && typeof GraphTimeline !== 'undefined') {
      GraphTimeline.renderPlaybackBar('wb-panel-playback');
    }
  }

  // ── Compare Mode ──────────────────────────────────────────────

  function showCompare() {
    const container = document.getElementById('wb-inspector');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = `
      <div style="font-weight:600; color:var(--text); margin-bottom:8px;">Compare States</div>
      <div style="font-size:10px; color:var(--text-dim);">
        <div style="margin-bottom:4px;">
          <label style="display:block; margin-bottom:2px;">State A (from):</label>
          <input type="date" id="wb-compare-a" class="input" style="width:100%; font-size:10px; padding:3px 6px;" />
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:block; margin-bottom:2px;">State B (to):</label>
          <input type="date" id="wb-compare-b" class="input" style="width:100%; font-size:10px; padding:3px 6px;" />
        </div>
        <button class="btn btn-primary" onclick="GraphWorkbench.runCompare()" style="font-size:10px; padding:3px 8px; width:100%;">Compare</button>
        <button class="btn" onclick="GraphTimeline.clearCompare();GraphInspector.clear()" style="font-size:10px; padding:3px 8px; width:100%; margin-top:4px;">Clear</button>
      </div>
    `;
  }

  function runCompare() {
    const a = document.getElementById('wb-compare-a')?.value;
    const b = document.getElementById('wb-compare-b')?.value;
    if (!a || !b) { if (typeof showToast === 'function') showToast('Select both dates', 'error'); return; }
    GraphTimeline.compareStates(a, b);
  }

  // ── Live Toggle ──────────────────────────────────────────────

  function toggleLive() {
    const state = GraphState.getState();
    if (state.liveMode) {
      GraphLive.disconnect();
    } else {
      GraphLive.connect();
    }
    _updateLiveButton();
  }

  function _updateLiveButton() {
    const btn = document.getElementById('wb-live-btn');
    if (!btn) return;
    const s = GraphState.getState();
    btn.textContent = s.liveMode ? (s.liveConnected ? '● Live' : '○ Live') : '● Live';
    btn.style.color = s.liveConnected ? '#10b981' : '';
  }

  // ── Timeline Toggle from Left Panel ──────────────────────────

  function toggleTimeline(enabled) {
    if (enabled) {
      GraphTimeline.enable();
      const bar = document.getElementById('wb-playback-bar');
      if (bar) { bar.style.display = 'block'; GraphTimeline.renderPlaybackBar('wb-playback-bar'); }
    } else {
      GraphTimeline.disable();
      const bar = document.getElementById('wb-playback-bar');
      if (bar) bar.style.display = 'none';
    }
  }

  // ── Feature Flags (G-047) ────────────────────────────────────

  const FEATURE_FLAGS = {
    GRAPH_WORKBENCH_V2: true,        // Release 1: core + interaction
    GRAPH_WORKBENCH_LAYOUT: true,    // Release 2: layout + visual
    GRAPH_WORKBENCH_TIMELINE: true,  // Release 3: temporal
    GRAPH_WORKBENCH_ANALYSIS: true,  // Release 4: analysis + live
    GRAPH_WORKBENCH_PERF: true,      // Release 5: hardening
  };

  function isFeatureEnabled(flag) {
    return FEATURE_FLAGS[flag] !== false;
  }

  return {
    mount, unmount, loadData, reload, toggleFilters,
    setHubCount, setLayout, setMode, setComposition, searchFocus,
    showCompare, runCompare, toggleLive, toggleTimeline,
    isFeatureEnabled, FEATURE_FLAGS,
  };
})();
