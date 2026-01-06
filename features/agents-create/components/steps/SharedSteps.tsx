/**
 * Shared Wizard Step Components
 * 
 * Core step components used across all creation modes
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Lock, AlertTriangle } from "lucide-react";

interface StepProps {
  data: any;
  updateData: (updates: any) => void;
  policyContext?: any;
}

// ============================================================================
// IDENTITY STEP
// ============================================================================

export function IdentityStep({ data, updateData, policyContext }: StepProps) {
  const isLocked = (field: string) => {
    return policyContext?.lockedFields?.includes(field);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Agent Identity</h2>
        <p className="text-muted-foreground">
          Give your agent a name and description
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name">
            Agent Name *
            {isLocked("identity.name") && <Lock className="inline w-4 h-4 ml-2" />}
          </Label>
          <Input
            id="name"
            value={data.identity?.name || ""}
            onChange={(e) => updateData({ identity: { ...data.identity, name: e.target.value } })}
            placeholder="e.g., Customer Support Agent"
            disabled={isLocked("identity.name")}
            required
          />
        </div>

        <div>
          <Label htmlFor="description">
            Description *
            {isLocked("identity.description") && <Lock className="inline w-4 h-4 ml-2" />}
          </Label>
          <Textarea
            id="description"
            value={data.identity?.description || ""}
            onChange={(e) => updateData({ identity: { ...data.identity, description: e.target.value } })}
            placeholder="Describe what this agent does..."
            rows={4}
            disabled={isLocked("identity.description")}
            required
          />
        </div>

        <div>
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={data.identity?.tags?.join(", ") || ""}
            onChange={(e) => {
              const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
              updateData({ identity: { ...data.identity, tags } });
            }}
            placeholder="e.g., support, customer-facing, production"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROLE STEP
// ============================================================================

export function RoleStep({ data, updateData }: StepProps) {
  const roleClasses = [
    { value: "assistant", label: "Assistant", description: "General-purpose assistant for various tasks" },
    { value: "analyst", label: "Analyst", description: "Data analysis and insights generation" },
    { value: "support", label: "Support", description: "Customer support and help desk" },
    { value: "reviewer", label: "Reviewer", description: "Code and content review" },
    { value: "automator", label: "Automator", description: "Task automation and workflow execution" },
    { value: "monitor", label: "Monitor", description: "System monitoring and alerting" },
    { value: "custom", label: "Custom", description: "Custom role definition" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Agent Role</h2>
        <p className="text-muted-foreground">
          Select the primary role for this agent
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roleClasses.map((role) => (
          <Card
            key={role.value}
            className={`p-4 cursor-pointer transition-colors ${
              data.identity?.roleClass === role.value
                ? "border-primary bg-primary/5"
                : "hover:border-primary/50"
            }`}
            onClick={() => updateData({ identity: { ...data.identity, roleClass: role.value } })}
          >
            <div className="font-semibold mb-1">{role.label}</div>
            <div className="text-sm text-muted-foreground">{role.description}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// LLM STEP
// ============================================================================

export function LLMStep({ data, updateData, policyContext }: StepProps) {
  const isLocked = (field: string) => {
    return policyContext?.lockedFields?.includes(field);
  };

  const maxTemperature = policyContext?.maxTemperature || 2.0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">LLM Configuration</h2>
        <p className="text-muted-foreground">
          Configure the language model and parameters
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="provider">Provider *</Label>
          <Select
            value={data.anatomy?.llm?.provider || ""}
            onValueChange={(value) =>
              updateData({
                anatomy: {
                  ...data.anatomy,
                  llm: { ...data.anatomy?.llm, provider: value },
                },
              })
            }
            disabled={isLocked("anatomy.llm.provider")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="model">Model *</Label>
          <Select
            value={data.anatomy?.llm?.model || ""}
            onValueChange={(value) =>
              updateData({
                anatomy: {
                  ...data.anatomy,
                  llm: { ...data.anatomy?.llm, model: value },
                },
              })
            }
            disabled={isLocked("anatomy.llm.model")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4">GPT-4</SelectItem>
              <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
              <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
              <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
              <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="temperature">
            Temperature: {data.anatomy?.llm?.temperature || 0.7}
            {isLocked("anatomy.llm.temperature") && <Lock className="inline w-4 h-4 ml-2" />}
          </Label>
          {maxTemperature < 2.0 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-4 h-4" />
              Policy limits temperature to {maxTemperature}
            </p>
          )}
          <Slider
            value={[data.anatomy?.llm?.temperature || 0.7]}
            onValueChange={([value]) =>
              updateData({
                anatomy: {
                  ...data.anatomy,
                  llm: { ...data.anatomy?.llm, temperature: value },
                },
              })
            }
            min={0}
            max={maxTemperature}
            step={0.1}
            disabled={isLocked("anatomy.llm.temperature")}
          />
        </div>

        <div>
          <Label htmlFor="systemPrompt">System Prompt *</Label>
          <Textarea
            id="systemPrompt"
            value={data.anatomy?.systemPrompt || ""}
            onChange={(e) =>
              updateData({
                anatomy: { ...data.anatomy, systemPrompt: e.target.value },
              })
            }
            placeholder="You are a helpful assistant that..."
            rows={8}
            disabled={isLocked("anatomy.systemPrompt")}
            required
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CAPABILITIES STEP
// ============================================================================

export function CapabilitiesStep({ data, updateData, policyContext }: StepProps) {
  const availableTools = [
    { id: "web_search", name: "Web Search", description: "Search the web for information" },
    { id: "calculator", name: "Calculator", description: "Perform calculations" },
    { id: "file_read", name: "File Read", description: "Read files from storage" },
    { id: "file_write", name: "File Write", description: "Write files to storage" },
    { id: "database_query", name: "Database Query", description: "Query databases" },
    { id: "api_call", name: "API Call", description: "Make external API calls" },
  ];

  const isLocked = (field: string) => {
    return policyContext?.lockedFields?.includes(field);
  };

  const toggleTool = (toolId: string) => {
    const currentTools = data.anatomy?.capabilities?.tools || [];
    const newTools = currentTools.includes(toolId)
      ? currentTools.filter((t: string) => t !== toolId)
      : [...currentTools, toolId];

    updateData({
      anatomy: {
        ...data.anatomy,
        capabilities: { ...data.anatomy?.capabilities, tools: newTools },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Agent Capabilities</h2>
        <p className="text-muted-foreground">
          Select tools and permissions for this agent
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="mb-3 block">Tools</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableTools.map((tool) => (
              <Card
                key={tool.id}
                className={`p-3 cursor-pointer transition-colors ${
                  data.anatomy?.capabilities?.tools?.includes(tool.id)
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                onClick={() => toggleTool(tool.id)}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={data.anatomy?.capabilities?.tools?.includes(tool.id)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-sm text-muted-foreground">{tool.description}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="allowExternalWrite"
              checked={data.anatomy?.capabilities?.allowExternalWrite || false}
              onCheckedChange={(checked) =>
                updateData({
                  anatomy: {
                    ...data.anatomy,
                    capabilities: {
                      ...data.anatomy?.capabilities,
                      allowExternalWrite: checked,
                    },
                  },
                })
              }
              disabled={isLocked("anatomy.capabilities.allowExternalWrite")}
            />
            <Label htmlFor="allowExternalWrite" className="flex items-center gap-2">
              Allow External Write Access
              {isLocked("anatomy.capabilities.allowExternalWrite") && (
                <Lock className="w-4 h-4" />
              )}
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="allowDataAccess"
              checked={data.anatomy?.capabilities?.allowDataAccess || false}
              onCheckedChange={(checked) =>
                updateData({
                  anatomy: {
                    ...data.anatomy,
                    capabilities: {
                      ...data.anatomy?.capabilities,
                      allowDataAccess: checked,
                    },
                  },
                })
              }
            />
            <Label htmlFor="allowDataAccess">Allow Data Access</Label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LIMITS STEP
// ============================================================================

export function LimitsStep({ data, updateData, policyContext }: StepProps) {
  const isLocked = (field: string) => {
    return policyContext?.lockedFields?.includes(field);
  };

  const maxCostPerDay = policyContext?.maxCostPerDay || 1000;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Limits & Constraints</h2>
        <p className="text-muted-foreground">
          Set rate limits, cost limits, and expiry
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxRequestsPerMinute">Max Requests/Minute</Label>
            <Input
              id="maxRequestsPerMinute"
              type="number"
              value={data.limits?.maxRequestsPerMinute || ""}
              onChange={(e) =>
                updateData({
                  limits: {
                    ...data.limits,
                    maxRequestsPerMinute: parseInt(e.target.value) || undefined,
                  },
                })
              }
              placeholder="e.g., 60"
            />
          </div>

          <div>
            <Label htmlFor="maxRequestsPerDay">Max Requests/Day</Label>
            <Input
              id="maxRequestsPerDay"
              type="number"
              value={data.limits?.maxRequestsPerDay || ""}
              onChange={(e) =>
                updateData({
                  limits: {
                    ...data.limits,
                    maxRequestsPerDay: parseInt(e.target.value) || undefined,
                  },
                })
              }
              placeholder="e.g., 10000"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxCostPerRequest">
              Max Cost/Request ($)
              {isLocked("limits.maxCostPerRequest") && <Lock className="inline w-4 h-4 ml-2" />}
            </Label>
            <Input
              id="maxCostPerRequest"
              type="number"
              step="0.01"
              value={data.limits?.maxCostPerRequest || ""}
              onChange={(e) =>
                updateData({
                  limits: {
                    ...data.limits,
                    maxCostPerRequest: parseFloat(e.target.value) || undefined,
                  },
                })
              }
              placeholder="e.g., 1.00"
              disabled={isLocked("limits.maxCostPerRequest")}
            />
          </div>

          <div>
            <Label htmlFor="maxCostPerDay">
              Max Cost/Day ($)
              {isLocked("limits.maxCostPerDay") && <Lock className="inline w-4 h-4 ml-2" />}
            </Label>
            {data.limits?.maxCostPerDay > maxCostPerDay && (
              <p className="text-sm text-yellow-600 flex items-center gap-1 mb-1">
                <AlertTriangle className="w-4 h-4" />
                Policy limits daily cost to ${maxCostPerDay}
              </p>
            )}
            <Input
              id="maxCostPerDay"
              type="number"
              step="0.01"
              value={data.limits?.maxCostPerDay || ""}
              onChange={(e) =>
                updateData({
                  limits: {
                    ...data.limits,
                    maxCostPerDay: parseFloat(e.target.value) || undefined,
                  },
                })
              }
              placeholder={`e.g., ${maxCostPerDay}`}
              disabled={isLocked("limits.maxCostPerDay")}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="expiresAt">Expiry Date (optional)</Label>
          <Input
            id="expiresAt"
            type="datetime-local"
            value={data.limits?.expiresAt?.slice(0, 16) || ""}
            onChange={(e) =>
              updateData({
                limits: {
                  ...data.limits,
                  expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                },
              })
            }
          />
          <p className="text-sm text-muted-foreground mt-1">
            Agent will be automatically disabled after this date
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// REVIEW STEP
// ============================================================================

export function ReviewStep({ data }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Review & Submit</h2>
        <p className="text-muted-foreground">
          Review your agent configuration before creating
        </p>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Identity</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Name:</span> {data.identity?.name}</div>
            <div><span className="text-muted-foreground">Description:</span> {data.identity?.description}</div>
            <div><span className="text-muted-foreground">Role:</span> {data.identity?.roleClass}</div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2">LLM Configuration</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Provider:</span> {data.anatomy?.llm?.provider}</div>
            <div><span className="text-muted-foreground">Model:</span> {data.anatomy?.llm?.model}</div>
            <div><span className="text-muted-foreground">Temperature:</span> {data.anatomy?.llm?.temperature}</div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2">Capabilities</h3>
          <div className="flex flex-wrap gap-2">
            {data.anatomy?.capabilities?.tools?.map((tool: string) => (
              <Badge key={tool} variant="secondary">{tool}</Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2">Limits</h3>
          <div className="space-y-1 text-sm">
            {data.limits?.maxCostPerDay && (
              <div><span className="text-muted-foreground">Max Cost/Day:</span> ${data.limits.maxCostPerDay}</div>
            )}
            {data.limits?.expiresAt && (
              <div><span className="text-muted-foreground">Expires:</span> {new Date(data.limits.expiresAt).toLocaleString()}</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
