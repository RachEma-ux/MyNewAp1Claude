export function enforceBudget(workspace: any, cost: number) {
  if (workspace.budgetUsed + cost > workspace.budgetLimit) {
    throw new Error("Budget exceeded");
  }
}
