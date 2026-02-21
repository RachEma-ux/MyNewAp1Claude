import { Router } from "express";
import { storagePut } from "./storage";
import multer from "multer";
import { nanoid } from "nanoid";
import { sdk } from "./_core/sdk";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

router.post("/upload-document", upload.single("file"), async (req, res) => {
  // Authentication check
  if (process.env.DEV_MODE !== "true" || process.env.NODE_ENV === "production") {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const workspaceId = req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID required" });
    }

    // Generate unique file key
    const fileExtension = req.file.originalname.split(".").pop();
    const fileKey = `workspace-${workspaceId}/documents/${nanoid()}.${fileExtension}`;

    // Upload to S3
    const result = await storagePut(
      fileKey,
      req.file.buffer,
      req.file.mimetype
    );

    res.json({
      success: true,
      url: result.url,
      key: result.key,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
