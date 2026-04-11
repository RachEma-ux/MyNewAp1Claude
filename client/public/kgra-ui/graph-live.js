// ─── Graph Live Update Bridge ───────────────────────────────────
// SSE connection, batched updates, pause/resume.

const GraphLive = (() => {
  let _eventSource = null;
  let _buffer = [];
  let _batchTimer = null;
  const BATCH_INTERVAL = 500; // ms

  // ── Connect ───────────────────────────────────────────────────

  function connect() {
    if (_eventSource) disconnect();

    try {
      _eventSource = new EventSource('/api/kgra-proxy/graph/stream');

      _eventSource.onopen = () => {
        GraphState.dispatch('SET_LIVE', { liveConnected: true, liveMode: true });
      };

      _eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'heartbeat' || data.type === 'connected') return;

          // Buffer events
          if (GraphState.get('livePaused')) {
            _buffer.push(data);
            return;
          }

          _buffer.push(data);
          // Batch process
          if (!_batchTimer) {
            _batchTimer = setTimeout(_processBatch, BATCH_INTERVAL);
          }
        } catch {}
      };

      _eventSource.onerror = () => {
        GraphState.dispatch('SET_LIVE', { liveConnected: false });
      };
    } catch {
      GraphState.dispatch('SET_LIVE', { liveConnected: false });
    }
  }

  function disconnect() {
    if (_eventSource) {
      _eventSource.close();
      _eventSource = null;
    }
    if (_batchTimer) { clearTimeout(_batchTimer); _batchTimer = null; }
    GraphState.dispatch('SET_LIVE', { liveMode: false, liveConnected: false });
  }

  // ── Pause/Resume ──────────────────────────────────────────────

  function pause() {
    GraphState.dispatch('SET_LIVE', { livePaused: true });
  }

  function resume() {
    GraphState.dispatch('SET_LIVE', { livePaused: false });
    // Process buffered events
    if (_buffer.length > 0) _processBatch();
  }

  function jumpToLatest() {
    resume();
    // Immediately process all buffered
    _processBatch();
  }

  // ── Batch Processing ──────────────────────────────────────────

  function _processBatch() {
    _batchTimer = null;
    if (_buffer.length === 0) return;

    const batch = _buffer.splice(0);
    const state = GraphState.getState();
    const animated = state.animationEnabled && !state.reducedMotion;

    for (const event of batch) {
      switch (event.type) {
        case 'node-added': {
          const payload = event.payload;
          if (!payload || !payload.id) break;
          // Add node to state
          const newNode = {
            id: payload.id, label: payload.name || payload.id, type: payload.type || 'ENTITY',
            family: payload.family || '', community: payload.community || '',
            source: payload.source || 'auto', connections: 0,
            x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400,
            radius: 12, animOpacity: 0, animScale: 0,
            highlightState: 'live-updated', visibilityState: 'entering',
          };
          state.nodes.push(newNode);
          state.nodeMap.set(newNode.id, newNode);
          if (animated) GraphAnimation.fadeIn(newNode.id, 'normal');
          else { newNode.animOpacity = 1; newNode.animScale = 1; }
          setTimeout(() => { newNode.highlightState = 'default'; newNode.visibilityState = 'visible'; }, 1000);
          break;
        }
        case 'node-updated': {
          const payload = event.payload;
          if (!payload || !payload.id) break;
          const node = state.nodeMap.get(payload.id);
          if (node) {
            Object.assign(node, payload.updates || {});
            node.highlightState = 'live-updated';
            if (animated) GraphAnimation.pulse(node.id, 400);
            setTimeout(() => { node.highlightState = 'default'; }, 1000);
          }
          break;
        }
        case 'edge-added': {
          const payload = event.payload;
          if (!payload) break;
          const newEdge = {
            id: `live_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
            source: payload.source, target: payload.target,
            type: payload.type || 'RELATED_TO', weight: 1,
            sourceLayer: 'auto', animOpacity: 0,
            highlightState: 'default', visibilityState: 'entering',
          };
          state.edges.push(newEdge);
          if (animated) GraphAnimation.animate(newEdge.id, 'animOpacity', 0, 1, 'normal', 'easeOut');
          else newEdge.animOpacity = 1;
          setTimeout(() => { newEdge.visibilityState = 'visible'; }, 500);
          break;
        }
        case 'edge-removed': {
          const payload = event.payload;
          if (!payload || !payload.id) break;
          const idx = state.edges.findIndex(e => e.id === payload.id);
          if (idx >= 0) {
            if (animated) {
              GraphAnimation.fadeOut(state.edges[idx].id, 'normal');
              setTimeout(() => { state.edges.splice(idx, 1); }, 300);
            } else {
              state.edges.splice(idx, 1);
            }
          }
          break;
        }
      }
    }

    // Update counts
    GraphState.dispatch('SET_GRAPH', { nodes: state.nodes, edges: state.edges });
  }

  // ── Status ────────────────────────────────────────────────────

  function getStatus() {
    return {
      connected: GraphState.get('liveConnected'),
      paused: GraphState.get('livePaused'),
      buffered: _buffer.length,
    };
  }

  return { connect, disconnect, pause, resume, jumpToLatest, getStatus };
})();
