export function detectWorkspaceDrift(snapshot: any, current: any) {
  if (JSON.stringify(snapshot.moduleState) !== JSON.stringify(current.moduleState)) {
    return { drift: true, type: "moduleDrift" };
  }
  return { drift: false };
}
