const TECHNICAL_DETAIL_PATTERNS = [
  /failed query:/i,
  /\bselect\b[\s\S]{0,200}\bfrom\b/i,
  /\binsert\b[\s\S]{0,200}\binto\b/i,
  /\bupdate\b[\s\S]{0,200}\bset\b/i,
  /\bdelete\b[\s\S]{0,200}\bfrom\b/i,
  /\bwith\b[\s\S]{0,200}\bselect\b/i,
  /\bpostgres\b/i,
  /\bpostgresql\b/i,
  /\bsqlite\b/i,
  /\bsqlstate\b/i,
  /\bdrizzle\b/i,
  /\bexception\b/i,
  /\bstack trace\b/i,
  /\btraceback\b/i,
  /\brelation\b.+\bdoes not exist\b/i,
  /\bcolumn\b.+\bdoes not exist\b/i,
  /\bsyntax error\b/i,
  /\bconstraint\b/i,
  /\bat\s+[A-Za-z0-9_$.<>]+\s*\(/,
];

export function containsTechnicalDetails(text?: string | null): boolean {
  if (!text) return false;
  return TECHNICAL_DETAIL_PATTERNS.some(pattern => pattern.test(text));
}

export function toUserSafeText(
  text: string | null | undefined,
  fallback: string
): string {
  const trimmed = text?.trim();
  if (!trimmed) return fallback;
  return containsTechnicalDetails(trimmed) ? fallback : trimmed;
}

export function toUserSafeGovernanceMessage(text?: string | null): string {
  return toUserSafeText(
    text,
    "The system could not complete the governance checks needed for this action."
  );
}

export function toUserSafeGovernanceDetail(text?: string | null): string {
  return toUserSafeText(
    text,
    "The system could not load the agents needed for this action."
  );
}
