import React, { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Search, Plus, Trash2, Edit2, Shield, Upload, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/Breadcrumb';
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge';
import { AppBlockerAlert } from '@/components/errors/AppBlockerAlert';
import { getAppBlocker, showBlockerToast } from '@/lib/appBlockers';
import { AGENT_STATUS_LABELS, getDefaultPromotionTarget, type AgentStatus } from '@shared/agent-lifecycle';

interface AgentListItem {
  id: number;
  name: string;
  description?: string;
  roleClass: string;
  status: string;
  temperature?: string;
  modelId?: string | null;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools?: string[];
  createdAt: Date;
  updatedAt: Date;
  callable?: boolean;
  catalogEntryId?: number | null;
}

export function AgentList() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const importSelectionMode = searchParams.get('mode') === 'catalog-import';
  const callableOnly = searchParams.get('callableOnly') === '1';
  const returnTo = searchParams.get('returnTo') || '/llm/catalogue/candidate';

  const { data: agents, isLoading, error, refetch } = trpc.agents.list.useQuery();
  const promoteMutation = trpc.agents.promote.useMutation({
    onSuccess: () => refetch(),
    onError: (mutationError) => {
      showBlockerToast(mutationError, 'Agent lifecycle update blocked');
    },
  });
  const importMutation = trpc.agents.importToCatalog.useMutation({
    onError: (mutationError) => {
      showBlockerToast(mutationError, 'Catalog import blocked');
    },
  });
  const deleteAgentMutation = trpc.agents.delete.useMutation({
    onSuccess: () => refetch(),
    onError: (mutationError) => {
      showBlockerToast(mutationError, 'Agent deletion blocked');
    },
  });

  const filteredAgents = useMemo(() => (agents || []).filter((agent: AgentListItem) => {
    if (importSelectionMode && callableOnly && !agent.callable) {
      return false;
    }

    const query = searchQuery.toLowerCase();
    return agent.name.toLowerCase().includes(query) || agent.description?.toLowerCase().includes(query);
  }), [agents, callableOnly, importSelectionMode, searchQuery]);

  const handleDeleteAgent = async (agentId: number) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      await deleteAgentMutation.mutateAsync({ id: agentId });
    }
  };

  const handleCatalogSelection = async (agentId: number) => {
    const result = await importMutation.mutateAsync({ id: agentId });
    const entryId = result.entry?.id;
    navigate(entryId ? `${returnTo}?entryId=${entryId}` : returnTo);
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <AppBlockerAlert blocker={getAppBlocker(error)} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Breadcrumb items={[{ label: 'Governance', href: '/governance' }, { label: 'Agents', current: true }]} />

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="mt-2 text-gray-600">
            {importSelectionMode
              ? 'Select one callable agent to start Catalog onboarding. This creates a candidate entry and does not publish it.'
              : 'Manage draft, governed, and deployable agent definitions'}
          </p>
        </div>
        {importSelectionMode ? (
          <Button variant="outline" onClick={() => navigate(returnTo)}>
            Back to Candidate Pipeline
          </Button>
        ) : (
          <Button onClick={() => navigate('/governance/agents/create')} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Agent
          </Button>
        )}
      </div>

      {importSelectionMode && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Catalog import selection</p>
              <p className="text-muted-foreground">
                Only callable agents are shown here. Callable means the agent is deployable and not already onboarded into the Catalog pipeline.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
        <Input placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : filteredAgents.length === 0 ? (
        <Card>
          <CardContent className="pt-8 text-center">
            <p className="text-gray-500">
              {importSelectionMode ? 'No callable agents are available for Catalog import.' : 'No agents found. Create one to get started.'}
            </p>
          </CardContent>
        </Card>
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
                    {agent.callable && <Badge className="border-blue-600/30 bg-blue-600/20 text-blue-400">Callable</Badge>}
                  </div>

                  <div className="text-sm text-gray-600">
                    <p>Model: {agent.modelId || 'Configured'}</p>
                    <p>Document access: {agent.hasDocumentAccess ? 'Yes' : 'No'}</p>
                    <p>Tool access: {agent.hasToolAccess ? 'Yes' : 'No'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {importSelectionMode ? (
                      <Button
                        size="sm"
                        onClick={() => handleCatalogSelection(agent.id)}
                        disabled={!agent.callable || importMutation.isPending}
                      >
                        <Upload className="mr-1 h-3 w-3" />
                        Select for Catalog
                      </Button>
                    ) : (
                      <>
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
                        {agent.callable && (
                          <Button size="sm" variant="outline" onClick={() => handleCatalogSelection(agent.id)}>
                            <Upload className="mr-1 h-3 w-3" />
                            Catalog
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteAgent(agent.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
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
