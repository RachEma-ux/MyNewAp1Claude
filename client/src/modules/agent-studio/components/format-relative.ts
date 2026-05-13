// formatRelative — human-readable "Xs/Xm/Xh/Xd ago" formatter used
// across the retention panels in RetrofitPage. Originally lived inline
// at the top of RetrofitPage.tsx (~5300 lines); extracted to enable
// future panel extractions that need the helper.
//
// Outputs:
//   - null/undefined → "never"
//   - future date → ISO string (we don't try to render "X in the future")
//   - <60s          → "Ns ago"
//   - <60m          → "Nm ago"
//   - <24h          → "Nh ago"
//   - else          → "Nd ago"
//
// Source values are typically a Date object (from a server-side
// `lastRunAt`) or null. Strings are converted via `new Date(...)`.

export type FormatRelativeInput = Date | string | null | undefined;

export function formatRelative(date: FormatRelativeInput): string {
  if (!date) return "never";
  const d = new Date(date);
  const ms = Date.now() - d.getTime();
  if (ms < 0) return d.toISOString();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
