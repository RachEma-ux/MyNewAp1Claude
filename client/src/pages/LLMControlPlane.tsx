/**
 * LLM Control Plane - Administrative view of all LLMs
 *
 * Provides comprehensive management interface:
 * - List all LLM identities with latest versions
 * - Filter by role, environment, status
 * - View version history and attestation status
 * - Manage promotions and lifecycle
 * - Audit trail access
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Archive,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

export default function LLMControlPlane() {
  const [, setLocation] = useLocation();
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: llms, isLoading, refetch } = trpc.llm.list.useQuery({
    role: roleFilter as any,
    archived: false,
  });

  const archiveMutation = trpc.llm.archive.useMutation({
    onSuccess: () => {
      toast.success("LLM archived successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to archive LLM: ${error.message}`);
    },
  });

  const handleArchive = async (id: number, name: string) => {
    if (confirm(`Archive LLM "${name}"? This will prevent it from being used.`)) {
      archiveMutation.mutate({ id });
    }
  };

  const filteredLLMs = llms?.filter((llm) =>
    llm.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      planner: "bg-blue-500",
      executor: "bg-green-500",
      router: "bg-purple-500",
      guard: "bg-red-500",
      observer: "bg-yellow-500",
      embedder: "bg-pink-500",
    };
    return colors[role] || "bg-gray-500";
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/llm")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">LLM Control Plane</h1>
            <p className="text-muted-foreground">Manage all LLM identities and versions</p>
          </div>
        </div>

        <Button onClick={() => setLocation("/llm/wizard")}>
          <Plus className="mr-2 h-4 w-4" />
          Create LLM
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search LLMs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="planner">Planner</SelectItem>
                <SelectItem value="executor">Executor</SelectItem>
                <SelectItem value="router">Router</SelectItem>
                <SelectItem value="guard">Guard</SelectItem>
                <SelectItem value="observer">Observer</SelectItem>
                <SelectItem value="embedder">Embedder</SelectItem>
              </SelectContent>
            </Select>

            {(roleFilter || searchQuery) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRoleFilter(undefined);
                  setSearchQuery("");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LLM List */}
      <Card>
        <CardHeader>
          <CardTitle>LLM Registry</CardTitle>
          <CardDescription>
            {filteredLLMs?.length || 0} LLM{(filteredLLMs?.length || 0) !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading LLMs...</p>
            </div>
          ) : filteredLLMs && filteredLLMs.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Owner Team</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLLMs.map((llm) => (
                    <TableRow key={llm.id}>
                      <TableCell className="font-medium">{llm.name}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(llm.role)}>{llm.role}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {llm.description || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {llm.ownerTeam || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(llm.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/llm/${llm.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchive(llm.id, llm.name)}
                            disabled={archiveMutation.isPending}
                          >
                            <Archive className="h-4 w-4 mr-1" />
                            Archive
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No LLMs found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || roleFilter
                  ? "Try adjusting your filters"
                  : "Create your first LLM to get started"}
              </p>
              {!searchQuery && !roleFilter && (
                <Button onClick={() => setLocation("/llm/wizard")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create LLM
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
