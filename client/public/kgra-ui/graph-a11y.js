// ─── Graph Accessibility Manager ────────────────────────────────
// Reduced motion, animation toggle, preference persistence.

const GraphA11y = (() => {

  function init() {
    // Read persisted preferences
    const animPref = localStorage.getItem('graph-animation');
    const motionPref = localStorage.getItem('graph-reduced-motion');

    if (animPref === 'off') {
      GraphState.dispatch('SET_ACCESSIBILITY', { animationEnabled: false });
      GraphAnimation.setEnabled(false);
    }
    if (motionPref === 'true') {
      GraphState.dispatch('SET_ACCESSIBILITY', { reducedMotion: true });
      GraphAnimation.setReducedMotion(true);
    }

    // System preference
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches && motionPref !== 'false') {
      GraphState.dispatch('SET_ACCESSIBILITY', { reducedMotion: true });
      GraphAnimation.setReducedMotion(true);
    }
    if (mq) {
      mq.addEventListener?.('change', (e) => {
        setReducedMotion(e.matches);
      });
    }
  }

  function setReducedMotion(val) {
    GraphState.dispatch('SET_ACCESSIBILITY', { reducedMotion: val });
    GraphAnimation.setReducedMotion(val);
    localStorage.setItem('graph-reduced-motion', val ? 'true' : 'false');
  }

  function setAnimationEnabled(val) {
    GraphState.dispatch('SET_ACCESSIBILITY', { animationEnabled: val });
    GraphAnimation.setEnabled(val);
    localStorage.setItem('graph-animation', val ? 'on' : 'off');
  }

  function toggleAnimation() {
    const current = GraphState.get('animationEnabled');
    setAnimationEnabled(!current);
  }

  function toggleReducedMotion() {
    const current = GraphState.get('reducedMotion');
    setReducedMotion(!current);
  }

  function getPreferences() {
    return {
      animationEnabled: GraphState.get('animationEnabled'),
      reducedMotion: GraphState.get('reducedMotion'),
    };
  }

  return { init, setReducedMotion, setAnimationEnabled, toggleAnimation, toggleReducedMotion, getPreferences };
})();
