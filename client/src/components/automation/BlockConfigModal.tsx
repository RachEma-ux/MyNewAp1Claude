import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BlockConfig {
  [key: string]: string | number | boolean;
}

interface BlockConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: BlockConfig) => void;
  blockType: string;
  blockLabel: string;
  currentConfig?: BlockConfig;
}

// Configuration schemas for each block type
const blockConfigSchemas: Record<string, Array<{
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "secret";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  description?: string;
}>> = {
  "time-trigger": [
    {
      key: "schedule",
      label: "Cron Schedule",
      type: "text",
      placeholder: "0 9 * * 1-5 (Every weekday at 9 AM)",
      required: true,
      description: "Use cron syntax: minute hour day month weekday",
    },
    {
      key: "timezone",
      label: "Timezone",
      type: "select",
      options: [
        { value: "UTC", label: "UTC" },
        { value: "America/New_York", label: "America/New_York" },
        { value: "America/Los_Angeles", label: "America/Los_Angeles" },
        { value: "Europe/London", label: "Europe/London" },
        { value: "Asia/Tokyo", label: "Asia/Tokyo" },
      ],
      required: true,
    },
  ],
  "webhook-trigger": [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      placeholder: "https://example.com/webhook",
      required: true,
      description: "External URL that will trigger this workflow",
    },
    {
      key: "secret",
      label: "Webhook Secret",
      type: "text",
      placeholder: "Optional secret for validation",
      required: false,
    },
  ],
  "file-upload-trigger": [
    {
      key: "fileTypes",
      label: "Allowed File Types",
      type: "text",
      placeholder: "pdf,docx,txt,csv",
      required: true,
      description: "Comma-separated list of file extensions",
    },
    {
      key: "maxSizeMB",
      label: "Max File Size (MB)",
      type: "number",
      placeholder: "50",
      required: true,
    },
  ],
  "database-query": [
    {
      key: "query",
      label: "SQL Query",
      type: "textarea",
      placeholder: "SELECT * FROM users WHERE status = 'active'",
      required: true,
      description: "SQL query to execute",
    },
    {
      key: "database",
      label: "Database",
      type: "select",
      options: [
        { value: "default", label: "Default Database" },
        { value: "analytics", label: "Analytics Database" },
        { value: "reporting", label: "Reporting Database" },
      ],
      required: true,
    },
    {
      key: "dbPassword",
      label: "Database Password",
      type: "secret",
      required: false,
      description: "Select a stored secret or enter password manually",
    },
  ],
  "ai-processing": [
    {
      key: "prompt",
      label: "AI Prompt",
      type: "textarea",
      placeholder: "Analyze the following data and provide insights...",
      required: true,
      description: "Prompt for AI model",
    },
    {
      key: "model",
      label: "AI Model",
      type: "select",
      options: [], // Populated dynamically from unified catalog
      required: true,
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      placeholder: "0.7",
      required: false,
      description: "Creativity level (0.0 - 1.0)",
    },
  ],
  "send-email": [
    {
      key: "to",
      label: "To Email",
      type: "text",
      placeholder: "user@example.com",
      required: true,
    },
    {
      key: "subject",
      label: "Subject",
      type: "text",
      placeholder: "Workflow Notification",
      required: true,
    },
    {
      key: "body",
      label: "Email Body",
      type: "textarea",
      placeholder: "Hello, this is an automated email from your workflow...",
      required: true,
      description: "Use {{variable}} for dynamic content",
    },
  ],
  "run-code": [
    {
      key: "language",
      label: "Language",
      type: "select",
      options: [
        { value: "javascript", label: "JavaScript" },
        { value: "python", label: "Python" },
        { value: "bash", label: "Bash" },
      ],
      required: true,
    },
    {
      key: "code",
      label: "Code",
      type: "textarea",
      placeholder: "// Your code here\nconst result = data.map(item => item * 2);",
      required: true,
      description: "Code to execute",
    },
  ],
  "send-message": [
    {
      key: "channel",
      label: "Channel",
      type: "select",
      options: [
        { value: "slack", label: "Slack" },
        { value: "discord", label: "Discord" },
        { value: "teams", label: "Microsoft Teams" },
      ],
      required: true,
    },
    {
      key: "message",
      label: "Message",
      type: "textarea",
      placeholder: "Workflow completed successfully!",
      required: true,
      description: "Use {{variable}} for dynamic content",
    },
  ],
};

