// ─── Graph Renderer ─────────────────────────────────────────────
// Canvas 2D rendering pipeline. Reads from GraphState, does NOT mutate.
// All visual state (opacity, scale, highlight) comes from node/edge properties.

const GraphRenderer = (() => {
  let _canvas = null;
  let _ctx = null;
  let _dashOffset = 0; // For edge tracing animation

  const TYPE_COLORS = {
    FILE: '#3b82f6', PAGE: '#8b5cf6', COMPONENT: '#10b981',
    HOOK: '#f59e0b', ROUTE: '#ef4444', TABLE: '#06b6d4',
    MODULE: '#6366f1', ENTITY: '#888',
    PERSON: '#6366f1', ORG: '#4caf50', PRODUCT: '#f59e0b',
    PROJECT: '#ef4444', CONCEPT: '#06b6d4', LOCATION: '#a855f7',
    EVENT: '#ec4899', REGULATORY_TERM: '#f97316',
    // Ontology families
    SYSTEM: '#ef4444', ARTIFACT: '#3b82f6', ELEMENT: '#10b981',
    INTERFACE: '#f59e0b', DATA: '#06b6d4', RUNTIME: '#a855f7',
    EXTERNAL: '#f97316', CONTROL: '#ec4899', EVIDENCE: '#64748b',
    CHANGE: '#22c55e', CONFIGURATION: '#eab308', CONSTRAINT: '#dc2626',
    RISK: '#dc2626', INCIDENT: '#ef4444',
  };

  function setCanvas(canvas) {
    _canvas = canvas;
    _ctx = canvas ? canvas.getContext('2d') : null;
  }

  function render() {
    if (!_ctx || !_canvas) return;
    const state = GraphState.getState();
    const { nodes, edges, nodeMap, selectedNodeId, hoveredNodeId } = state;
    const cam = state.camera;
    const w = GraphCamera.getWidth();
    const h = GraphCamera.getHeight();
    _dashOffset = (_dashOffset + 0.5) % 20; // Animate edge tracing

    // Clear
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // Visible bounds for lazy rendering
    const margin = 200;
    const viewLeft = -cam.x - (w / 2) / cam.zoom - margin / cam.zoom;
    const viewRight = -cam.x + (w / 2) / cam.zoom + margin / cam.zoom;
    const viewTop = -cam.y - (h / 2) / cam.zoom - margin / cam.zoom;
    const viewBottom = -cam.y + (h / 2) / cam.zoom + margin / cam.zoom;

    function inView(x, y) {
      return x >= viewLeft && x <= viewRight && y >= viewTop && y <= viewBottom;
    }

    // Performance capability checks
    const perfCan = typeof GraphPerf !== 'undefined' ? GraphPerf.can.bind(GraphPerf) : () => true;
    const canEdgeLabels = perfCan('edgeLabels');
    const canHoverDim = perfCan('hoverDim');
    const canPulse = perfCan('pulse');
    const canBadges = perfCan('badges');
    const canNodeLabels = perfCan('nodeLabels');
    const canSoftOpacity = perfCan('softEdgeOpacity');

    // ── Edges ──────────────────────────────────────────────────
    for (const e of edges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || !tgt) continue;

      // Lazy render: skip if both off-screen
      if (!inView(src.x, src.y) && !inView(tgt.x, tgt.y)) continue;

      // Visibility
      const opacity = e.animOpacity !== undefined ? e.animOpacity : 1;
      if (opacity <= 0.01) continue;

      const p1 = GraphCamera.toScreen(src.x, src.y);
      const p2 = GraphCamera.toScreen(tgt.x, tgt.y);

      const isPathActive = e.highlightState === 'path-active';
      const isSelected = selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);
      const isSoft = e.linkStrength === 'soft';
      const isManual = e.sourceLayer === 'manual';
      const isTemplate = e.sourceLayer === 'template';

      _ctx.globalAlpha = opacity * (isSoft ? 0.5 : 1);

      // Line dash based on source layer
      if (isPathActive) { _ctx.setLineDash([10, 6]); _ctx.lineDashOffset = -_dashOffset; }
      else if (isManual) _ctx.setLineDash([6, 4]);
      else if (isTemplate) _ctx.setLineDash([2, 2]);
      else _ctx.setLineDash([]);

      _ctx.beginPath();
      _ctx.moveTo(p1.x, p1.y);
      _ctx.lineTo(p2.x, p2.y);
      _ctx.strokeStyle = isPathActive ? '#6366f1' : isManual ? '#10b981' : isTemplate ? '#6366f1' : isSelected ? '#4a4a6a' : '#1e1e1e';
      _ctx.lineWidth = isPathActive ? Math.max(2, 3 * cam.zoom) : Math.max(0.5, (e.weight || 1) * 0.4 * cam.zoom);
      _ctx.stroke();
      _ctx.setLineDash([]);
      _ctx.lineDashOffset = 0;

      // Edge label (gated by performance mode)
      if (canEdgeLabels && cam.zoom > 0.6) {
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        _ctx.fillStyle = isPathActive ? '#818cf8' : '#333';
        _ctx.font = `${Math.max(7, 8 * cam.zoom)}px sans-serif`;
        _ctx.textAlign = 'center';
        _ctx.fillText(e.type, mx, my - 3);
        if (canSoftOpacity && isSoft && e.confidence && cam.zoom > 0.6) {
          _ctx.fillStyle = '#f59e0b';
          _ctx.font = `${Math.max(6, 7 * cam.zoom)}px sans-serif`;
          _ctx.fillText(`${Math.round(parseFloat(e.confidence) * 100)}%`, mx, my + 8 * cam.zoom);
        }
      }
      _ctx.globalAlpha = 1;
    }

    // ── Nodes ──────────────────────────────────────────────────
    for (const n of nodes) {
      // Lazy render: skip off-screen
      if (!inView(n.x, n.y)) continue;

      // Visibility
      const opacity = n.animOpacity !== undefined ? n.animOpacity : 1;
      const scale = n.animScale !== undefined ? n.animScale : 1;
      if (opacity <= 0.01 || scale <= 0.01) continue;

      // Collapsed nodes (from emphasis)
      if (n.visibilityState === 'collapsed') {
        const p = GraphCamera.toScreen(n.x, n.y);
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, 2 * cam.zoom, 0, Math.PI * 2);
        _ctx.fillStyle = '#333';
        _ctx.fill();
        continue;
      }

      const p = GraphCamera.toScreen(n.x, n.y);
      const baseR = (n.radius || 14) * cam.zoom;
      const r = baseR * scale;
      const isSelected = selectedNodeId === n.id;
      const isHovered = hoveredNodeId === n.id;
      const isRelated = n.highlightState === 'related';
      const isPathActive = n.highlightState === 'path-active';
      const isLiveUpdated = n.highlightState === 'live-updated';
      const isClusterActive = n.highlightState === 'cluster-active';
      const isEntering = n.visibilityState === 'entering';
      const color = TYPE_COLORS[n.type] || TYPE_COLORS[n.family?.toUpperCase()] || '#888';

      _ctx.globalAlpha = opacity;

      // Glow for live-updated (green pulse)
      if (isLiveUpdated) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(16,185,129,0.3)';
        _ctx.fill();
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        _ctx.strokeStyle = '#10b981';
        _ctx.lineWidth = 2;
        _ctx.stroke();
      }
      // Glow for cluster-active (community color)
      if (isClusterActive) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(99,102,241,0.2)';
        _ctx.fill();
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        _ctx.strokeStyle = '#818cf8';
        _ctx.lineWidth = 2;
        _ctx.stroke();
      }
      // Glow for path/selected/hovered
      if (isPathActive) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(99,102,241,0.25)';
        _ctx.fill();
      }
      if (isSelected) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(255,255,255,0.15)';
        _ctx.fill();
      }
      if (isHovered) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(255,255,255,0.1)';
        _ctx.fill();
      }
      // Brief flash for entering nodes
      if (isEntering) {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(255,255,255,0.12)';
        _ctx.fill();
      }

      // Circle
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      _ctx.fillStyle = color;
      _ctx.fill();

      // Selection/path border
      if (isSelected || isPathActive || isHovered) {
        _ctx.strokeStyle = isPathActive ? '#6366f1' : isSelected ? '#fff' : '#aaa';
        _ctx.lineWidth = isSelected ? 3 : 2;
        _ctx.stroke();
      }

      // Source distinction (manual/template)
      if (n.source === 'manual' || n.source === 'template') {
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
        _ctx.setLineDash(n.source === 'manual' ? [4, 3] : [2, 2]);
        _ctx.strokeStyle = n.source === 'manual' ? '#fff' : '#6366f1';
        _ctx.lineWidth = 2;
        _ctx.stroke();
        _ctx.setLineDash([]);

        // M/T badge
        if (cam.zoom > 0.4) {
          const bc = n.source === 'manual' ? '#10b981' : '#6366f1';
          _ctx.fillStyle = bc;
          _ctx.beginPath();
          _ctx.arc(p.x + r * 0.75, p.y - r * 0.75, 5 * cam.zoom, 0, Math.PI * 2);
          _ctx.fill();
          _ctx.fillStyle = '#fff';
          _ctx.font = `bold ${Math.max(5, 6 * cam.zoom)}px sans-serif`;
          _ctx.textAlign = 'center';
          _ctx.fillText(n.source === 'manual' ? 'M' : 'T', p.x + r * 0.75, p.y - r * 0.75 + 2.5 * cam.zoom);
        }
      }

      // Connection count badge (gated by performance mode)
      if (canBadges && n._badge && cam.zoom > 0.4) {
        _ctx.fillStyle = '#06b6d4';
        _ctx.beginPath();
        _ctx.arc(p.x - r * 0.7, p.y - r * 0.7, 7 * cam.zoom, 0, Math.PI * 2);
        _ctx.fill();
        _ctx.fillStyle = '#000';
        _ctx.font = `bold ${Math.max(5, 6 * cam.zoom)}px sans-serif`;
        _ctx.textAlign = 'center';
        _ctx.fillText(n._badge > 99 ? '99+' : n._badge, p.x - r * 0.7, p.y - r * 0.7 + 2.5 * cam.zoom);
      }

      // Label (gated by performance mode)
      if (canNodeLabels && cam.zoom > 0.4) {
        _ctx.fillStyle = isRelated ? '#999' : '#d0d0d0';
        _ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
        _ctx.textAlign = 'center';
        _ctx.fillText(n.label, p.x, p.y + r + 11 * cam.zoom);
      }

      _ctx.globalAlpha = 1;
    }
  }

  // ── Hit Testing ───────────────────────────────────────────────

  function getNodeAt(screenX, screenY) {
    const world = GraphCamera.toWorld(screenX, screenY);
    const nodes = GraphState.get('nodes');
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - world.x, dy = n.y - world.y;
      if (Math.sqrt(dx * dx + dy * dy) < (n.radius || 14)) return n;
    }
    return null;
  }

  return { setCanvas, render, getNodeAt, TYPE_COLORS };
})();
