import { useState } from "react";
import { PageShell, EmptyState, ConfirmDestructiveActionDialog, StatusPill, DataTableShell } from "@/components/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Package,
  Bot,
  FileText,
  Plus,
  Trash2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export default function UIShowcasePage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [typeConfirmOpen, setTypeConfirmOpen] = useState(false);

  const handleFakeDelete = () => {
    setConfirmLoading(true);
    setTimeout(() => {
      setConfirmLoading(false);
      setConfirmOpen(false);
      toast.success("Item deleted (demo)");
    }, 1500);
  };

  return (
    <PageShell
      title="UI Showcase"
      subtitle="Living documentation for shared application components"
      icon={Layers}
      actions={
        <Badge variant="secondary">v1.0</Badge>
      }
    >
      {/* --- PageShell --- */}
      <Section title="PageShell" description="Standard page layout wrapper with title, subtitle, optional icon, back arrow, and action slots.">
        <div className="rounded-lg border p-4 bg-muted/30">
          <pre className="text-xs text-muted-foreground overflow-auto">{`<PageShell
  title="Page Title"
  subtitle="Optional subtitle"
  icon={Layers}
  backHref="/previous-page"
  actions={<Button>Action</Button>}
>
  {children}
</PageShell>`}</pre>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          This page itself is wrapped in a PageShell. See the header above.
        </p>
      </Section>

      {/* --- EmptyState --- */}
      <Section title="EmptyState" description="Placeholder shown when a list has no items. Supports icon, title, description, and action buttons.">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create your first AI agent to get started with automated conversations."
            action={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </Button>
            }
          />
          <EmptyState
            icon={FileText}
            title="No documents found"
            description="Upload documents to build your knowledge base."
            bordered={false}
          />
        </div>
      </Section>

      {/* --- StatusPill --- */}
      <Section title="StatusPill" description="Semantic status indicators with CVA variants. Replaces ad-hoc Badge color overrides.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status="active" />
            <StatusPill status="success" />
            <StatusPill status="pending" />
            <StatusPill status="error" />
            <StatusPill status="disabled" />
            <StatusPill status="draft" />
            <StatusPill status="deprecated" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status="active" dot />
            <StatusPill status="pending" dot />
            <StatusPill status="error" dot />
            <StatusPill status="disabled" dot />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status="active" size="sm" label="Small" />
            <StatusPill status="error" size="sm" label="Small Error" />
            <StatusPill status="pending" label="Custom Label" />
          </div>
        </div>
      </Section>

      {/* --- ConfirmDestructiveActionDialog --- */}
      <Section title="ConfirmDestructiveActionDialog" description="Replaces window.confirm() with a proper dialog. Supports loading state and type-to-confirm.">
        <div className="flex gap-3">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Item (Standard)
          </Button>
          <Button variant="destructive" onClick={() => setTypeConfirmOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Item (Type to Confirm)
          </Button>
        </div>

        <ConfirmDestructiveActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete this item?"
          description="This action cannot be undone. The item will be permanently removed."
          confirmLabel="Delete"
          onConfirm={handleFakeDelete}
          isLoading={confirmLoading}
        />

        <ConfirmDestructiveActionDialog
          open={typeConfirmOpen}
          onOpenChange={setTypeConfirmOpen}
          title="Delete workspace?"
          description="This will permanently delete the workspace and all its data."
          confirmLabel="Delete Workspace"
          onConfirm={() => {
            setTypeConfirmOpen(false);
            toast.success("Workspace deleted (demo)");
          }}
          typeToConfirmText="DELETE"
        />
      </Section>

      {/* --- DataTableShell --- */}
      <Section title="DataTableShell" description="Slot-based table wrapper with title, toolbar, empty state, and pagination slots.">
        <DataTableShell
          title="Example Table"
          description="3 items"
          headerActions={
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Row
            </Button>
          }
          toolbar={
            <div className="text-sm text-muted-foreground">
              Toolbar area (search, filters, bulk actions)
            </div>
          }
        >
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">GPT-4o</TableCell>
                  <TableCell><StatusPill status="active" /></TableCell>
                  <TableCell>Cloud</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Llama 3</TableCell>
                  <TableCell><StatusPill status="pending" /></TableCell>
                  <TableCell>Local</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Legacy Model</TableCell>
                  <TableCell><StatusPill status="deprecated" /></TableCell>
                  <TableCell>Cloud</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </DataTableShell>

        <DataTableShell
          title="Empty Table Example"
          description="0 items"
          isEmpty
          emptyState={
            <EmptyState
              icon={Package}
              title="No models installed"
              description="Download AI models from the model hub to start using local inference."
              action={<Button size="sm">Browse Models</Button>}
              bordered={false}
            />
          }
        >
          <div />
        </DataTableShell>
      </Section>
    </PageShell>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
