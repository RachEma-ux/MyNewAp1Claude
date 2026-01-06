/**
 * Agent List Page
 * 
 * Displays all agents in the workspace with their status, role, and governance state.
 */

import React, { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/Breadcrumb';
import { useLocation } from 'wouter';
import { Search, Plus, Play, Square, Trash2, Edit2 } from 'lucide-react';

interface AgentListItem {
  id: number;
  name: string;
  description?: string;
  roleClass: string;
  status: string;
  temperature?: string;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function AgentList() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  // Fetch agents
  const { data: agents, isLoading, error } = trpc.agents.list.useQuery();

  // Mutations
  const deleteAgentMutation = trpc.agents.delete.useMutation();
  const startAgentMutation = trpc.orchestrator.startAgent.useMutation();
  const stopAgentMutation = trpc.orchestrator.stopAgent.useMutation();

  // Filter agents by search query
  const filteredAgents = (agents || []).filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteAgent = async (agentId: number) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      try {
        await deleteAgentMutation.mutateAsync({ id: agentId });
        setSelectedAgent(null);
      } catch (error) {
        console.error('Failed to delete agent:', error);
      }
    }
  };

  const handleStartAgent = async (agent: AgentListItem) => {
    try {
      await startAgentMutation.mutateAsync({
        agentId: agent.id,
        workspaceId: user?.id || 0,
      });
    } catch (error) {
      console.error('Failed to start agent:', error);
    }
  };

  const handleStopAgent = async (agent: AgentListItem) => {
    try {
      await stopAgentMutation.mutateAsync({
        agentId: agent.id,
        workspaceId: user?.id || 0,
      });
    } catch (error) {
      console.error('Failed to stop agent:', error);
    }
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      assistant: 'bg-blue-100 text-blue-800',
      analyst: 'bg-purple-100 text-purple-800',
      support: 'bg-green-100 text-green-800',
      reviewer: 'bg-orange-100 text-orange-800',
      automator: 'bg-red-100 text-red-800',
      monitor: 'bg-gray-100 text-gray-800',
      custom: 'bg-indigo-100 text-indigo-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sandbox: 'bg-yellow-100 text-yellow-800',
      governed: 'bg-green-100 text-green-800',
      archived: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-red-600">Error loading agents: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Governance', href: '/governance' },
          { label: 'Agents', current: true },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-gray-600 mt-2">Manage and monitor your AI agents</p>
        </div>
        <Button
          onClick={() => navigate('/governance/agents/create')}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Agent
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <Card>
          <CardContent className="pt-8 text-center">
            <p className="text-gray-500">No agents found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent: AgentListItem) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-all ${
                selectedAgent === agent.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedAgent(agent.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    {agent.description && (
                      <CardDescription className="mt-2">{agent.description}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={getRoleColor(agent.roleClass)}>
                    {agent.roleClass}
                  </Badge>
                  <Badge className={getStatusColor(agent.status)}>
                    {agent.status}
                  </Badge>
                </div>

                {/* Capabilities */}
                <div className="text-sm">
                  <p className="text-gray-600 mb-2">Capabilities:</p>
                  <div className="flex gap-2 flex-wrap">
                    {agent.hasDocumentAccess && (
                      <Badge variant="outline">📄 Documents</Badge>
                    )}
                    {agent.hasToolAccess && (
                      <Badge variant="outline">🔧 Tools</Badge>
                    )}
                    {!agent.hasDocumentAccess && !agent.hasToolAccess && (
                      <span className="text-gray-400 text-xs">No special access</span>
                    )}
                  </div>
                </div>

                {/* Temperature */}
                {agent.temperature && (
                  <div className="text-sm">
                    <p className="text-gray-600">Temperature: {agent.temperature}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/agents/${agent.id}/edit`);
                    }}
                    className="flex-1 flex items-center justify-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </Button>
                  {agent.status === 'governed' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartAgent(agent);
                        }}
                        className="flex-1 flex items-center justify-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStopAgent(agent);
                        }}
                        className="flex-1 flex items-center justify-center gap-1"
                      >
                        <Square className="w-3 h-3" />
                        Stop
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAgent(agent.id);
                    }}
                    className="flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
