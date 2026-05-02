/**
 * AI Agent Studio — Shared Error Callout
 *
 * Replaces inline `<p className="text-red-400">` error rendering with a
 * panel that frames the error clearly without being noisy.
 */
import { AlertOctagon } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  title?: string;
  message: string;
  action?: ReactNode;
}

export default function ErrorCallout({
  title = "Something went wrong",
  message,
  action,
}: Props) {
  return (
    <div className="border border-red-500/30 bg-red-500/5 rounded p-3 flex items-start gap-2">
      <AlertOctagon className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-red-300">{title}</p>
        <p className="text-[10px] text-red-200/80 mt-0.5 break-words">{message}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
