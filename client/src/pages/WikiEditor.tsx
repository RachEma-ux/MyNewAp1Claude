import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

export default function WikiEditor() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/wiki/edit/:id');
  const { toast } = useToast();

  const pageId = params?.id as string;
  const isNew = pageId === 'new';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');

  // Fetch categories
  const { data: categories = [] } = trpc.wiki.getCategories.useQuery();

  // Fetch page if editing
  const { data: page } = trpc.wiki.getPageBySlug.useQuery(
    { slug: pageId },
    { enabled: !isNew && !!pageId }
  );

  // Populate form when page loads
  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setContent(page.content);
      if (page.categoryId) {
        setCategoryId(page.categoryId.toString());
      }
    }
  }, [page]);

  // Create/Update mutations
  const createMutation = trpc.wiki.createPage.useMutation({
    onSuccess: (newPage) => {
      toast({
        title: 'Success',
        description: 'Wiki page created successfully',
      });
      setLocation(`/wiki/${newPage.slug}`);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create page',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = trpc.wiki.updatePage.useMutation({
    onSuccess: (updatedPage) => {
      toast({
        title: 'Success',
        description: 'Wiki page updated successfully',
      });
      setLocation(`/wiki/${updatedPage.slug}`);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update page',
        variant: 'destructive',
      });
    },
  });

  const publishMutation = trpc.wiki.publishPage.useMutation({
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Wiki page published',
      });
    },
  });

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: 'Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    if (isNew) {
      createMutation.mutate({
        title,
        content,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
      });
    } else if (page) {
      updateMutation.mutate({
        pageId: page.id,
        title,
        content,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
      });
    }
  };

  const handlePublish = async () => {
    if (page) {
      publishMutation.mutate({ pageId: page.id });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

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
              Back
            </Button>

            <div className="flex gap-2">
              {!isNew && page && !page.isPublished && (
                <Button
                  variant="outline"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="gap-2"
                >
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    'Publish'
                  )}
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>

          <h1 className="text-2xl font-bold">
            {isNew ? 'Create New Page' : 'Edit Page'}
          </h1>
        </div>
      </div>

      {/* Editor */}
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Card className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <Input
              placeholder="Page title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Content (Markdown)
            </label>
            <Textarea
              placeholder="Write your content in Markdown..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-96 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Supports Markdown formatting: **bold**, *italic*, # headings, - lists, etc.
            </p>
          </div>

          {/* Preview */}
          {content && (
            <div>
              <label className="block text-sm font-medium mb-2">Preview</label>
              <Card className="p-4 bg-muted prose prose-invert max-w-none text-sm">
                {/* Simple markdown preview */}
                <div className="whitespace-pre-wrap break-words">
                  {content.substring(0, 300)}
                  {content.length > 300 ? '...' : ''}
                </div>
              </Card>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
