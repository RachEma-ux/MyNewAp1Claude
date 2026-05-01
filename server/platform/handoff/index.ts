/** Handoff Manager — public entry point. */
export * from "./types";
export {
  submitHandoff,
  transitionHandoff,
  getHandoff,
  listHandoffs,
  registerHandoffAcceptor,
  setHandoffStore,
  __resetHandoffsForTests,
} from "./handoff-manager";
