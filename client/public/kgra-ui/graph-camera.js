// ─── Graph Camera Controller ────────────────────────────────────
// Smooth zoom, pan, focus, fit. Reads/writes GraphState camera.

const GraphCamera = (() => {
  let _canvas = null;
  let _width = 0;
  let _height = 0;
  let _animating = false;
  let _animFrame = null;
  let _targetCamera = null;
  let _animStart = null;
  let _animDuration = 0;
  let _startCamera = null;

  function setCanvas(canvas) {
    _canvas = canvas;
    if (canvas) {
      const rect = canvas.parentElement.getBoundingClientRect();
      _width = rect.width;
      _height = rect.height;
    }
  }

  function resize() {
    if (_canvas) {
      const rect = _canvas.parentElement.getBoundingClientRect();
      _width = rect.width;
      _height = rect.height;
    }
  }

  function getCamera() {
    return GraphState.get('camera');
  }

  // ── Coordinate Transforms ─────────────────────────────────────

  function toScreen(wx, wy) {
    const cam = getCamera();
    return {
      x: (wx + cam.x) * cam.zoom + _width / 2,
      y: (wy + cam.y) * cam.zoom + _height / 2,
    };
  }

  function toWorld(sx, sy) {
    const cam = getCamera();
    return {
      x: (sx - _width / 2) / cam.zoom - cam.x,
      y: (sy - _height / 2) / cam.zoom - cam.y,
    };
  }

  // ── Immediate Camera Changes ──────────────────────────────────

  function setPosition(x, y) {
    GraphState.dispatch('SET_CAMERA', { x, y });
  }

  function setZoom(zoom) {
    GraphState.dispatch('SET_CAMERA', { zoom: Math.max(0.05, Math.min(5, zoom)) });
  }

  // ── Animated Camera Movements ─────────────────────────────────

  function panTo(x, y, duration) {
    _animateTo({ x, y, zoom: getCamera().zoom }, duration || 300);
  }

  function zoomTo(level, duration) {
    const cam = getCamera();
    _animateTo({ x: cam.x, y: cam.y, zoom: Math.max(0.05, Math.min(5, level)) }, duration || 300);
  }

  function focusNode(nodeId, duration) {
    const state = GraphState.getState();
    const node = state.nodeMap.get(nodeId);
    if (!node) return;
    _animateTo({ x: -node.x, y: -node.y, zoom: Math.max(1, getCamera().zoom) }, duration || 400);
  }

  function fitAll(duration) {
    const nodes = GraphState.get('nodes');
    if (!nodes || nodes.length === 0) return;
    _fitNodes(nodes, duration || 400);
  }

  function fitNodes(nodeIds, duration) {
    const state = GraphState.getState();
    const nodes = nodeIds.map(id => state.nodeMap.get(id)).filter(Boolean);
    if (nodes.length === 0) return;
    _fitNodes(nodes, duration || 400);
  }

  function _fitNodes(nodes, duration) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const zoom = Math.min(1.5, Math.min(_width / (graphW + 100), _height / (graphH + 100)));
    _animateTo({ x: -cx, y: -cy, zoom }, duration);
  }

  // ── Animation Loop ────────────────────────────────────────────

  function _animateTo(target, duration) {
    const state = GraphState.getState();
    if (state.reducedMotion || !state.animationEnabled || duration <= 0) {
      GraphState.dispatch('SET_CAMERA', target);
      return;
    }

    _startCamera = { ...getCamera() };
    _targetCamera = target;
    _animDuration = duration;
    _animStart = performance.now();

    if (!_animating) {
      _animating = true;
      _animFrame = requestAnimationFrame(_tick);
    }
  }

  function _tick(now) {
    if (!_animating || !_targetCamera || !_startCamera) return;

    const elapsed = now - _animStart;
    const progress = Math.min(1, elapsed / _animDuration);
    const t = GraphAnimation.EASING.easeInOut(progress);

    GraphState.dispatch('SET_CAMERA', {
      x: _startCamera.x + (_targetCamera.x - _startCamera.x) * t,
      y: _startCamera.y + (_targetCamera.y - _startCamera.y) * t,
      zoom: _startCamera.zoom + (_targetCamera.zoom - _startCamera.zoom) * t,
    });

    if (progress < 1) {
      _animFrame = requestAnimationFrame(_tick);
    } else {
      _animating = false;
      _targetCamera = null;
    }
  }

  function stopAnimation() {
    _animating = false;
    _targetCamera = null;
    if (_animFrame) cancelAnimationFrame(_animFrame);
  }

  // ── Scroll Zoom ───────────────────────────────────────────────

  function handleWheel(e, canvasRect) {
    e.preventDefault();
    const cam = getCamera();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(5, cam.zoom * delta));

    // Zoom toward mouse position
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;
    const wx = (mx - _width / 2) / cam.zoom - cam.x;
    const wy = (my - _height / 2) / cam.zoom - cam.y;
    const nx = (mx - _width / 2) / newZoom - wx;
    const ny = (my - _height / 2) / newZoom - wy;

    GraphState.dispatch('SET_CAMERA', { x: nx, y: ny, zoom: newZoom });
  }

  return {
    setCanvas, resize,
    toScreen, toWorld,
    setPosition, setZoom,
    panTo, zoomTo, focusNode, fitAll, fitNodes,
    stopAnimation, handleWheel,
    getWidth: () => _width,
    getHeight: () => _height,
  };
})();
