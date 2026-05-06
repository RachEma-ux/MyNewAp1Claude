/**
 * RAC Evaluation — public barrel (Phase 8).
 */

export { scoreGroundedness } from "./groundedness";
export type { GroundednessInput, GroundednessResult } from "./groundedness";

export {
  scoreRelevance,
  scoreCitationCoverage,
} from "./relevance";
export type {
  RelevanceInput,
  RelevanceResult,
  PerChunkRelevance,
  CitationCoverageInput,
  CitationCoverageResult,
} from "./relevance";

export {
  scoreRecallMrr,
  RAC_SEED_FIXTURE,
} from "./recall-mrr";
export type {
  LabeledQuestion,
  LabeledFixture,
  RecallMrrInput,
  RecallMrrResult,
  RecallMrrPerQuestion,
} from "./recall-mrr";
