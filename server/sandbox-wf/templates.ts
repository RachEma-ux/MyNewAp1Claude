/**
 * WfDB — Workflow Templates
 *
 * 10 pre-built workflow templates covering all platform pillars.
 */

export interface WfTemplateDefinition {
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  steps: { key: string; label: string; description: string; nodeType: string; config?: Record<string, any> }[];
}

export const WORKFLOW_TEMPLATES: WfTemplateDefinition[] = [
  {
    name: "Simple Approval",
    description: "3-step approval: request → approve/reject → notify stakeholders",
    category: "approval",
    icon: "check-circle",
    tags: ["Approval", "HITL", "Notification"],
    steps: [
      { key: "request", label: "Submit Request", description: "Receive approval request with metadata", nodeType: "manual_trigger" },
      { key: "approve", label: "Approval Gate", description: "Human review — approve, reject, or escalate", nodeType: "approval", config: { approvers: "manager" } },
      { key: "notify", label: "Send Notification", description: "Notify requestor of decision", nodeType: "send_email", config: { to: "{{request.email}}", subject: "Approval Decision" } },
    ],
  },
  {
    name: "Data ETL Pipeline",
    description: "Extract → Transform → Validate → Load data pipeline",
    category: "data",
    icon: "database",
    tags: ["ETL", "Transform", "Data Quality"],
    steps: [
      { key: "extract", label: "Extract Sources", description: "Pull data from configured sources", nodeType: "http_request", config: { method: "GET", url: "{{var.sourceUrl}}" } },
      { key: "transform", label: "Transform Data", description: "Apply transformation rules", nodeType: "transform", config: { expression: "normalize + dedup" } },
      { key: "validate", label: "Validate Schema", description: "Check data quality and schema conformance", nodeType: "if_else", config: { condition: "{{transform.result}}", operator: "is_not_empty" } },
      { key: "load", label: "Load to Target", description: "Insert into destination database", nodeType: "http_request", config: { method: "POST", url: "{{var.targetUrl}}" } },
    ],
  },
  {
    name: "AI Document Processing",
    description: "Upload → Extract → Classify → Store intelligent document pipeline",
    category: "ai",
    icon: "brain",
    tags: ["AI", "IDP", "RAG", "Classification"],
    steps: [
      { key: "upload", label: "Document Upload", description: "Accept document (PDF/DOCX/TXT)", nodeType: "manual_trigger" },
      { key: "extract", label: "Content Extraction", description: "OCR + text extraction + metadata parsing", nodeType: "transform", config: { expression: "extract_text({{upload.file}})" } },
      { key: "classify", label: "AI Classification", description: "Classify document type using LLM", nodeType: "llm_prompt", config: { userPrompt: "Classify this document: {{extract.result}}" } },
      { key: "store", label: "Store Results", description: "Save extracted data + classification", nodeType: "http_request", config: { method: "POST", url: "/api/documents" } },
    ],
  },
  {
    name: "Multi-Approver Chain",
    description: "Sequential multi-level approval: L1 → L2 → Execute",
    category: "approval",
    icon: "users",
    tags: ["Multi-Level", "Approval", "Chain"],
    steps: [
      { key: "request", label: "Submit Request", description: "Initial request with amount and justification", nodeType: "manual_trigger" },
      { key: "l1", label: "L1 Approval", description: "First-level manager approval", nodeType: "approval", config: { approvers: "l1-manager" } },
      { key: "check", label: "Amount Check", description: "If amount > threshold, require L2", nodeType: "if_else", config: { condition: "{{request.amount}}", operator: "greater_than", value: "10000" } },
      { key: "l2", label: "L2 Approval", description: "Second-level director approval", nodeType: "approval", config: { approvers: "director" } },
      { key: "execute", label: "Execute Action", description: "Process the approved request", nodeType: "http_request", config: { method: "POST" } },
    ],
  },
  {
    name: "Webhook Handler",
    description: "Receive → Validate → Process → Respond to incoming webhooks",
    category: "integration",
    icon: "webhook",
    tags: ["Webhook", "API", "Integration"],
    steps: [
      { key: "receive", label: "Receive Webhook", description: "Accept incoming HTTP POST payload", nodeType: "webhook_trigger" },
      { key: "validate", label: "Validate Payload", description: "Check payload schema and auth token", nodeType: "if_else", config: { condition: "{{receive.authToken}}", operator: "is_not_empty" } },
      { key: "process", label: "Process Data", description: "Transform and route webhook data", nodeType: "transform", config: { expression: "route({{receive.data}})" } },
      { key: "respond", label: "Send Response", description: "Return 200 OK with processed result", nodeType: "http_request", config: { method: "POST", url: "{{receive.callbackUrl}}" } },
    ],
  },
  {
    name: "Scheduled Report",
    description: "Cron → Query Data → Format → Email report generation",
    category: "data",
    icon: "calendar-clock",
    tags: ["Schedule", "Report", "Email", "Cron"],
    steps: [
      { key: "trigger", label: "Schedule Trigger", description: "Cron: daily at 08:00 UTC", nodeType: "schedule_trigger", config: { cron: "0 8 * * *", timezone: "UTC" } },
      { key: "query", label: "Query Data", description: "Fetch report data from database", nodeType: "http_request", config: { method: "GET", url: "/api/reports/daily" } },
      { key: "format", label: "Format Report", description: "Generate formatted HTML/PDF report", nodeType: "transform", config: { expression: "formatReport({{query.data}})" } },
      { key: "email", label: "Send Email", description: "Email report to distribution list", nodeType: "send_email", config: { to: "team@company.com", subject: "Daily Report" } },
    ],
  },
  {
    name: "Error Recovery",
    description: "Try → Catch → Retry/Alert → Escalate error handling workflow",
    category: "governance",
    icon: "shield-alert",
    tags: ["Error Handling", "Retry", "Escalation"],
    steps: [
      { key: "try", label: "Execute Task", description: "Attempt the primary operation", nodeType: "http_request", config: { method: "POST", url: "{{var.taskUrl}}", timeout: 30000 } },
      { key: "check", label: "Check Result", description: "Evaluate if task succeeded", nodeType: "if_else", config: { condition: "{{try.status}}", operator: "equals", value: "200" } },
      { key: "retry", label: "Retry (3x)", description: "Retry with exponential backoff", nodeType: "delay", config: { delayMs: 2000 } },
      { key: "alert", label: "Send Alert", description: "Notify ops team of failure", nodeType: "send_email", config: { to: "ops@company.com", subject: "Task Failed" } },
      { key: "escalate", label: "Escalate", description: "Create incident ticket", nodeType: "http_request", config: { method: "POST", url: "/api/incidents" } },
    ],
  },
  {
    name: "Integration Sync",
    description: "Poll → Compare → Update → Log bidirectional system sync",
    category: "integration",
    icon: "refresh-cw",
    tags: ["Sync", "Integration", "Bidirectional"],
    steps: [
      { key: "poll", label: "Poll Source", description: "Fetch latest records from source system", nodeType: "http_request", config: { method: "GET", url: "{{var.sourceApi}}/changes" } },
      { key: "compare", label: "Compare Records", description: "Diff source vs target to find deltas", nodeType: "transform", config: { expression: "diff({{poll.data}}, localCache)" } },
      { key: "update", label: "Update Target", description: "Apply deltas to target system", nodeType: "http_request", config: { method: "PATCH", url: "{{var.targetApi}}/sync" } },
      { key: "log", label: "Audit Log", description: "Record sync results for compliance", nodeType: "log_message", config: { logMessage: "Synced {{compare.result}} records" } },
    ],
  },
  {
    name: "Policy Compliance Check",
    description: "Gather → Evaluate → Score → Report compliance assessment",
    category: "governance",
    icon: "shield-check",
    tags: ["Compliance", "Policy", "Audit", "Scoring"],
    steps: [
      { key: "gather", label: "Gather Evidence", description: "Collect data points for compliance check", nodeType: "http_request", config: { method: "GET", url: "/api/governance/evidence" } },
      { key: "evaluate", label: "Evaluate Rules", description: "Run policy rules against evidence", nodeType: "transform", config: { expression: "evaluateRules({{gather.data}})" } },
      { key: "score", label: "Calculate Score", description: "Generate compliance score (0-100)", nodeType: "transform", config: { expression: "score({{evaluate.result}})" } },
      { key: "report", label: "Generate Report", description: "Produce compliance report with pass/fail", nodeType: "log_message", config: { logMessage: "Compliance score: {{score.result}}" } },
    ],
  },
  {
    name: "Human-in-the-Loop AI",
    description: "AI Suggest → Human Review → Approve/Modify → Apply decisions",
    category: "ai",
    icon: "brain",
    tags: ["AI", "HITL", "Review", "Decision"],
    steps: [
      { key: "analyze", label: "AI Analysis", description: "AI analyzes input and generates suggestion", nodeType: "llm_prompt", config: { userPrompt: "Analyze and suggest action for: {{var.input}}" } },
      { key: "review", label: "Human Review", description: "Human reviews AI suggestion and approves/modifies", nodeType: "approval", config: { approvers: "domain-expert" } },
      { key: "check", label: "Was Modified?", description: "Check if human modified the AI suggestion", nodeType: "if_else", config: { condition: "{{review.modified}}", operator: "equals", value: "true" } },
      { key: "apply", label: "Apply Decision", description: "Execute the approved/modified decision", nodeType: "http_request", config: { method: "POST", url: "/api/decisions/apply" } },
      { key: "learn", label: "Feedback Loop", description: "Feed human corrections back to improve AI", nodeType: "log_message", config: { logMessage: "Decision applied. Modified: {{check.result}}" } },
    ],
  },
];
