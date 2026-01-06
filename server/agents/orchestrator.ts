/**
 * Multi-Agent Orchestration System
 * Coordinates multiple agents working together
 */

import { agentEngine, type AgentConfig, type AgentTask } from "./agent-engine";

export interface OrchestratedTask {
  id: string;
  goal: string;
  agents: string[]; // Agent IDs involved
  status: "planning" | "executing" | "completed" | "failed";
  plan: TaskPlan;
  subtasks: Map<string, AgentTask>;
  result?: any;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface TaskPlan {
  steps: PlanStep[];
  dependencies: Map<string, string[]>; // step ID -> dependent step IDs
}

export interface PlanStep {
  id: string;
  agentId: string;
  goal: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * Multi-Agent Orchestrator
 */
class MultiAgentOrchestrator {
  private orchestratedTasks: Map<string, OrchestratedTask> = new Map();
  
  /**
   * Create an orchestrated task involving multiple agents
   */
  async createOrchestratedTask(
    goal: string,
    agentIds: string[]
  ): Promise<OrchestratedTask> {
    const task: OrchestratedTask = {
      id: `orch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      goal,
      agents: agentIds,
      status: "planning",
      plan: {
        steps: [],
        dependencies: new Map(),
      },
      subtasks: new Map(),
      createdAt: Date.now(),
    };
    
    this.orchestratedTasks.set(task.id, task);
    
    // Generate execution plan
    await this.generatePlan(task);
    
    // Execute plan
    this.executePlan(task.id).catch((error) => {
      console.error(`[Orchestrator] Task ${task.id} failed:`, error);
      task.status = "failed";
      task.error = error.message;
    });
    
    return task;
  }
  
  /**
   * Generate execution plan
   */
  private async generatePlan(task: OrchestratedTask): Promise<void> {
    // In production, this would use LLM to generate optimal plan
    // For now, create simple sequential plan
    
    const steps: PlanStep[] = task.agents.map((agentId, index) => ({
      id: `step-${index + 1}`,
      agentId,
      goal: `Part ${index + 1} of: ${task.goal}`,
      dependencies: index > 0 ? [`step-${index}`] : [],
      status: "pending" as const,
    }));
    
    task.plan.steps = steps;
    
    // Build dependency map
    steps.forEach((step) => {
      task.plan.dependencies.set(step.id, step.dependencies);
    });
    
    task.status = "executing";
  }
  
  /**
   * Execute the plan
   */
  private async executePlan(taskId: string): Promise<void> {
    const task = this.orchestratedTasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    const completedSteps = new Set<string>();
    
    while (completedSteps.size < task.plan.steps.length) {
      // Find steps ready to execute (dependencies satisfied)
      const readySteps = task.plan.steps.filter(
        (step) =>
          step.status === "pending" &&
          step.dependencies.every((dep) => completedSteps.has(dep))
      );
      
      if (readySteps.length === 0) {
        // Check if all steps are completed or failed
        const allDone = task.plan.steps.every(
          (s) => s.status === "completed" || s.status === "failed"
        );
        
        if (allDone) break;
        
        // Wait for running steps to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      
      // Execute ready steps in parallel
      await Promise.all(
        readySteps.map(async (step) => {
          step.status = "running";
          
          try {
            // Create agent task
            const agentTask = await agentEngine.createTask(step.agentId, step.goal);
            task.subtasks.set(step.id, agentTask);
            
            // Wait for completion
            await this.waitForTask(agentTask.id);
            
            step.status = "completed";
            completedSteps.add(step.id);
          } catch (error) {
            console.error(`[Orchestrator] Step ${step.id} failed:`, error);
            step.status = "failed";
            throw error;
          }
        })
      );
    }
    
    // Collect results
    task.result = {
      steps: task.plan.steps.map((step) => ({
        id: step.id,
        agentId: step.agentId,
        status: step.status,
        result: task.subtasks.get(step.id)?.result,
      })),
    };
    
    task.status = "completed";
    task.completedAt = Date.now();
  }
  
  /**
   * Wait for an agent task to complete
   */
  private async waitForTask(taskId: string): Promise<void> {
    const maxWait = 60000; // 60 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const task = agentEngine.getTask(taskId);
      
      if (!task) throw new Error(`Task ${taskId} not found`);
      
      if (task.status === "completed") return;
      if (task.status === "failed") throw new Error(task.error || "Task failed");
      
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    throw new Error(`Task ${taskId} timed out`);
  }
  
  /**
   * Get orchestrated task
   */
  getTask(taskId: string): OrchestratedTask | undefined {
    return this.orchestratedTasks.get(taskId);
  }
  
  /**
   * List all orchestrated tasks
   */
  listTasks(): OrchestratedTask[] {
    return Array.from(this.orchestratedTasks.values());
  }
  
  /**
   * Cancel orchestrated task
   */
  cancelTask(taskId: string): boolean {
    const task = this.orchestratedTasks.get(taskId);
    if (!task || task.status !== "executing") return false;
    
    // Cancel all subtasks
    task.subtasks.forEach((subtask) => {
      agentEngine.cancelTask(subtask.id);
    });
    
    task.status = "failed";
    task.error = "Task cancelled by user";
    task.completedAt = Date.now();
    
    return true;
  }
  
  /**
   * Get task communication log
   */
  getCommunicationLog(taskId: string): Array<{
    timestamp: number;
    from: string;
    to: string;
    message: string;
  }> {
    const task = this.orchestratedTasks.get(taskId);
    if (!task) return [];
    
    // In production, this would track actual agent-to-agent communication
    // For now, return simulated log
    
    return [
      {
        timestamp: task.createdAt,
        from: "orchestrator",
        to: "all",
        message: `Starting orchestrated task: ${task.goal}`,
      },
      {
        timestamp: task.createdAt + 1000,
        from: task.agents[0],
        to: task.agents[1] || "orchestrator",
        message: "Completed my part, passing results to next agent",
      },
    ];
  }
}

export const multiAgentOrchestrator = new MultiAgentOrchestrator();
