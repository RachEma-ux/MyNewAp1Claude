/**
 * PMT Discussion Detail — Thread view with posts
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Pin, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

export function PMTDiscussionDetailPage() {
  const params = useParams<{ discussionId: string }>();
  const discussionId = parseInt(params.discussionId || "0", 10);
  const [draft, setDraft] = useState("");

  const utils = trpc.useUtils();

  const { data: discussion, isLoading: discLoading } = trpc.modules.pmt.discussions.get.useQuery(
    { id: discussionId },
    { enabled: !!discussionId }
  );

  const { data: posts, isLoading: postsLoading } = trpc.modules.pmt.discussions.posts.list.useQuery(
    { discussionId },
    { enabled: !!discussionId }
  );

  const createPostMut = trpc.modules.pmt.discussions.posts.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.discussions.posts.list.invalidate();
      setDraft("");
      toast.success("Posted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!discussion) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Discussion not found.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/pm/projects/discussions`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{discussion.title}</h1>
            {discussion.pinned && (
              <Badge variant="secondary" className="text-[10px]">
                <Pin className="h-3 w-3 mr-0.5" />
                Pinned
              </Badge>
            )}
            {discussion.locked && (
              <Badge variant="outline" className="text-[10px]">
                <Lock className="h-3 w-3 mr-0.5" />
                Locked
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Started {new Date(discussion.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Posts */}
      <ScrollArea className="flex-1">
        <div className="space-y-3">
          {(!posts || posts.length === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No posts yet. Be the first to contribute.
            </p>
          )}
          {(posts || []).map((post: any) => (
            <div key={post.id} className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {post.authorName || `User #${post.authorId || "anon"}`}
                </span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{post.content}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Compose */}
      {!discussion.locked && (
        <div className="flex gap-2 border-t pt-3">
          <Textarea
            placeholder="Write a reply…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="flex-1"
          />
          <Button
            size="icon"
            disabled={!draft.trim() || createPostMut.isPending}
            onClick={() =>
              createPostMut.mutate({
                discussionId,
                content: draft.trim(),
              })
            }
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
