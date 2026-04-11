// ─── Graph Performance Guard ────────────────────────────────────
// FPS monitoring, auto mode switching, lazy rendering, mobile detection.
// Three modes: full, balanced, safe.

const GraphPerf = (() => {
  let _fpsHistory = [];
  let _checkInterval = null;
  const FPS_WINDOW = 10; // samples
  const CHECK_INTERVAL = 2000; // ms

  // ── Mode Thresholds ───────────────────────────────────────────
  // Mode determined by node count AND average FPS

  const THRESHOLDS = {
    full: { maxNodes: 500, minFps: 30 },
    balanced: { maxNodes: 1000, minFps: 15 },
    // safe: everything above balanced thresholds
  };

  // ── Mode Capabilities ─────────────────────────────────────────

  const MODE_CAPS = {
    full: {
      edgeLabels: true,
      hoverDim: true,
      pulse: true,
      badges: true,
      softEdgeOpacity: true,
      nodeLabels: true,
      filterAnimation: true,
    },
    balanced: {
      edgeLabels: false,     // skip edge label rendering
      hoverDim: true,
      pulse: false,          // no pulse animation
      badges: true,
      softEdgeOpacity: true,
      nodeLabels: true,
      filterAnimation: false, // instant filter
    },
    safe: {
      edgeLabels: false,
      hoverDim: false,        // no hover dim (expensive on large graphs)
      pulse: false,
      badges: false,
      softEdgeOpacity: false,
      nodeLabels: false,       // skip labels at safe mode
      filterAnimation: false,
    },
  };

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    // Detect mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     ('ontouchstart' in window && window.innerWidth < 768);
    if (isMobile) {
      // Start in balanced mode on mobile
      GraphState.dispatch('SET_PERFORMANCE', { performanceMode: 'balanced' });
    }

    // Start monitoring
    startMonitoring();
  }

  function startMonitoring() {
    if (_checkInterval) return;
    _checkInterval = setInterval(_evaluate, CHECK_INTERVAL);
  }

  function stopMonitoring() {
    if (_checkInterval) { clearInterval(_checkInterval); _checkInterval = null; }
  }

  // ── FPS Recording ─────────────────────────────────────────────

  function recordFps(fps) {
    _fpsHistory.push(fps);
    if (_fpsHistory.length > FPS_WINDOW) _fpsHistory.shift();
  }

  function getAverageFps() {
    if (_fpsHistory.length === 0) return 60;
    return Math.round(_fpsHistory.reduce((a, b) => a + b, 0) / _fpsHistory.length);
  }

  // ── Evaluate & Switch Mode ────────────────────────────────────

  function _evaluate() {
    const avgFps = getAverageFps();
    const nodeCount = GraphState.get('nodeCount') || 0;
    const currentMode = GraphState.get('performanceMode');

    let newMode = 'safe';
    if (nodeCount <= THRESHOLDS.full.maxNodes && avgFps >= THRESHOLDS.full.minFps) {
      newMode = 'full';
    } else if (nodeCount <= THRESHOLDS.balanced.maxNodes && avgFps >= THRESHOLDS.balanced.minFps) {
      newMode = 'balanced';
    }

    if (newMode !== currentMode) {
      GraphState.dispatch('SET_PERFORMANCE', { performanceMode: newMode });
      _applyMode(newMode);
    }
  }

  function _applyMode(mode) {
    const caps = MODE_CAPS[mode] || MODE_CAPS.safe;

    // Adjust animation engine
    if (mode === 'safe') {
      GraphAnimation.setEnabled(false);
    } else {
      // Respect user preference
      const userPref = GraphState.get('animationEnabled');
      GraphAnimation.setEnabled(userPref);
    }
  }

  // ── Capability Check ──────────────────────────────────────────

  function can(feature) {
    const mode = GraphState.get('performanceMode') || 'full';
    return (MODE_CAPS[mode] || MODE_CAPS.full)[feature] !== false;
  }

  function getMode() {
    return GraphState.get('performanceMode') || 'full';
  }

  function forceMode(mode) {
    GraphState.dispatch('SET_PERFORMANCE', { performanceMode: mode });
    _applyMode(mode);
  }

  return { init, startMonitoring, stopMonitoring, recordFps, getAverageFps, can, getMode, forceMode };
})();
