// ─── Graph State Store ──────────────────────────────────────────
// Single source of truth for all graph UI state.
// All components read from here. Mutations only via dispatch().

const GraphState = (() => {
  const _listeners = new Set();

  const _state = {
    // Data
    nodes: [],
    edges: [],
    nodeMap: new Map(),

    // Selection
    selectedNodeId: null,
    hoveredNodeId: null,
    selectedPath: [],

    // Filters
    filters: {
      types: new Set(),
      families: new Set(),
      status: new Set(),
      owner: new Set(),
      search: '',
      depth: Infinity,
    },

    // Layout
    layout: 'force',
    layoutParams: { repel: 800, linkDist: 80, centerForce: 0.01 },
    layoutStabilized: false,
    layoutFrozen: false,

    // Camera
    camera: { x: 0, y: 0, zoom: 1 },

    // Timeline
    timeline: {
      enabled: false,
      playing: false,
      position: null,
      speed: 1,
      range: { from: null, to: null },
    },

    // Mode
    activeMode: 'all',
    activeModeData: null,

    // Clustering
    clusterMode: false,
    activeClusterId: null,

    // Live
    liveMode: false,
    liveConnected: false,
    livePaused: false,

    // Accessibility
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false,
    animationEnabled: localStorage.getItem('graph-animation') !== 'off',

    // Performance
    performanceMode: 'full',
    fps: 60,
    nodeCount: 0,
    edgeCount: 0,
  };

  function getState() {
    return _state;
  }

  function get(key) {
    return _state[key];
  }

  function subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  function _notify(action, data) {
    for (const fn of _listeners) {
      try { fn(action, data, _state); } catch (e) { console.error('GraphState listener error:', e); }
    }
  }

  function dispatch(action, data) {
    switch (action) {
      case 'SET_NODES': {
        _state.nodes = data.nodes || [];
        _state.nodeMap = new Map(_state.nodes.map(n => [n.id, n]));
        _state.nodeCount = _state.nodes.length;
        break;
      }
      case 'SET_EDGES': {
        _state.edges = data.edges || [];
        _state.edgeCount = _state.edges.length;
        break;
      }
      case 'SET_GRAPH': {
        _state.nodes = data.nodes || [];
        _state.edges = data.edges || [];
        _state.nodeMap = new Map(_state.nodes.map(n => [n.id, n]));
        _state.nodeCount = _state.nodes.length;
        _state.edgeCount = _state.edges.length;
        break;
      }
      case 'SELECT_NODE': {
        _state.selectedNodeId = data.nodeId;
        break;
      }
      case 'HOVER_NODE': {
        _state.hoveredNodeId = data.nodeId;
        break;
      }
      case 'SET_SELECTED_PATH': {
        _state.selectedPath = data.path || [];
        break;
      }
      case 'SET_FILTER': {
        Object.assign(_state.filters, data);
        break;
      }
      case 'SET_LAYOUT': {
        if (data.layout) _state.layout = data.layout;
        if (data.params) Object.assign(_state.layoutParams, data.params);
        if (data.stabilized !== undefined) _state.layoutStabilized = data.stabilized;
        if (data.frozen !== undefined) _state.layoutFrozen = data.frozen;
        break;
      }
      case 'SET_CAMERA': {
        if (data.x !== undefined) _state.camera.x = data.x;
        if (data.y !== undefined) _state.camera.y = data.y;
        if (data.zoom !== undefined) _state.camera.zoom = data.zoom;
        break;
      }
      case 'SET_TIMELINE': {
        Object.assign(_state.timeline, data);
        break;
      }
      case 'SET_MODE': {
        _state.activeMode = data.mode || 'all';
        _state.activeModeData = data.modeData || null;
        break;
      }
      case 'SET_CLUSTER': {
        if (data.clusterMode !== undefined) _state.clusterMode = data.clusterMode;
        if (data.activeClusterId !== undefined) _state.activeClusterId = data.activeClusterId;
        break;
      }
      case 'SET_LIVE': {
        if (data.liveMode !== undefined) _state.liveMode = data.liveMode;
        if (data.liveConnected !== undefined) _state.liveConnected = data.liveConnected;
        if (data.livePaused !== undefined) _state.livePaused = data.livePaused;
        break;
      }
      case 'SET_ACCESSIBILITY': {
        if (data.reducedMotion !== undefined) _state.reducedMotion = data.reducedMotion;
        if (data.animationEnabled !== undefined) {
          _state.animationEnabled = data.animationEnabled;
          localStorage.setItem('graph-animation', data.animationEnabled ? 'on' : 'off');
        }
        break;
      }
      case 'SET_PERFORMANCE': {
        if (data.performanceMode) _state.performanceMode = data.performanceMode;
        if (data.fps !== undefined) _state.fps = data.fps;
        break;
      }
      case 'UPDATE_NODE': {
        const node = _state.nodeMap.get(data.nodeId);
        if (node) Object.assign(node, data.updates);
        break;
      }
      case 'UPDATE_NODE_POSITION': {
        const n = _state.nodeMap.get(data.nodeId);
        if (n) { n.x = data.x; n.y = data.y; }
        break;
      }
      case 'BATCH_UPDATE_POSITIONS': {
        for (const [id, pos] of data.positions) {
          const n = _state.nodeMap.get(id);
          if (n) { n.x = pos.x; n.y = pos.y; }
        }
        break;
      }
      default:
        console.warn('GraphState: unknown action', action);
    }
    _notify(action, data);
  }

  return { getState, get, subscribe, dispatch };
})();
