export function enforceModelAccess(workspace: any, model: string) {
  if (!workspace.allowedModels.includes(model)) {
    throw new Error("Model not allowed by tier");
  }
}
