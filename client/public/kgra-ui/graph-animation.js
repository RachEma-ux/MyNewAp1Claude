// ─── Graph Animation Engine ─────────────────────────────────────
// Centralized motion system. All graph animation goes through here.
// Supports per-item transitions, easing, interruption, and reduced-motion.

const GraphAnimation = (() => {
  const _transitions = new Map(); // key: "targetId:property" → transition object
  let _reducedMotion = false;
  let _speedMultiplier = 1;
  let _enabled = true;
  let _running = false;
  let _lastFrame = 0;

  // ── Easing Functions ──────────────────────────────────────────
  const EASING = {
    linear: t => t,
    easeOut: t => 1 - Math.pow(1 - t, 3),
    easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    spring: t => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
  };

  // ── Duration Presets ──────────────────────────────────────────
  const DURATION = {
    instant: 0,
    fast: 150,
    normal: 300,
    slow: 600,
    playback: 1000,
  };

  // ── Core API ──────────────────────────────────────────────────

  function animate(targetId, property, from, to, duration, easing) {
    if (!_enabled || _reducedMotion) {
      // Instant: apply final value immediately
      _applyValue(targetId, property, to);
      return;
    }

    const key = `${targetId}:${property}`;
    const effectiveDuration = (typeof duration === 'string' ? DURATION[duration] || 300 : duration) / _speedMultiplier;
    const easeFn = typeof easing === 'function' ? easing : EASING[easing] || EASING.easeOut;

    _transitions.set(key, {
      targetId,
      property,
      from,
      to,
      duration: effectiveDuration,
      easing: easeFn,
      startTime: performance.now(),
      done: false,
    });

    if (!_running) _startLoop();
  }

  function cancel(targetId, property) {
    if (property) {
      _transitions.delete(`${targetId}:${property}`);
    } else {
      // Cancel all transitions for this target
      for (const key of _transitions.keys()) {
        if (key.startsWith(targetId + ':')) _transitions.delete(key);
      }
    }
  }

  function cancelAll() {
    _transitions.clear();
  }

  function isAnimating(targetId) {
    if (!targetId) return _transitions.size > 0;
    for (const key of _transitions.keys()) {
      if (key.startsWith(targetId + ':')) return true;
    }
    return false;
  }

  function setReducedMotion(val) {
    _reducedMotion = val;
    if (val) cancelAll();
  }

  function setSpeed(multiplier) {
    _speedMultiplier = Math.max(0.1, Math.min(10, multiplier));
  }

  function setEnabled(val) {
    _enabled = val;
    if (!val) cancelAll();
  }

  function getProgress(targetId, property) {
    const t = _transitions.get(`${targetId}:${property}`);
    if (!t) return 1;
    const elapsed = performance.now() - t.startTime;
    return Math.min(1, elapsed / t.duration);
  }

  function getValue(targetId, property, defaultVal) {
    const t = _transitions.get(`${targetId}:${property}`);
    if (!t) return defaultVal;
    const elapsed = performance.now() - t.startTime;
    const progress = Math.min(1, elapsed / t.duration);
    const eased = t.easing(progress);
    return t.from + (t.to - t.from) * eased;
  }

  // ── Internal Loop ─────────────────────────────────────────────

  function _startLoop() {
    if (_running) return;
    _running = true;
    _lastFrame = performance.now();
    requestAnimationFrame(_tick);
  }

  function _tick(now) {
    const completed = [];

    for (const [key, t] of _transitions) {
      const elapsed = now - t.startTime;
      const progress = Math.min(1, elapsed / t.duration);
      const eased = t.easing(progress);
      const value = t.from + (t.to - t.from) * eased;

      _applyValue(t.targetId, t.property, value);

      if (progress >= 1) {
        completed.push(key);
      }
    }

    for (const key of completed) {
      _transitions.delete(key);
    }

    if (_transitions.size > 0) {
      requestAnimationFrame(_tick);
    } else {
      _running = false;
    }

    _lastFrame = now;
  }

  function _applyValue(targetId, property, value) {
    // Apply to graph state store node/edge
    const state = GraphState.getState();
    const node = state.nodeMap.get(targetId);
    if (node) {
      node[property] = value;
      return;
    }
    // Try edges
    const edge = state.edges.find(e => e.id === targetId);
    if (edge) {
      edge[property] = value;
    }
  }

  // ── Convenience Methods ───────────────────────────────────────

  function fadeIn(targetId, duration) {
    animate(targetId, 'animOpacity', 0, 1, duration || 'normal', 'easeOut');
    animate(targetId, 'animScale', 0.3, 1, duration || 'normal', 'easeOut');
  }

  function fadeOut(targetId, duration) {
    animate(targetId, 'animOpacity', 1, 0, duration || 'normal', 'easeOut');
    animate(targetId, 'animScale', 1, 0.3, duration || 'normal', 'easeOut');
  }

  function pulse(targetId, duration) {
    animate(targetId, 'animScale', 1, 1.2, (duration || 300) / 2, 'easeOut');
    setTimeout(() => {
      animate(targetId, 'animScale', 1.2, 1, (duration || 300) / 2, 'easeOut');
    }, (duration || 300) / 2);
  }

  function dimTo(targetId, opacity, duration) {
    animate(targetId, 'animOpacity', undefined, opacity, duration || 'fast', 'easeOut');
  }

  function restore(targetId, duration) {
    animate(targetId, 'animOpacity', undefined, 1, duration || 'fast', 'easeOut');
    animate(targetId, 'animScale', undefined, 1, duration || 'fast', 'easeOut');
  }

  return {
    animate, cancel, cancelAll, isAnimating,
    setReducedMotion, setSpeed, setEnabled,
    getProgress, getValue,
    fadeIn, fadeOut, pulse, dimTo, restore,
    EASING, DURATION,
  };
})();
