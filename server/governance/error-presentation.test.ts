import { describe, expect, it } from "vitest";
import {
  containsTechnicalDetails,
  toUserSafeGovernanceDetail,
  toUserSafeGovernanceMessage,
} from "../../shared/error-presentation";

describe("governance error presentation", () => {
  it("detects SQL and other internal failure text", () => {
    expect(
      containsTechnicalDetails(
        "Failed query: select * from agents where id = $1"
      )
    ).toBe(true);
    expect(
      containsTechnicalDetails("Postgres relation agents does not exist")
    ).toBe(true);
  });

  it("preserves plain-English governance messages", () => {
    const message =
      'Stage review for "publish" has not been approved yet. Complete the review before transitioning.';
    expect(toUserSafeGovernanceMessage(message)).toBe(message);
  });

  it("replaces technical governance details with user-safe fallback text", () => {
    expect(
      toUserSafeGovernanceDetail("Failed query: select * from agents")
    ).toBe("The system could not load the agents needed for this action.");
  });
});