export function BlockConfigModal({
  isOpen,
  onClose,
  onSave,
  blockType,
  blockLabel,
  currentConfig = {},
}: BlockConfigModalProps) {
  const [config, setConfig] = useState<BlockConfig>(currentConfig);
  const { data: secrets = [] } = trpc.secrets.list.useQuery();
  const { data: catalogModels = [] } = trpc.modelDownloads.getUnifiedCatalog.useQuery({});

  // Merge static schema with dynamic catalog data for model selects
  const schema = (blockConfigSchemas[blockType] || []).map((field) => {
    if (field.key === "model" && field.type === "select" && (!field.options || field.options.length === 0)) {
      return {
        ...field,
        options: catalogModels
          .filter((m) => (m.name || "").trim() !== "")
          .map((m) => ({ value: m.name, label: m.displayName })),
      };
    }
    return field;
  });

  useEffect(() => {
    // Initialize config with current values or defaults
    const initialConfig: BlockConfig = {};
    schema.forEach((field) => {
      if (currentConfig[field.key] !== undefined) {
        initialConfig[field.key] = currentConfig[field.key];
      } else if (field.type === "number") {
        initialConfig[field.key] = 0;
      } else {
        initialConfig[field.key] = "";
      }
    });
    setConfig(initialConfig);
  }, [blockType, currentConfig]);

  const handleSave = () => {
    // Validate required fields
    const missingFields = schema
      .filter((field) => field.required && !config[field.key])
      .map((field) => field.label);

    if (missingFields.length > 0) {
      alert(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    onSave(config);
    onClose();
  };

  const renderField = (field: typeof schema[0]) => {
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            id={field.key}
            value={String(config[field.key] || "")}
            onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            rows={4}
            className="font-mono text-sm"
          />
        );
      case "number":
        return (
          <Input
            id={field.key}
            type="number"
            value={Number(config[field.key] || 0)}
            onChange={(e) => setConfig({ ...config, [field.key]: parseFloat(e.target.value) || 0 })}
            placeholder={field.placeholder}
          />
        );
      case "select":
        return (
          <Select
            value={String(config[field.key] || "")}
            onValueChange={(value) => setConfig({ ...config, [field.key]: value })}
          >
            <SelectTrigger id={field.key}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "secret":
        return (
          <div className="space-y-2">
            <Select
              value={String(config[field.key] || "")}
              onValueChange={(value) => setConfig({ ...config, [field.key]: value })}
            >
              <SelectTrigger id={field.key}>
                <SelectValue placeholder="Select a secret or enter manually" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Enter manually
                  </div>
                </SelectItem>
                {secrets.map((secret) => (
                  <SelectItem key={secret.id} value={`secret:${secret.key}`}>
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-green-500" />
                      {secret.key}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config[field.key] === "__manual__" && (
              <Input
                type="password"
                value={String(config[`${field.key}_value`] || "")}
                onChange={(e) => setConfig({ ...config, [`${field.key}_value`]: e.target.value })}
                placeholder="Enter secret value"
              />
            )}
          </div>
        );
      default:
        return (
          <Input
            id={field.key}
            type="text"
            value={String(config[field.key] || "")}
            onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
            placeholder={field.placeholder}
          />
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure {blockLabel}</DialogTitle>
          <DialogDescription>
            Set parameters for this block. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {schema.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No configuration options available for this block type.
            </p>
          ) : (
            schema.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderField(field)}
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
