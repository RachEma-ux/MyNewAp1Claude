import { Request, Response, NextFunction } from "express";

export function freezeMiddleware(req: Request, res: Response, next: NextFunction) {
  const workspace = (req as any).workspace;

  if (!workspace) return next();

  if (workspace.status === "frozen") {
    return res.status(403).json({ error: "Workspace frozen" });
  }

  next();
}
