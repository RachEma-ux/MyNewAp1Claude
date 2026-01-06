/**
 * Agent Editor Page
 * 
 * Create or edit an agent with full configuration options.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Breadcrumb } from '@/components/Breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocation } from 'wouter';
import { ArrowLeft, Save } from 'lucide-react';

const ROLE_CLASSES = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'support', label: 'Support' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'automator', label: 'Automator' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'custom', label: 'Custom' },
];

const MODELS = [
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3', label: 'Claude 3' },
];

const AVAILABLE_TOOLS = [
  'web_search',
  'code_execution',
  'file_operations',
  'database_query',
  'api_call',
  'email_send',
];

interface AgentFormData {
  name: string;
  description: string;
  roleClass: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools: string[];
}

export function AgentEditor({ agentId }: { agentId?: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    roleClass: 'assistant',
    systemPrompt: '',
    modelId: 'gpt-4',
    temperature: 0.7,
    hasDocumentAccess: false,
    hasToolAccess: false,
    allowedTools: [],
  });

  // Fetch agent if editing
  const { data: agent, isLoading: isLoadingAgent } = trpc.agents.get.useQuery(
    agentId ? { id: parseInt(agentId) } : null,
    { enabled: !!agentId }
  );

  // Mutations
  const createAgentMutation = trpc.agents.create.useMutation();
  const updateAgentMutation = trpc.agents.update.useMutation();
  const promoteAgentMutation = trpc.agents.promote.useMutation();

  // Load agent data when fetched
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description || '',
        roleClass: agent.roleClass,
        systemPrompt: agent.systemPrompt,
        modelId: agent.modelId,
        temperature: agent.temperature ? parseFloat(agent.temperature) : 0.7,
        hasDocumentAccess: agent.hasDocumentAccess || false,
        hasToolAccess: agent.hasToolAccess || false,
        allowedTools: Array.isArray(agent.allowedTools) ? agent.allowedTools : [],
      });
    }
  }, [agent]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'temperature' ? parseFloat(value) : value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleToolToggle = (tool: string) => {
    setFormData(prev => ({
      ...prev,
      allowedTools: prev.allowedTools.includes(tool)
        ? prev.allowedTools.filter(t => t !== tool)
        : [...prev.allowedTools, tool],
    }));
  };

  const handleSave = async () => {
    try {
      if (agentId) {
        await updateAgentMutation.mutateAsync({
          id: parseInt(agentId),
          ...formData,
        });
      } else {
        await createAgentMutation.mutateAsync({
          ...formData,
          roleClass: formData.roleClass as any,
        });
      }
      navigate('/governance/agents');
    } catch (error) {
      console.error('Failed to save agent:', error);
    }
  };

  const handlePromote = async () => {
    if (!agentId) return;
    try {
      await promoteAgentMutation.mutateAsync({
        id: parseInt(agentId),
      });
      navigate('/governance/agents');
    } catch (error) {
      console.error('Failed to promote agent:', error);
    }
  };

  if (isLoadingAgent) {
    return <div className="container mx-auto py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Governance', href: '/governance' },
          { label: 'Agents', href: '/governance/agents' },
          { label: agentId ? 'Edit' : 'Create', current: true },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/agents')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            {agentId ? 'Edit Agent' : 'Create Agent'}
          </h1>
          <p className="text-gray-600 mt-2">
            {agentId ? 'Update agent configuration' : 'Set up a new AI agent'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="grid gap-6 max-w-2xl">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Name and description of the agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Agent Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Data Analyst"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="What does this agent do?"
              />
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Agent role and model settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="roleClass">Role Class *</Label>
              <Select value={formData.roleClass} onValueChange={(v) => handleSelectChange('roleClass', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_CLASSES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="modelId">Model *</Label>
              <Select value={formData.modelId} onValueChange={(v) => handleSelectChange('modelId', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="temperature">
                Temperature: {formData.temperature.toFixed(2)}
              </Label>
              <input
                id="temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  temperature: parseFloat(e.target.value),
                }))}
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Lower = more deterministic, Higher = more creative
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Prompt */}
        <Card>
          <CardHeader>
            <CardTitle>System Prompt</CardTitle>
            <CardDescription>Instructions for the agent</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              name="systemPrompt"
              value={formData.systemPrompt}
              onChange={handleInputChange}
              placeholder="You are a helpful assistant..."
              rows={6}
            />
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card>
          <CardHeader>
            <CardTitle>Access Control</CardTitle>
            <CardDescription>What resources can this agent access?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="hasDocumentAccess"
                checked={formData.hasDocumentAccess}
                onCheckedChange={(checked) => handleCheckboxChange('hasDocumentAccess', checked as boolean)}
              />
              <Label htmlFor="hasDocumentAccess" className="cursor-pointer">
                Document Access
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="hasToolAccess"
                checked={formData.hasToolAccess}
                onCheckedChange={(checked) => handleCheckboxChange('hasToolAccess', checked as boolean)}
              />
              <Label htmlFor="hasToolAccess" className="cursor-pointer">
                Tool Access
              </Label>
            </div>

            {formData.hasToolAccess && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <Label className="block mb-3">Allowed Tools</Label>
                <div className="space-y-2">
                  {AVAILABLE_TOOLS.map(tool => (
                    <div key={tool} className="flex items-center gap-2">
                      <Checkbox
                        id={tool}
                        checked={formData.allowedTools.includes(tool)}
                        onCheckedChange={() => handleToolToggle(tool)}
                      />
                      <Label htmlFor={tool} className="cursor-pointer">
                        {tool.replace(/_/g, ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={createAgentMutation.isPending || updateAgentMutation.isPending}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {agentId ? 'Update Agent' : 'Create Agent'}
          </Button>
          {agentId && agent?.status === 'draft' && (
            <Button
              onClick={handlePromote}
              variant="outline"
              disabled={promoteAgentMutation.isPending}
            >
              Promote to Governed
            </Button>
          )}
          <Button
            onClick={() => navigate('/agents')}
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
