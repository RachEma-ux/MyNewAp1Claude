import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, Search, Filter, Calendar, User, 
  ArrowRight, Trash2, Clock, CheckCircle, XCircle 
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

export default function Conversations() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

  // Fetch conversations (placeholder - will be replaced with real data)
  const { data: conversations, isLoading } = trpc.chat.listConversations.useQuery();
  const deleteConversationMutation = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete conversation: ${error.message}`);
    },
  });

  const bulkDeleteMutation = trpc.chat.bulkDeleteConversations.useMutation({
    onSuccess: () => {
      toast.success(`${selectedIds.size} conversations deleted`);
      setSelectedIds(new Set());
      setBulkActionMode(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete conversations: ${error.message}`);
    },
  });

  const handleResumeConversation = (conversationId: number) => {
    setLocation(`/chat/${conversationId}`);
  };

  const handleDeleteConversation = async (conversationId: number) => {
    if (!confirm("Are you sure you want to delete this conversation?")) {
      return;
    }
    await deleteConversationMutation.mutateAsync({ conversationId });
  };

  const handleToggleSelect = (conversationId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(conversationId)) {
      newSelected.delete(conversationId);
    } else {
      newSelected.add(conversationId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredConversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConversations.map((c: any) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} conversations?`)) {
      return;
    }
    await bulkDeleteMutation.mutateAsync({ conversationIds: Array.from(selectedIds) });
  };

  // Filter conversations
  const filteredConversations = conversations?.filter((conv: any) => {
    const matchesSearch = 
      conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAgent = filterAgent === "all" || conv.agentId?.toString() === filterAgent;
    const matchesStatus = filterStatus === "all" || conv.status === filterStatus;

    return matchesSearch && matchesAgent && matchesStatus;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Active
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversations</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all your agent conversations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={bulkActionMode ? "default" : "outline"}
            onClick={() => {
              setBulkActionMode(!bulkActionMode);
              setSelectedIds(new Set());
            }}
          >
            {bulkActionMode ? "Cancel" : "Select Multiple"}
          </Button>
          {bulkActionMode && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              Delete {selectedIds.size} Selected
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {bulkActionMode && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedIds.size === filteredConversations.length ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} of {filteredConversations.length} selected
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                <SelectItem value="1">Data Analyst</SelectItem>
                <SelectItem value="2">Code Reviewer</SelectItem>
                <SelectItem value="3">Content Writer</SelectItem>
                <SelectItem value="4">Research Assistant</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Loading conversations...</p>
          </CardContent>
        </Card>
      ) : filteredConversations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No conversations found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterAgent !== "all" || filterStatus !== "all"
                ? "Try adjusting your search or filters"
                : "Start a conversation with an agent to see it here"}
            </p>
            <Button onClick={() => setLocation("/agents")}>
              Browse Agents
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredConversations.map((conversation: any) => (
            <Card key={conversation.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {bulkActionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(conversation.id)}
                      onChange={() => handleToggleSelect(conversation.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                  )}
                  <div className="flex-1 space-y-3">
                    {/* Title and Status */}
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <h3 className="text-lg font-semibold">{conversation.title}</h3>
                      {getStatusBadge(conversation.status)}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {conversation.agentName && (
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {conversation.agentName}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(conversation.createdAt), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {format(new Date(conversation.updatedAt), "h:mm a")}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        {conversation.messageCount} messages
                      </div>
                    </div>

                    {/* Last Message Preview */}
                    {conversation.lastMessage && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {conversation.lastMessage}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleResumeConversation(conversation.id)}
                      className="gap-2"
                    >
                      Resume
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteConversation(conversation.id)}
                      disabled={deleteConversationMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
