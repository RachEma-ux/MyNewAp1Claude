/**
 * Automation Engine
 * Manages automated workflows with triggers
 */

export type TriggerType = "time" | "event" | "webhook";

export interface AutomationTrigger {
  type: TriggerType;
  config: TimeTriggerConfig | EventTriggerConfig | WebhookTriggerConfig;
}

export interface TimeTriggerConfig {
  schedule: string; // Cron expression
  timezone?: string;
}

export interface EventTriggerConfig {
  eventType: string;
  filters?: Record<string, any>;
}

export interface WebhookTriggerConfig {
  url: string;
  secret?: string;
}

export interface AutomationAction {
  type: string;
  config: Record<string, any>;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
  logs: string[];
}

/**
 * Automation Engine
 */
class AutomationEngine {
  private automations: Map<string, Automation> = new Map();
  private runs: Map<string, AutomationRun> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Create automation
   */
  createAutomation(
    name: string,
    description: string,
    trigger: AutomationTrigger,
    actions: AutomationAction[]
  ): Automation {
    const automation: Automation = {
      id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      enabled: true,
      trigger,
      actions,
      runCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.automations.set(automation.id, automation);
    
    // Schedule if time-based
    if (trigger.type === "time") {
      this.scheduleAutomation(automation);
    }
    
    console.log(`[Automation] Created: ${automation.name}`);
    
    return automation;
  }
  
  /**
   * Schedule time-based automation
   */
  private scheduleAutomation(automation: Automation): void {
    if (automation.trigger.type !== "time") return;
    
    const config = automation.trigger.config as TimeTriggerConfig;
    
    // In production, this would use proper cron scheduling
    // For now, simulate with simple interval
    const interval = 60000; // 1 minute
    
    const timer = setInterval(() => {
      if (automation.enabled) {
        this.executeAutomation(automation.id);
      }
    }, interval);
    
    this.timers.set(automation.id, timer);
    
    // Calculate next run
    automation.nextRun = Date.now() + interval;
  }
  
  /**
   * Execute automation
   */
  async executeAutomation(automationId: string): Promise<AutomationRun> {
    const automation = this.automations.get(automationId);
    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }
    
    const run: AutomationRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      automationId,
      status: "running",
      startedAt: Date.now(),
      logs: [],
    };
    
    this.runs.set(run.id, run);
    
    run.logs.push(`[${new Date().toISOString()}] Starting automation: ${automation.name}`);
    
    try {
      // Execute actions sequentially
      for (const action of automation.actions) {
        run.logs.push(`[${new Date().toISOString()}] Executing action: ${action.type}`);
        
        const result = await this.executeAction(action);
        
        run.logs.push(`[${new Date().toISOString()}] Action completed: ${JSON.stringify(result)}`);
      }
      
      run.status = "completed";
      run.completedAt = Date.now();
      run.result = { success: true };
      
      // Update automation stats
      automation.lastRun = Date.now();
      automation.runCount++;
      
      run.logs.push(`[${new Date().toISOString()}] Automation completed successfully`);
    } catch (error) {
      run.status = "failed";
      run.completedAt = Date.now();
      run.error = error instanceof Error ? error.message : "Unknown error";
      
      run.logs.push(`[${new Date().toISOString()}] Automation failed: ${run.error}`);
    }
    
    return run;
  }
  
  /**
   * Execute a single action
   */
  private async executeAction(action: AutomationAction): Promise<any> {
    // Simulate action execution
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    switch (action.type) {
      case "send_email":
        return { sent: true, to: action.config.to };
      
      case "create_task":
        return { taskId: `task-${Date.now()}` };
      
      case "call_webhook":
        return { status: 200, response: "OK" };
      
      case "run_agent":
        return { agentId: action.config.agentId, taskId: `task-${Date.now()}` };
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  /**
   * Trigger event-based automation
   */
  async triggerEvent(eventType: string, data: Record<string, any>): Promise<void> {
    const eventAutomations = Array.from(this.automations.values()).filter(
      (auto) =>
        auto.enabled &&
        auto.trigger.type === "event" &&
        (auto.trigger.config as EventTriggerConfig).eventType === eventType
    );
    
    for (const automation of eventAutomations) {
      await this.executeAutomation(automation.id);
    }
  }
  
  /**
   * Handle webhook trigger
   */
  async handleWebhook(automationId: string, payload: any): Promise<AutomationRun> {
    const automation = this.automations.get(automationId);
    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }
    
    if (automation.trigger.type !== "webhook") {
      throw new Error(`Automation ${automationId} is not webhook-triggered`);
    }
    
    // Validate webhook secret if configured
    const config = automation.trigger.config as WebhookTriggerConfig;
    // In production, validate signature/secret
    
    return this.executeAutomation(automationId);
  }
  
  /**
   * Get automation
   */
  getAutomation(automationId: string): Automation | undefined {
    return this.automations.get(automationId);
  }
  
  /**
   * List automations
   */
  listAutomations(): Automation[] {
    return Array.from(this.automations.values());
  }
  
  /**
   * Update automation
   */
  updateAutomation(
    automationId: string,
    updates: Partial<Pick<Automation, "name" | "description" | "enabled" | "trigger" | "actions">>
  ): Automation | null {
    const automation = this.automations.get(automationId);
    if (!automation) return null;
    
    Object.assign(automation, updates);
    automation.updatedAt = Date.now();
    
    // Reschedule if trigger changed
    if (updates.trigger && automation.trigger.type === "time") {
      const existingTimer = this.timers.get(automationId);
      if (existingTimer) {
        clearInterval(existingTimer);
      }
      this.scheduleAutomation(automation);
    }
    
    return automation;
  }
  
  /**
   * Delete automation
   */
  deleteAutomation(automationId: string): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) return false;
    
    // Clear timer if exists
    const timer = this.timers.get(automationId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(automationId);
    }
    
    this.automations.delete(automationId);
    
    return true;
  }
  
  /**
   * Get automation runs
   */
  getRuns(automationId?: string): AutomationRun[] {
    const runs = Array.from(this.runs.values());
    return automationId ? runs.filter((r) => r.automationId === automationId) : runs;
  }
  
  /**
   * Get run details
   */
  getRun(runId: string): AutomationRun | undefined {
    return this.runs.get(runId);
  }
}

export const automationEngine = new AutomationEngine();

// Create example automations
automationEngine.createAutomation(
  "Daily Report",
  "Generate and send daily activity report",
  {
    type: "time",
    config: {
      schedule: "0 0 9 * * *", // 9 AM daily
      timezone: "UTC",
    },
  },
  [
    {
      type: "run_agent",
      config: { agentId: "data-agent", goal: "Generate daily report" },
    },
    {
      type: "send_email",
      config: { to: "admin@example.com", subject: "Daily Report" },
    },
  ]
);

automationEngine.createAutomation(
  "New Document Alert",
  "Notify when new document is uploaded",
  {
    type: "event",
    config: {
      eventType: "document.uploaded",
    },
  },
  [
    {
      type: "send_email",
      config: { to: "team@example.com", subject: "New Document" },
    },
  ]
);
