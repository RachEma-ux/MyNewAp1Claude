import { Router } from "express";
import { storagePut } from "./storage";
import multer from "multer";
import { nanoid } from "nanoid";
import { sdk } from "./_core/sdk";

const router = Router();

// Allowed file types for document uploads
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".txt", ".md", ".csv", ".json", ".docx", ".xlsx",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = "." + (file.originalname.split(".").pop() || "").toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext}). Allowed types: PDF, TXT, MD, CSV, JSON, DOCX, XLSX, PNG, JPG, GIF, SVG, WEBP.`));
    }
  },
});

router.post("/upload-document", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message?.startsWith("File type not allowed")) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large. Maximum size is 50MB." });
        return;
      }
      res.status(400).json({ error: err.message || "Upload error" });
      return;
    }
    next();
  });
}, async (req, res) => {
  // Authentication check
  if (process.env.DEV_MODE !== "true") {
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
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const workspaceId = req.body.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace ID required" });
      return;
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
