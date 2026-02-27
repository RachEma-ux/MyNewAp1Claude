/**
 * PMT AI Services — AI-powered project management assistance
 * Stub implementations with realistic mock data.
 * Replace with actual LLM calls when provider is configured.
 */

export async function suggestTasks(projectDescription: string): Promise<Array<{title: string; description: string; type: string; priority: string; estimatedHours: number}>> {
  const keywords = projectDescription.toLowerCase();
  const tasks = [];

  tasks.push({ title: "Define project scope and requirements", description: "Document detailed requirements based on project description", type: "task", priority: "high", estimatedHours: 8 });
  tasks.push({ title: "Create project architecture", description: "Design the technical architecture and component structure", type: "task", priority: "high", estimatedHours: 16 });
  tasks.push({ title: "Set up development environment", description: "Configure build tools, CI/CD, and development workflows", type: "task", priority: "medium", estimatedHours: 4 });
  tasks.push({ title: "Implement core functionality", description: "Build the primary features described in the project scope", type: "feature", priority: "high", estimatedHours: 40 });
  tasks.push({ title: "Write tests", description: "Create unit and integration tests for all components", type: "task", priority: "medium", estimatedHours: 16 });
  tasks.push({ title: "Documentation", description: "Write user and developer documentation", type: "task", priority: "low", estimatedHours: 8 });

  if (keywords.includes("api") || keywords.includes("backend")) {
    tasks.push({ title: "Design API endpoints", description: "Define REST/GraphQL API schema and contracts", type: "task", priority: "high", estimatedHours: 8 });
  }
  if (keywords.includes("ui") || keywords.includes("frontend") || keywords.includes("interface")) {
    tasks.push({ title: "Create UI mockups", description: "Design wireframes and UI prototypes", type: "task", priority: "high", estimatedHours: 12 });
  }
  if (keywords.includes("database") || keywords.includes("data")) {
    tasks.push({ title: "Design database schema", description: "Create entity-relationship diagram and migration plan", type: "task", priority: "high", estimatedHours: 8 });
  }
  if (keywords.includes("deploy") || keywords.includes("production")) {
    tasks.push({ title: "Deployment planning", description: "Plan production deployment strategy and infrastructure", type: "task", priority: "medium", estimatedHours: 8 });
  }

  return tasks;
}

export async function triageWorkItem(title: string, description: string): Promise<{type: string; priority: string; labels: string[]; confidence: number}> {
  const text = (title + " " + (description || "")).toLowerCase();

  let type = "task";
  let priority = "medium";
  const labels: string[] = [];
  let confidence = 0.75;

  // Type detection
  if (text.includes("bug") || text.includes("fix") || text.includes("broken") || text.includes("error") || text.includes("crash")) {
    type = "bug";
    labels.push("defect");
    confidence = 0.85;
  } else if (text.includes("feature") || text.includes("add") || text.includes("new") || text.includes("implement")) {
    type = "feature";
    labels.push("enhancement");
    confidence = 0.80;
  } else if (text.includes("improve") || text.includes("refactor") || text.includes("optimize") || text.includes("clean")) {
    type = "improvement";
    labels.push("tech-debt");
    confidence = 0.78;
  }

  // Priority detection
  if (text.includes("critical") || text.includes("urgent") || text.includes("crash") || text.includes("security")) {
    priority = "critical";
    confidence = Math.min(confidence + 0.1, 0.95);
  } else if (text.includes("important") || text.includes("high") || text.includes("blocker")) {
    priority = "high";
  } else if (text.includes("minor") || text.includes("nice to have") || text.includes("cosmetic")) {
    priority = "low";
  }

  return { type, priority, labels, confidence };
}

export async function generateStatusReport(sprintData: { name: string; totalTasks: number; doneTasks: number; inProgressTasks: number; blockedTasks: number }): Promise<string> {
  const completionPct = sprintData.totalTasks > 0 ? Math.round((sprintData.doneTasks / sprintData.totalTasks) * 100) : 0;
  const remaining = sprintData.totalTasks - sprintData.doneTasks;

  let status = "on track";
  if (completionPct < 30) status = "at risk — behind schedule";
  else if (completionPct > 80) status = "ahead of schedule";

  let report = `## Sprint Report: ${sprintData.name}\n\n`;
  report += `**Status:** ${status}\n\n`;
  report += `### Progress Summary\n`;
  report += `- **Completion:** ${completionPct}% (${sprintData.doneTasks}/${sprintData.totalTasks} tasks)\n`;
  report += `- **In Progress:** ${sprintData.inProgressTasks} tasks actively being worked on\n`;
  report += `- **Remaining:** ${remaining} tasks to complete\n`;
  if (sprintData.blockedTasks > 0) {
    report += `- **Blocked:** ${sprintData.blockedTasks} tasks need attention\n`;
  }
  report += `\n### Recommendations\n`;
  if (sprintData.blockedTasks > 0) {
    report += `- Prioritize unblocking the ${sprintData.blockedTasks} blocked task(s)\n`;
  }
  if (completionPct < 50) {
    report += `- Consider reducing sprint scope or adding resources\n`;
  }
  if (completionPct > 80) {
    report += `- Team is performing well — consider pulling in additional items\n`;
  }

  return report;
}

export async function suggestWorkloadBalance(assigneeWorkloads: Array<{assigneeId: number; name: string; taskCount: number; totalHours: number}>): Promise<{overloaded: string[]; underloaded: string[]; suggestions: string[]}> {
  if (assigneeWorkloads.length === 0) {
    return { overloaded: [], underloaded: [], suggestions: ["No assignees found — assign tasks to team members first"] };
  }

  const avgHours = assigneeWorkloads.reduce((sum, a) => sum + a.totalHours, 0) / assigneeWorkloads.length;
  const overloaded = assigneeWorkloads.filter(a => a.totalHours > avgHours * 1.5).map(a => a.name);
  const underloaded = assigneeWorkloads.filter(a => a.totalHours < avgHours * 0.5).map(a => a.name);

  const suggestions: string[] = [];
  if (overloaded.length > 0 && underloaded.length > 0) {
    suggestions.push(`Consider moving tasks from ${overloaded.join(", ")} to ${underloaded.join(", ")}`);
  }
  if (overloaded.length > 0) {
    suggestions.push(`${overloaded.join(", ")} may need task reprioritization or deadline extensions`);
  }
  if (underloaded.length > 0) {
    suggestions.push(`${underloaded.join(", ")} have capacity for additional work`);
  }
  if (suggestions.length === 0) {
    suggestions.push("Workload is well balanced across the team");
  }

  return { overloaded, underloaded, suggestions };
}
