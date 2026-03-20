import { Badge } from "@/components/ui/badge";
import {
  AGENT_STATUS_BADGE_CLASSES,
  AGENT_STATUS_LABELS,
  isAgentStatus,
  type AgentStatus,
} from "@shared/agent-lifecycle";

export function AgentStatusBadge({ status }: { status: string }) {
  const normalized: AgentStatus = isAgentStatus(status) ? status : "draft";

  return (
    <Badge variant="outline" className={AGENT_STATUS_BADGE_CLASSES[normalized]}>
      {AGENT_STATUS_LABELS[normalized]}
    </Badge>
  );
}
