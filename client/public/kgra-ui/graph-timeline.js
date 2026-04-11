// ─── Graph Timeline Controller ──────────────────────────────────
// Playback engine: play/pause/seek/scrub/speed.
// Compare-state, step-by-step history, temporal heat.

const GraphTimeline = (() => {
  let _interval = null;
  let _stepIndex = 0;
  let _events = []; // sorted events for step-by-step
  let _activityData = []; // for heat overlay

  // ── Playback ──────────────────────────────────────────────────

  function play() {
    const state = GraphState.getState();
    if (!state.timeline.range.from || !state.timeline.range.to) return;

    GraphState.dispatch('SET_TIMELINE', { playing: true, enabled: true });

    const from = new Date(state.timeline.range.from).getTime();
    const to = new Date(state.timeline.range.to).getTime();
    const speed = state.timeline.speed;
    let position = state.timeline.position ? new Date(state.timeline.position).getTime() : from;

    // Tick every 50ms, advance position by speed * 50ms worth of real time
    const totalDuration = to - from;
    const tickMs = 50;
    const advancePerTick = totalDuration / (10000 / speed); // 10 seconds for full playback at 1x

    if (_interval) clearInterval(_interval);
    _interval = setInterval(() => {
      position += advancePerTick;
      if (position >= to) {
        position = to;
        pause();
      }
      const isoPos = new Date(position).toISOString();
      GraphState.dispatch('SET_TIMELINE', { position: isoPos });
      _applyTimePosition(isoPos);
      _updatePlaybackUI();
    }, tickMs);
  }

  function pause() {
    GraphState.dispatch('SET_TIMELINE', { playing: false });
    if (_interval) { clearInterval(_interval); _interval = null; }
  }

  function restart() {
    const state = GraphState.getState();
    const from = state.timeline.range.from;
    GraphState.dispatch('SET_TIMELINE', { position: from });
    // Hide all nodes initially
    for (const n of state.nodes) {
      n.visibilityState = 'hidden';
      n.animOpacity = 0;
      n.animScale = 0;
    }
    for (const e of state.edges) {
      e.visibilityState = 'hidden';
      e.animOpacity = 0;
    }
    play();
  }

  function seek(timestamp) {
    GraphState.dispatch('SET_TIMELINE', { position: timestamp });
    _applyTimePosition(timestamp);
    _updatePlaybackUI();
  }

  function setSpeed(speed) {
    GraphState.dispatch('SET_TIMELINE', { speed: parseFloat(speed) || 1 });
    // If playing, restart interval with new speed
    if (GraphState.get('timeline').playing) { pause(); play(); }
  }

  function setRange(from, to) {
    GraphState.dispatch('SET_TIMELINE', { range: { from, to }, position: from });
  }

  // ── Apply Time Position (reveal nodes up to this time) ────────

  function _applyTimePosition(isoTimestamp) {
    const state = GraphState.getState();
    const t = new Date(isoTimestamp).getTime();
    const animated = state.animationEnabled && !state.reducedMotion;

    for (const n of state.nodes) {
      const created = n.createdAt ? new Date(n.createdAt).getTime() : 0;
      if (created <= t && n.visibilityState !== 'visible') {
        n.visibilityState = 'entering';
        if (animated) {
          GraphAnimation.fadeIn(n.id, 'fast');
        } else {
          n.animOpacity = 1; n.animScale = 1;
        }
        setTimeout(() => { n.visibilityState = 'visible'; }, 200);
      } else if (created > t && n.visibilityState !== 'hidden') {
        n.visibilityState = 'hidden';
        n.animOpacity = 0; n.animScale = 0;
      }
    }

    for (const e of state.edges) {
      const created = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      if (created <= t && e.visibilityState !== 'visible') {
        e.visibilityState = 'visible';
        if (animated) GraphAnimation.animate(e.id, 'animOpacity', 0, 1, 'fast', 'easeOut');
        else e.animOpacity = 1;
      } else if (created > t && e.visibilityState !== 'hidden') {
        e.visibilityState = 'hidden'; e.animOpacity = 0;
      }
    }
  }

  // ── Compare Two States ────────────────────────────────────────

  async function compareStates(timestampA, timestampB) {
    const diff = await GraphAPI.fetchDiff(timestampA, timestampB);
    if (!diff) return;

    const state = GraphState.getState();
    const addedIds = new Set((diff.added?.nodes || []).map((n) => n.name || n.id));
    const changedIds = new Set((diff.changed?.nodes || []).map((n) => n.name || n.id));

    for (const n of state.nodes) {
      if (addedIds.has(n.id) || addedIds.has(n.label)) {
        n.highlightState = 'entering'; // green glow
        GraphAnimation.pulse(n.id, 600);
      } else if (changedIds.has(n.id) || changedIds.has(n.label)) {
        n.highlightState = 'live-updated'; // yellow pulse
        GraphAnimation.pulse(n.id, 400);
      } else {
        GraphAnimation.dimTo(n.id, 0.3, 'normal');
      }
    }

    // Show diff summary in inspector
    GraphInspector.clear();
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">State Comparison</div>
        <div style="font-size:10px; color:var(--text-dim);">
          <div><strong>From:</strong> ${timestampA}</div>
          <div><strong>To:</strong> ${timestampB}</div>
          <div style="margin-top:6px; color:#10b981;"><strong>Added:</strong> ${diff.added?.nodes?.length || 0} nodes, ${diff.added?.edges?.length || 0} edges</div>
          <div style="color:#f59e0b;"><strong>Changed:</strong> ${diff.changed?.nodes?.length || 0} nodes</div>
        </div>
        <button class="btn" onclick="GraphTimeline.clearCompare()" style="font-size:9px; padding:2px 6px; margin-top:8px;">Clear Compare</button>
      `;
    }
  }

  function clearCompare() {
    const state = GraphState.getState();
    for (const n of state.nodes) {
      n.highlightState = 'default';
      GraphAnimation.restore(n.id, 'fast');
    }
    GraphInspector.clear();
  }

  // ── Step-by-Step History ──────────────────────────────────────

  async function loadHistory(nodeId) {
    const events = await fetch(`/api/kgra-proxy/graph/history?node_id=${nodeId}`).then(r => r.json()).catch(() => []);
    _events = events;
    _stepIndex = 0;
    _showStep();
  }

  function stepForward() {
    if (_stepIndex < _events.length - 1) { _stepIndex++; _showStep(); }
  }

  function stepBackward() {
    if (_stepIndex > 0) { _stepIndex--; _showStep(); }
  }

  function _showStep() {
    if (!_events.length) return;
    const event = _events[_stepIndex];
    const container = document.getElementById('wb-inspector');
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">History Step ${_stepIndex + 1}/${_events.length}</div>
        <div style="font-size:10px; color:var(--text-dim); line-height:1.6;">
          <div><strong>Event:</strong> ${event.event}</div>
          <div><strong>At:</strong> ${event.at}</div>
          ${event.type ? `<div><strong>Type:</strong> ${event.type}</div>` : ''}
          ${event.source ? `<div><strong>Source:</strong> ${event.source}</div>` : ''}
          ${event.entities ? `<div><strong>Entities:</strong> ${event.entities}</div>` : ''}
          ${event.relationships ? `<div><strong>Relationships:</strong> ${event.relationships}</div>` : ''}
        </div>
        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="btn" onclick="GraphTimeline.stepBackward()" style="font-size:9px; padding:2px 8px;" ${_stepIndex === 0 ? 'disabled' : ''}>◀ Prev</button>
          <button class="btn" onclick="GraphTimeline.stepForward()" style="font-size:9px; padding:2px 8px;" ${_stepIndex >= _events.length - 1 ? 'disabled' : ''}>Next ▶</button>
        </div>
      `;
    }
    // Seek timeline to this event's time
    if (event.at) seek(event.at);
  }

  // ── Temporal Heat ─────────────────────────────────────────────

  async function loadActivityData() {
    _activityData = await GraphAPI.fetchSnapshot('activity').catch(() => []);
    // Actually use the activity endpoint
    _activityData = await fetch('/api/kgra-proxy/graph/activity?bucket=day').then(r => r.json()).catch(() => []);
  }

  function getHeatIntensity(nodeId, timestamp) {
    // Simple: node activity = connection count (static for now)
    // Future: map against _activityData by time bucket
    const node = GraphState.getState().nodeMap.get(nodeId);
    return node ? Math.min(1, (node.connections || 0) / 50) : 0;
  }

  // ── Playback UI ───────────────────────────────────────────────

  function renderPlaybackBar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const state = GraphState.getState().timeline;

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:10px;">
        <button class="btn" onclick="GraphTimeline.restart()" style="font-size:10px; padding:2px 6px;">|◀</button>
        <button class="btn" onclick="${state.playing ? 'GraphTimeline.pause()' : 'GraphTimeline.play()'}" style="font-size:10px; padding:2px 6px;">${state.playing ? '❚❚' : '▶'}</button>
        <select onchange="GraphTimeline.setSpeed(this.value)" style="font-size:9px; padding:1px; background:var(--bg-base); color:var(--text); border:1px solid var(--border); border-radius:3px;">
          <option value="0.5" ${state.speed === 0.5 ? 'selected' : ''}>0.5x</option>
          <option value="1" ${state.speed === 1 ? 'selected' : ''}>1x</option>
          <option value="2" ${state.speed === 2 ? 'selected' : ''}>2x</option>
          <option value="5" ${state.speed === 5 ? 'selected' : ''}>5x</option>
          <option value="10" ${state.speed === 10 ? 'selected' : ''}>10x</option>
        </select>
        <input type="range" min="0" max="100" value="${_getProgress()}" style="flex:1; accent-color:#6366f1;"
          oninput="GraphTimeline.onScrub(this.value)" />
        <span style="font-size:9px; color:var(--text-dim); min-width:80px;">${state.position ? new Date(state.position).toLocaleString() : '—'}</span>
      </div>
    `;
  }

  function _getProgress() {
    const state = GraphState.getState().timeline;
    if (!state.range.from || !state.range.to || !state.position) return 0;
    const from = new Date(state.range.from).getTime();
    const to = new Date(state.range.to).getTime();
    const pos = new Date(state.position).getTime();
    return Math.round(((pos - from) / (to - from)) * 100);
  }

  function onScrub(value) {
    const state = GraphState.getState().timeline;
    if (!state.range.from || !state.range.to) return;
    const from = new Date(state.range.from).getTime();
    const to = new Date(state.range.to).getTime();
    const pos = from + (to - from) * (parseInt(value) / 100);
    seek(new Date(pos).toISOString());
  }

  function _updatePlaybackUI() {
    // Refresh playback bar if visible
    const bar = document.getElementById('wb-playback-bar');
    if (bar) renderPlaybackBar('wb-playback-bar');
  }

  // ── Enable/Disable ────────────────────────────────────────────

  function enable() {
    GraphState.dispatch('SET_TIMELINE', { enabled: true });
    // Set range from earliest to latest entity
    const nodes = GraphState.get('nodes');
    const times = nodes.map(n => n.createdAt).filter(Boolean).map(t => new Date(t).getTime());
    if (times.length > 0) {
      const from = new Date(Math.min(...times)).toISOString();
      const to = new Date(Math.max(...times)).toISOString();
      setRange(from, to);
    }
  }

  function disable() {
    pause();
    GraphState.dispatch('SET_TIMELINE', { enabled: false, playing: false });
    // Restore all nodes to visible
    const state = GraphState.getState();
    for (const n of state.nodes) { n.visibilityState = 'visible'; n.animOpacity = 1; n.animScale = 1; }
    for (const e of state.edges) { e.visibilityState = 'visible'; e.animOpacity = 1; }
  }

  return {
    play, pause, restart, seek, setSpeed, setRange,
    compareStates, clearCompare,
    loadHistory, stepForward, stepBackward,
    loadActivityData, getHeatIntensity,
    renderPlaybackBar, onScrub, enable, disable,
  };
})();
