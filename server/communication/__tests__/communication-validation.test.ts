/**
 * Communication — validation lifecycle tests.
 *
 * Pure functions; no DB access required.
 */
import { describe, it, expect } from "vitest";
import {
  validateConversationTransition,
  validateMeetingTransition,
} from "../communication.validation";

describe("Communication conversation lifecycle", () => {
  it("allows active → archived", () => {
    expect(() =>
      validateConversationTransition("active", "archived"),
    ).not.toThrow();
  });

  it("allows active → deleted", () => {
    expect(() =>
      validateConversationTransition("active", "deleted"),
    ).not.toThrow();
  });

  it("allows archived → active (un-archive)", () => {
    expect(() =>
      validateConversationTransition("archived", "active"),
    ).not.toThrow();
  });

  it("allows archived → deleted", () => {
    expect(() =>
      validateConversationTransition("archived", "deleted"),
    ).not.toThrow();
  });

  it("rejects deleted → anything (terminal)", () => {
    expect(() =>
      validateConversationTransition("deleted", "active"),
    ).toThrow(/Invalid/);
    expect(() =>
      validateConversationTransition("deleted", "archived"),
    ).toThrow(/Invalid/);
  });

  it("rejects same-status transition", () => {
    expect(() =>
      validateConversationTransition("active", "active"),
    ).toThrow(/Invalid/);
  });
});

describe("Communication meeting lifecycle", () => {
  it("allows scheduled → active", () => {
    expect(() => validateMeetingTransition("scheduled", "active")).not.toThrow();
  });

  it("allows scheduled → cancelled", () => {
    expect(() =>
      validateMeetingTransition("scheduled", "cancelled"),
    ).not.toThrow();
  });

  it("allows active → completed", () => {
    expect(() =>
      validateMeetingTransition("active", "completed"),
    ).not.toThrow();
  });

  it("allows active → cancelled", () => {
    expect(() =>
      validateMeetingTransition("active", "cancelled"),
    ).not.toThrow();
  });

  it("rejects completed → anything (terminal)", () => {
    expect(() =>
      validateMeetingTransition("completed", "active"),
    ).toThrow(/Invalid/);
    expect(() =>
      validateMeetingTransition("completed", "cancelled"),
    ).toThrow(/Invalid/);
  });

  it("rejects cancelled → anything (terminal)", () => {
    expect(() =>
      validateMeetingTransition("cancelled", "active"),
    ).toThrow(/Invalid/);
  });

  it("rejects scheduled → completed (must go through active first)", () => {
    expect(() =>
      validateMeetingTransition("scheduled", "completed"),
    ).toThrow(/Invalid/);
  });
});
