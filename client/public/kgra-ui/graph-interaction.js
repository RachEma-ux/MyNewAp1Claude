// ─── Graph Interaction Controller ───────────────────────────────
// Handles hover, select, drag, expand/collapse, context menu.
// Dispatches to GraphState. Uses GraphAnimation for transitions.

const GraphInteraction = (() => {
  let _canvas = null;
  let _dragging = null;
  let _panning = false;
  let _panStart = { x: 0, y: 0 };
  let _lastHoveredId = null;

  function bind(canvas) {
    _canvas = canvas;
    canvas.addEventListener('mousedown', _onMouseDown);
    canvas.addEventListener('mousemove', _onMouseMove);
    canvas.addEventListener('mouseup', _onMouseUp);
    canvas.addEventListener('wheel', _onWheel, { passive: false });
    canvas.addEventListener('dblclick', _onDblClick);
    canvas.addEventListener('contextmenu', _onContextMenu);
    canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', _onTouchMove, { passive: false });
    canvas.addEventListener('touchend', _onTouchEnd);
  }

  // ── Mouse Events ──────────────────────────────────────────────

  function _onMouseDown(e) {
    const rect = _canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = GraphRenderer.getNodeAt(sx, sy);

    if (node) {
      _dragging = node;
      _canvas.style.cursor = 'grabbing';
    } else {
      _panning = true;
      _panStart = { x: e.clientX, y: e.clientY };
      _canvas.style.cursor = 'grabbing';
    }
  }

  function _onMouseMove(e) {
    const rect = _canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (_dragging) {
      const world = GraphCamera.toWorld(sx, sy);
      GraphState.dispatch('UPDATE_NODE_POSITION', { nodeId: _dragging.id, x: world.x, y: world.y });
      return;
    }

    if (_panning) {
      const cam = GraphState.get('camera');
      const dx = (e.clientX - _panStart.x) / cam.zoom;
      const dy = (e.clientY - _panStart.y) / cam.zoom;
      GraphState.dispatch('SET_CAMERA', { x: cam.x + dx, y: cam.y + dy });
      _panStart = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hover
    const node = GraphRenderer.getNodeAt(sx, sy);
    const hoveredId = node ? node.id : null;

    if (hoveredId !== _lastHoveredId) {
      // Exit previous hover
      if (_lastHoveredId) {
        _clearHoverHighlight();
      }
      // Enter new hover
      if (hoveredId) {
        _applyHoverHighlight(hoveredId);
      }
      _lastHoveredId = hoveredId;
      GraphState.dispatch('HOVER_NODE', { nodeId: hoveredId });
    }

    _canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function _onMouseUp(e) {
    if (_dragging) {
      // If barely moved, treat as click (select)
      _dragging = null;
    } else if (_panning) {
      _panning = false;
    } else {
      // Click on empty → deselect
      const rect = _canvas.getBoundingClientRect();
      const node = GraphRenderer.getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node) {
        _selectNode(node.id);
      } else {
        _deselectNode();
      }
    }
    _canvas.style.cursor = 'grab';
  }

  function _onWheel(e) {
    const rect = _canvas.getBoundingClientRect();
    GraphCamera.handleWheel(e, rect);
  }

  function _onDblClick(e) {
    const rect = _canvas.getBoundingClientRect();
    const node = GraphRenderer.getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node) {
      // Expand neighborhood — future: fetch neighbors from API
      GraphCamera.focusNode(node.id, 300);
    } else {
      GraphCamera.fitAll(400);
    }
  }

  function _onContextMenu(e) {
    e.preventDefault();
    const rect = _canvas.getBoundingClientRect();
    const node = GraphRenderer.getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    _showContextMenu(e.clientX, e.clientY, node);
  }

  // ── Touch Events ──────────────────────────────────────────────

  let _touchStart = null;
  function _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = _canvas.getBoundingClientRect();
      const node = GraphRenderer.getNodeAt(t.clientX - rect.left, t.clientY - rect.top);
      if (node) { _dragging = node; }
      else { _panning = true; _panStart = { x: t.clientX, y: t.clientY }; }
      _touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  }

  function _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (_dragging) {
        const rect = _canvas.getBoundingClientRect();
        const world = GraphCamera.toWorld(t.clientX - rect.left, t.clientY - rect.top);
        GraphState.dispatch('UPDATE_NODE_POSITION', { nodeId: _dragging.id, x: world.x, y: world.y });
      } else if (_panning) {
        const cam = GraphState.get('camera');
        const dx = (t.clientX - _panStart.x) / cam.zoom;
        const dy = (t.clientY - _panStart.y) / cam.zoom;
        GraphState.dispatch('SET_CAMERA', { x: cam.x + dx, y: cam.y + dy });
        _panStart = { x: t.clientX, y: t.clientY };
      }
    }
  }

  function _onTouchEnd(e) {
    if (_touchStart && Date.now() - _touchStart.time < 300) {
      // Tap → select
      const rect = _canvas.getBoundingClientRect();
      const node = GraphRenderer.getNodeAt(_touchStart.x - rect.left, _touchStart.y - rect.top);
      if (node) _selectNode(node.id);
      else _deselectNode();
    }
    _dragging = null;
    _panning = false;
    _touchStart = null;
  }

  // ── Hover Highlight ───────────────────────────────────────────

  function _applyHoverHighlight(nodeId) {
    const state = GraphState.getState();
    const edges = state.edges;
    const connectedIds = new Set([nodeId]);

    for (const e of edges) {
      if (e.source === nodeId) connectedIds.add(e.target);
      if (e.target === nodeId) connectedIds.add(e.source);
    }

    for (const n of state.nodes) {
      if (connectedIds.has(n.id)) {
        n.highlightState = n.id === nodeId ? 'hovered' : 'related';
        GraphAnimation.restore(n.id, 'fast');
      } else {
        GraphAnimation.dimTo(n.id, 0.2, 'fast');
      }
    }
  }

  function _clearHoverHighlight() {
    const state = GraphState.getState();
    for (const n of state.nodes) {
      n.highlightState = n.id === state.selectedNodeId ? 'selected' : 'default';
      GraphAnimation.restore(n.id, 'fast');
    }
  }

  // ── Selection ─────────────────────────────────────────────────

  function _selectNode(nodeId) {
    const prev = GraphState.get('selectedNodeId');
    if (prev) {
      const prevNode = GraphState.getState().nodeMap.get(prev);
      if (prevNode) prevNode.highlightState = 'default';
    }

    GraphState.dispatch('SELECT_NODE', { nodeId });
    const node = GraphState.getState().nodeMap.get(nodeId);
    if (node) {
      node.highlightState = 'selected';
      GraphAnimation.pulse(nodeId, 300);
    }

    // Smooth camera focus
    GraphCamera.focusNode(nodeId, 300);

    // Update inspector
    GraphInspector.showNode(nodeId);
  }

  function _deselectNode() {
    const prev = GraphState.get('selectedNodeId');
    if (prev) {
      const prevNode = GraphState.getState().nodeMap.get(prev);
      if (prevNode) prevNode.highlightState = 'default';
    }
    GraphState.dispatch('SELECT_NODE', { nodeId: null });
    GraphInspector.clear();
  }

  // ── Context Menu ──────────────────────────────────────────────

  function _showContextMenu(clientX, clientY, node) {
    const existing = document.getElementById('graph-ctx-menu');
    if (existing) existing.remove();

    if (!node) return;

    const isEditable = node.source === 'manual' || node.source === 'template';
    const menu = document.createElement('div');
    menu.id = 'graph-ctx-menu';
    menu.style.cssText = `position:fixed; left:${clientX}px; top:${clientY}px; background:var(--bg-elevated,#1a1a2e); border:1px solid var(--border); border-radius:6px; padding:4px 0; min-width:150px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.4); font-size:11px;`;

    let html = `
      <div style="font-weight:600; color:var(--text); padding:4px 12px; border-bottom:1px solid var(--border);">${node.label}</div>
      <div style="color:var(--text-dim); padding:2px 12px; font-size:10px;">Type: ${node.type} | Family: ${node.family || '—'}</div>
      <div style="color:var(--text-dim); padding:2px 12px; font-size:10px;">Source: ${node.source || 'auto'} | Conns: ${node.connections || 0}</div>
      <div style="border-top:1px solid var(--border); margin:2px 0;"></div>
      <div class="ctx-menu-item" data-action="focus" style="padding:4px 12px; cursor:pointer; color:var(--text);">Focus</div>
      <div class="ctx-menu-item" data-action="trace" style="padding:4px 12px; cursor:pointer; color:var(--text);">Trace path from here</div>
      <div class="ctx-menu-item" data-action="ripple" style="padding:4px 12px; cursor:pointer; color:var(--text);">Show impact</div>
    `;

    if (isEditable) {
      const manualId = node.id.replace('manual_', '');
      html += `
        <div style="border-top:1px solid var(--border); margin:2px 0;"></div>
        <div class="ctx-menu-item" data-action="edit" data-id="${manualId}" style="padding:4px 12px; cursor:pointer; color:var(--text);">✎ Edit</div>
        <div class="ctx-menu-item" data-action="archive" data-id="${manualId}" style="padding:4px 12px; cursor:pointer; color:var(--text);">📦 Archive</div>
        <div class="ctx-menu-item" data-action="delete" data-id="${manualId}" style="padding:4px 12px; cursor:pointer; color:#ef4444;">🗑 Delete</div>
      `;
    }

    menu.innerHTML = html;
    document.body.appendChild(menu);

    // Event handlers
    menu.querySelectorAll('.ctx-menu-item').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover,#2a2a4a)');
      el.addEventListener('mouseleave', () => el.style.background = 'none');
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        menu.remove();
        if (action === 'focus') GraphCamera.focusNode(node.id, 300);
        else if (action === 'trace') { /* future: path tracing */ }
        else if (action === 'ripple') { /* future: dependency ripple */ }
        else if (action === 'edit') { if (typeof showEditNodeForm === 'function') { switchMainTab('graphrag'); showEditNodeForm(parseInt(el.dataset.id)); } }
        else if (action === 'archive') { if (typeof archiveNode === 'function') archiveNode(parseInt(el.dataset.id)); }
        else if (action === 'delete') { if (typeof deleteNode === 'function') deleteNode(parseInt(el.dataset.id)); }
      });
    });

    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  return { bind };
})();
