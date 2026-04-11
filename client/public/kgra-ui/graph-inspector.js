// ─── Graph Inspector ────────────────────────────────────────────
// Right panel: node details, edge details, path summary.
// Reads from GraphState. Updates when selection changes.

const GraphInspector = (() => {
  let _container = null;

  function setContainer(el) {
    _container = el;
  }

  function showNode(nodeId) {
    if (!_container) return;
    const state = GraphState.getState();
    const node = state.nodeMap.get(nodeId);
    if (!node) { clear(); return; }

    // Find connected edges
    const connected = state.edges.filter(e => e.source === nodeId || e.target === nodeId);
    const inbound = connected.filter(e => e.target === nodeId);
    const outbound = connected.filter(e => e.source === nodeId);

    _container.style.display = 'block';
    _container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <span style="font-weight:600; color:var(--text); font-size:13px;">${node.label}</span>
        <button onclick="GraphInspector.clear()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="font-size:10px; color:var(--text-dim); line-height:1.6;">
        <div><strong>Type:</strong> ${node.type}</div>
        <div><strong>Family:</strong> ${node.family || '—'}</div>
        <div><strong>Source:</strong> ${node.source || 'auto'}</div>
        <div><strong>Connections:</strong> ${connected.length} (${inbound.length} in, ${outbound.length} out)</div>
        ${node.community ? `<div><strong>Community:</strong> ${node.community}</div>` : ''}
      </div>
      ${outbound.length > 0 ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--text); margin-bottom:4px;">Outbound (${outbound.length})</div>
          ${outbound.slice(0, 15).map(e => {
            const tgt = state.nodeMap.get(e.target);
            return `<div style="font-size:9px; color:var(--text-dim); padding:1px 0; cursor:pointer;" onclick="GraphCamera.focusNode('${e.target}',300)">→ ${e.type} → ${tgt?.label || e.target}</div>`;
          }).join('')}
          ${outbound.length > 15 ? `<div style="font-size:9px; color:var(--text-muted);">... and ${outbound.length - 15} more</div>` : ''}
        </div>
      ` : ''}
      ${inbound.length > 0 ? `
        <div style="margin-top:8px;">
          <div style="font-size:10px; font-weight:600; color:var(--text); margin-bottom:4px;">Inbound (${inbound.length})</div>
          ${inbound.slice(0, 15).map(e => {
            const src = state.nodeMap.get(e.source);
            return `<div style="font-size:9px; color:var(--text-dim); padding:1px 0; cursor:pointer;" onclick="GraphCamera.focusNode('${e.source}',300)">← ${src?.label || e.source} → ${e.type}</div>`;
          }).join('')}
          ${inbound.length > 15 ? `<div style="font-size:9px; color:var(--text-muted);">... and ${inbound.length - 15} more</div>` : ''}
        </div>
      ` : ''}
      <div style="margin-top:10px; display:flex; gap:4px; flex-wrap:wrap;">
        <button class="btn" onclick="GraphCamera.focusNode('${nodeId}',300)" style="font-size:9px; padding:2px 6px;">Center</button>
        <button class="btn" onclick="GraphCamera.fitAll(400)" style="font-size:9px; padding:2px 6px;">Fit All</button>
      </div>
    `;
  }

  function showEdge(edgeId) {
    if (!_container) return;
    const state = GraphState.getState();
    const edge = state.edges.find(e => e.id === edgeId);
    if (!edge) { clear(); return; }

    const src = state.nodeMap.get(edge.source);
    const tgt = state.nodeMap.get(edge.target);

    _container.style.display = 'block';
    _container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <span style="font-weight:600; color:var(--text); font-size:13px;">${edge.type}</span>
        <button onclick="GraphInspector.clear()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="font-size:10px; color:var(--text-dim); line-height:1.6;">
        <div><strong>From:</strong> ${src?.label || edge.source}</div>
        <div><strong>To:</strong> ${tgt?.label || edge.target}</div>
        <div><strong>Type:</strong> ${edge.type}</div>
        <div><strong>Category:</strong> ${edge.category || '—'}</div>
        <div><strong>Weight:</strong> ${edge.weight || 1}</div>
        <div><strong>Strength:</strong> ${edge.linkStrength || 'hard'}</div>
        ${edge.confidence ? `<div><strong>Confidence:</strong> ${Math.round(parseFloat(edge.confidence) * 100)}%</div>` : ''}
        <div><strong>Source layer:</strong> ${edge.sourceLayer || 'auto'}</div>
      </div>
    `;
  }

  function clear() {
    if (_container) {
      _container.style.display = 'none';
      _container.innerHTML = '';
    }
  }

  return { setContainer, showNode, showEdge, clear };
})();
