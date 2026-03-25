/**
 * Culture Values — Lifecycle State Machines
 */

import { TRPCError } from "@trpc/server";

export type ValueSetStatus = "draft" | "active" | "deprecated" | "archived";

export const VALUE_SET_TRANSITIONS: Record<ValueSetStatus, readonly ValueSetStatus[]> = {
  draft: ["active", "archived"],
  active: ["deprecated", "archived"],
  deprecated: ["active", "archived"],
  archived: [], // terminal
};

export type ValueDefStatus = "active" | "deprecated" | "archived";

export const VALUE_DEF_TRANSITIONS: Record<ValueDefStatus, readonly ValueDefStatus[]> = {
  active: ["deprecated", "archived"],
  deprecated: ["active", "archived"],
  archived: [], // terminal
};

function validateTransition(
  entityType: string,
  transitions: Record<string, readonly string[]>,
  from: string,
  to: string,
): void {
  if (from === to) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: status is already "${from}"`,
    });
  }
  const allowed = transitions[from];
  if (!allowed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: unknown status "${from}"`,
    });
  }
  if (!allowed.includes(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${entityType}: transition "${from}" → "${to}" is not allowed. Valid: ${allowed.join(", ") || "none (terminal)"}`,
    });
  }
}

export const validateValueSetTransition = (from: string, to: string) =>
  validateTransition("ValueSet", VALUE_SET_TRANSITIONS, from, to);

export const validateValueDefTransition = (from: string, to: string) =>
  validateTransition("ValueDefinition", VALUE_DEF_TRANSITIONS, from, to);
