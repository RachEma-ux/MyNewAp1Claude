import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/_core/hooks/useAuth';
import { Streamdown } from 'streamdown';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  Eye,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function WikiArticle() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/wiki/:slug');
  const { user } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  const slug = params?.slug as string;

  const { data: page, isLoading, error } = trpc.wiki.getPageBySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  const { data: revisions = [] } = trpc.wiki.getPageRevisions.useQuery(
    { pageId: page?.id || 0 },
    { enabled: !!page?.id }
  );

  const deleteMutation = trpc.wiki.deletePage.useMutation({
    onSuccess: () => {
      setLocation('/wiki');
    },
  });

  const revertMutation = trpc.wiki.revertToRevision.useMutation({
    onSuccess: () => {
      setShowRevisions(false);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => setLocation('/wiki')}
            className="gap-2 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Wiki
          </Button>

          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
            <p className="text-muted-foreground mb-4">
              The wiki page you're looking for doesn't exist.
            </p>
            <Button onClick={() => setLocation('/wiki')}>
              Back to Wiki
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const canEdit = user?.id === page.authorId || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/wiki')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Wiki
            </Button>

            {canEdit && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/wiki/edit/${page.id}`)}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold mb-4">{page.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {page.views} views
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Updated {new Date(page.updatedAt).toLocaleDateString()}
            </span>
            {page.version > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRevisions(!showRevisions)}
                className="gap-1"
              >
                Version {page.version}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {showRevisions && revisions.length > 0 && (
          <Card className="p-4 mb-6 bg-muted">
            <h3 className="font-semibold mb-4">Revision History</h3>
            <div className="space-y-2">
              {revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center justify-between p-3 bg-background rounded border border-border"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Version {revision.revisionNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(revision.createdAt).toLocaleString()}
                    </p>
                    {revision.reason && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {revision.reason}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        revertMutation.mutate({
                          pageId: page.id,
                          revisionNumber: revision.revisionNumber,
                        })
                      }
                      disabled={revertMutation.isPending}
                    >
                      Revert
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-8 prose prose-invert max-w-none">
          <Streamdown>{page.content}</Streamdown>
        </Card>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Page</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this page? This action cannot be
            undone.
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ pageId: page.id })}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
