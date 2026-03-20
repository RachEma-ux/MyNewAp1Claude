import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Search, Plus, Trash2, Edit2, Shield, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/Breadcrumb';
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge';
import { AGENT_STATUS_LABELS, getDefaultPromotionTarget, type AgentStatus } from '@shared/agent-lifecycle';

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
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: agents, isLoading, error, refetch } = trpc.agents.list.useQuery();
  const promoteMutation = trpc.agents.promote.useMutation({ onSuccess: () => refetch() });
  const importMutation = trpc.agents.importToCatalog.useMutation();
  const deleteAgentMutation = trpc.agents.delete.useMutation({ onSuccess: () => refetch() });

  const filteredAgents = useMemo(() => (agents || []).filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ), [agents, searchQuery]);

  const handleDeleteAgent = async (agentId: number) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      await deleteAgentMutation.mutateAsync({ id: agentId });
    }
  };

  if (error) {
    return <div className="container mx-auto py-8"><div className="text-red-600">Error loading agents: {error.message}</div></div>;
  }

  return (
    <div className="container mx-auto py-8">
      <Breadcrumb items={[{ label: 'Governance', href: '/governance' }, { label: 'Agents', current: true }]} />

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="mt-2 text-gray-600">Manage draft, governed, and deployable agent definitions</p>
        </div>
        <Button onClick={() => navigate('/governance/agents/create')} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Agent
        </Button>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
        <Input placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : filteredAgents.length === 0 ? (
        <Card><CardContent className="pt-8 text-center"><p className="text-gray-500">No agents found. Create one to get started.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent: AgentListItem) => {
            const nextStatus = getDefaultPromotionTarget((agent.status || 'draft') as AgentStatus);
            return (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      {agent.description && <CardDescription className="mt-2">{agent.description}</CardDescription>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{agent.roleClass}</Badge>
                    <AgentStatusBadge status={agent.status} />
                  </div>

                  <div className="text-sm text-gray-600">
                    <p>Model: {agent.temperature ? `${agent.temperature} temp` : 'Configured'}</p>
                    <p>Document access: {agent.hasDocumentAccess ? 'Yes' : 'No'}</p>
                    <p>Tool access: {agent.hasToolAccess ? 'Yes' : 'No'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/agents/${agent.id}/edit`)}>
                      <Edit2 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    {nextStatus && (
                      <Button size="sm" variant="outline" onClick={() => promoteMutation.mutate({ id: agent.id, targetStatus: nextStatus })}>
                        <Shield className="mr-1 h-3 w-3" />
                        {AGENT_STATUS_LABELS[nextStatus]}
                      </Button>
                    )}
                    {agent.status === 'deployable' && (
                      <Button size="sm" variant="outline" onClick={() => importMutation.mutate({ id: agent.id })}>
                        <Upload className="mr-1 h-3 w-3" />
                        Catalog
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteAgent(agent.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
