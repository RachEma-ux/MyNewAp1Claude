import { useState } from "react";
import { Key, Plus, Search, Trash2, Edit, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc";

export default function SecretsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteSecretId, setDeleteSecretId] = useState<number | null>(null);
  const [editingSecret, setEditingSecret] = useState<{ id: number; key: string; value: string } | null>(null);
  const [newSecret, setNewSecret] = useState({ key: "", value: "", description: "" });
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});
  
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Fetch secrets
  const { data: secrets = [], isLoading } = trpc.secrets.list.useQuery();

  // Create secret mutation
  const createSecret = trpc.secrets.create.useMutation({
    onSuccess: () => {
      utils.secrets.list.invalidate();
      setIsCreateDialogOpen(false);
      setNewSecret({ key: "", value: "", description: "" });
      toast({
        title: "Secret created",
        description: "The secret has been securely stored.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update secret mutation
  const updateSecret = trpc.secrets.update.useMutation({
    onSuccess: () => {
      utils.secrets.list.invalidate();
      setIsEditDialogOpen(false);
      setEditingSecret(null);
      toast({
        title: "Secret updated",
        description: "The secret has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete secret mutation
  const deleteSecret = trpc.secrets.delete.useMutation({
    onSuccess: () => {
      utils.secrets.list.invalidate();
      setDeleteSecretId(null);
      toast({
        title: "Secret deleted",
        description: "The secret has been permanently removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredSecrets = secrets.filter((secret) =>
    secret.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateSecret = () => {
    if (!newSecret.key || !newSecret.value) {
      toast({
        title: "Validation error",
        description: "Key and value are required.",
        variant: "destructive",
      });
      return;
    }
    createSecret.mutate(newSecret);
  };

  const handleUpdateSecret = () => {
    if (!editingSecret) return;
    updateSecret.mutate({
      id: editingSecret.id,
      value: editingSecret.value,
    });
  };

  const toggleShowValue = (id: number) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key className="h-8 w-8" />
            Secrets Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Securely store and manage API keys, tokens, and credentials
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Secret
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Secret</DialogTitle>
              <DialogDescription>
                Add a new encrypted secret. Use the format: UPPERCASE_SNAKE_CASE
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key">Key *</Label>
                <Input
                  id="key"
                  placeholder="API_KEY_NAME"
                  value={newSecret.key}
                  onChange={(e) => setNewSecret({ ...newSecret, key: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Value *</Label>
                <Input
                  id="value"
                  type="password"
                  placeholder="Enter secret value"
                  value={newSecret.value}
                  onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="What is this secret used for?"
                  value={newSecret.description}
                  onChange={(e) => setNewSecret({ ...newSecret, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSecret} disabled={createSecret.isPending}>
                {createSecret.isPending ? "Creating..." : "Create Secret"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Secrets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{secrets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Encryption</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-green-500">AES-256-GCM</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
              Secure
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Secrets List */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Secrets</CardTitle>
          <CardDescription>Encrypted credentials and API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search secrets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading secrets...</div>
          ) : filteredSecrets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No secrets found" : "No secrets yet. Create your first secret to get started."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSecrets.map((secret) => (
                <Card key={secret.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="font-mono font-medium">{secret.key}</div>
                      {secret.description && (
                        <div className="text-sm text-muted-foreground mt-1">{secret.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {showValues[secret.id] ? secret.value : "••••••••••••••••"}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleShowValue(secret.id)}
                        >
                          {showValues[secret.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Created: {new Date(secret.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSecret({ id: secret.id, key: secret.key, value: secret.value });
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteSecretId(secret.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Secret</DialogTitle>
            <DialogDescription>
              Update the value for: <code className="font-mono">{editingSecret?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-value">New Value</Label>
              <Input
                id="edit-value"
                type="password"
                placeholder="Enter new secret value"
                value={editingSecret?.value || ""}
                onChange={(e) =>
                  setEditingSecret(editingSecret ? { ...editingSecret, value: e.target.value } : null)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSecret} disabled={updateSecret.isPending}>
              {updateSecret.isPending ? "Updating..." : "Update Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteSecretId !== null} onOpenChange={() => setDeleteSecretId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The secret will be permanently removed from the encrypted store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSecretId && deleteSecret.mutate({ id: deleteSecretId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
