# Shared Components Inventory

Audit of duplicated UI patterns across 84 page files in `client/src/pages/`.

---

## 1. PageShell (Page Header)

**Pattern:** `<h1>` + subtitle `<p>` + action buttons in a flex row.

Found in **78 of 84 pages** (virtually every page). The structure is:

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-3xl font-bold">Title</h1>
    <p className="text-muted-foreground mt-1">Subtitle</p>
  </div>
  <Button> {/* Primary action */} </Button>
</div>
```

### Variations
| Variation | Pages | Example |
|---|---|---|
| Basic: title + subtitle + single CTA | ~40 pages | AgentsPage, Workspaces, PolicyManagement, ProtocolsPage |
| With back button (ArrowLeft) | ~8 pages | LLMPromotions, AgentDetailPage, ProviderDetail |
| With icon in title (`<h1>` has icon) | ~12 pages | SecretsPage (Key), ServersPage (Server), MachinesPage (Cog) |
| With multiple action buttons | ~15 pages | Documents, Conversations, LLMPromotions |
| Title + subtitle only (no buttons) | ~5 pages | ToolsManagementPage, VectorDBManagement |
| Different text sizes (text-2xl vs text-3xl vs text-4xl) | mixed | VectorDBManagement uses text-4xl, WCPWorkflowsList uses text-2xl |
| Outer wrapper varies: `container py-8` vs `space-y-6` vs `space-y-6 p-6` | mixed | inconsistent across pages |

### Proposed: `<PageShell>` component
```tsx
<PageShell
  title="Agents"
  subtitle="Manage sandbox and governed AI agents"
  icon={Shield}
  backHref="/llm"
  actions={<Button><Plus /> New Agent</Button>}
/>
```

### Files affected (representative sample)
- `client/src/pages/AgentsPage.tsx:196-207`
- `client/src/pages/Providers.tsx:225-231`
- `client/src/pages/Documents.tsx:127-158`
- `client/src/pages/Workspaces.tsx:93-99`
- `client/src/pages/SecretsPage.tsx:135-144`
- `client/src/pages/PolicyManagement.tsx:211-228`
- `client/src/pages/ProtocolsPage.tsx:140-144`
- `client/src/pages/LLMPromotions.tsx:179-189`
- `client/src/pages/Models.tsx:72-83`
- `client/src/pages/Conversations.tsx:125-131`
- `client/src/pages/WCPWorkflowsList.tsx:49-56`
- `client/src/pages/ServersPage.tsx:101-115`
- `client/src/pages/MachinesPage.tsx:100-114`
- All 6 `infrastructure/hardware/` pages

---

## 2. EmptyState

**Pattern:** Icon + "No items found" heading + descriptive text + optional CTA button, centered in a Card.

Found in **39+ pages**. Two main structural variants:

### Variant A: Card wrapper with centered content (most common)
```tsx
<Card className="p-12 text-center">
  <IconName className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
  <h3 className="text-lg font-semibold mb-2">No items found</h3>
  <p className="text-muted-foreground mb-4">Description text</p>
  <Button><Plus /> Create Item</Button>
</Card>
```

### Variant B: Dashed border card with rounded icon container
```tsx
<Card className="border-dashed">
  <CardHeader className="text-center py-12">
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
      <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
    <CardTitle>No items yet</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
</Card>
```

### Variant C: CardContent flex column
```tsx
<Card>
  <CardContent className="flex flex-col items-center justify-center py-12">
    <Icon className="h-12 w-12 text-muted-foreground mb-4" />
    <h3 className="text-lg font-semibold mb-2">No items</h3>
    <p className="text-muted-foreground text-center mb-4">Description</p>
    <Button>CTA</Button>
  </CardContent>
</Card>
```

### Context-aware: search-filtered vs zero-data
Many pages distinguish between "no results because of search filter" vs "no data at all":
```tsx
{searchQuery ? "Try a different search query" : "Create your first item to get started"}
```

### Existing primitive (UNUSED)
`client/src/components/ui/empty.tsx` already exports `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia` -- but **zero pages import them**.

### Files affected
- `client/src/pages/AgentsPage.tsx:248-260`
- `client/src/pages/Providers.tsx:530-543` (All tab), `:625-638` (Cloud tab), `:691-704` (Local tab)
- `client/src/pages/Documents.tsx:167-177` (select workspace), `:183-193` (no docs)
- `client/src/pages/Workspaces.tsx:176-186`
- `client/src/pages/Models.tsx:128-138` (no models), `:226-236` (no history)
- `client/src/pages/Conversations.tsx:229-242`
- `client/src/pages/PolicyManagement.tsx:254-265`
- `client/src/pages/ProtocolsPage.tsx:260-270`
- `client/src/pages/WCPWorkflowsList.tsx:73-87`
- `client/src/pages/LLMPromotions.tsx:310-320`
- `client/src/pages/TemplatesPage.tsx:78-87`
- `client/src/pages/AutomationExecutions.tsx:223-227`
- `client/src/pages/ToolsManagementPage.tsx:189-192`
- All 6 `infrastructure/hardware/` pages (table empty row pattern)

---

## 3. Confirm Destructive Action Dialog

**Pattern:** Confirmation before delete/archive/destructive action. Two implementations:

### Variant A: Browser `confirm()` -- **20+ pages**
```tsx
if (confirm("Are you sure you want to delete this item?")) {
  deleteMutation.mutate({ id });
}
```

**Pages using browser confirm():**
- AgentEditorPage, AgentList, Agents, Automation, Chat (x2), Conversations (x2)
- Documents, DocumentsDashboard (x2), ProtocolsPage, ProviderDetail, Providers
- ResourceMonitor, VectorDBManagement, Workspaces, LLMControlPlane
- LLMPromotions, ProviderConnectionsPage

### Variant B: AlertDialog component -- **3+ pages**
```tsx
<AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Item?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive ...">Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
- SecretsPage:346-364

### Variant C: Dialog with destructive Button -- **5+ pages**
```tsx
<Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Multiple Items</DialogTitle>
      <DialogDescription>
        Are you sure you want to delete {count} item(s)? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
- AgentsPage:416-433 (bulk delete)
- LLMPromotions:386-452 (reject dialog)

### Proposed: `<ConfirmDestructiveActionDialog>` + `useConfirmDialog` hook
```tsx
const { confirm, ConfirmDialog } = useConfirmDialog();
// ...
await confirm({ title: "Delete agent?", description: "..." });
deleteMutation.mutate({ id });
```

---

## 4. Status Badge / StatusPill

**Pattern:** Colored Badge indicating entity status. Duplicated `getStatusBadge()` / `getStatusColor()` helper functions across many pages.

### Inline color-mapped Badge (most common -- **30+ pages**)
```tsx
<Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
  Active
</Badge>
```

### `getStatusBadge()` function pattern -- **12+ pages**
```tsx
const getStatusBadge = (status: string) => {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    processing: "secondary",
    pending: "outline",
    error: "destructive",
  };
  return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
};
```

### `getStatusColor()` switch/map pattern -- **10+ pages**
```tsx
const getStatusColor = (status: string) => {
  switch (status) {
    case "online": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "offline": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "maintenance": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "error": return "bg-red-500/10 text-red-500 border-red-500/20";
    default: return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  }
};
```

### Common status vocabularies (repeated across pages)
| Domain | Statuses |
|---|---|
| General entity | active, inactive, pending, error, completed |
| Infrastructure | online, offline, maintenance, error |
| Execution | queued, running, completed, failed, cancelled |
| Governance | SANDBOX, GOVERNED_VALID, GOVERNED_RESTRICTED, GOVERNED_INVALIDATED |
| Document | pending, processing, completed, error |
| Model | ready, downloading, converting, error |
| Promotion | pending, simulated, approved, rejected, executed, failed |
| Key rotation | pending, in_progress, completed, failed |

### Files with getStatusBadge/getStatusColor functions
- `client/src/pages/Documents.tsx:101-114` (getStatusBadge)
- `client/src/pages/Models.tsx:46-59` (getStatusBadge, nearly identical to Documents)
- `client/src/pages/AutomationExecutions.tsx:97-110` (getStatusBadge)
- `client/src/pages/Conversations.tsx:94-120` (getStatusBadge)
- `client/src/pages/LLMPromotions.tsx:141-160` (getStatusBadge)
- `client/src/pages/AgentsPage.tsx:150-175` (getGovernanceBadge)
- `client/src/pages/ServersPage.tsx:78-91` (getStatusColor)
- `client/src/pages/MachinesPage.tsx:77-90` (getStatusColor, nearly identical to ServersPage)
- `client/src/pages/infrastructure/hardware/CensorsPage.tsx` (getStatusColor)
- `client/src/pages/infrastructure/hardware/MobilesPage.tsx` (getStatusColor)
- `client/src/pages/infrastructure/hardware/PersonalComputersPage.tsx` (getStatusColor)
- `client/src/pages/infrastructure/hardware/RobotsPage.tsx` (getStatusColor)

### Proposed: `<StatusPill>` with CVA variants
```tsx
<StatusPill status="active" />      // green
<StatusPill status="error" />       // red/destructive
<StatusPill status="pending" />     // yellow
<StatusPill status="inactive" />    // gray
<StatusPill status="running" />     // blue
<StatusPill status="maintenance" /> // yellow
```

---

## 5. DataTableShell (Table + Search + Filters)

**Pattern:** Card wrapping a search input + filter buttons + `<Table>` component.

Found in **12+ pages**. Common structure:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Inventory</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Search + Filters */}
    <div className="flex gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 ..." />
        <Input placeholder="Search..." className="pl-9" />
      </div>
      <div className="flex gap-2">
        <Button variant={filter === "all" ? "default" : "outline"}>All</Button>
        <Button variant={filter === "X" ? "default" : "outline"}>X</Button>
      </div>
    </div>
    {/* Table */}
    <div className="border rounded-lg">
      <Table>
        <TableHeader>...</TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={N} className="text-center py-8">No items</TableCell>
            </TableRow>
          ) : items.map(...)}
        </TableBody>
      </Table>
    </div>
  </CardContent>
</Card>
```

### Pages with this pattern
- `client/src/pages/infrastructure/hardware/ServersPage.tsx:157-283`
- `client/src/pages/infrastructure/hardware/MachinesPage.tsx:156-261`
- `client/src/pages/infrastructure/hardware/CensorsPage.tsx`
- `client/src/pages/infrastructure/hardware/MobilesPage.tsx`
- `client/src/pages/infrastructure/hardware/PersonalComputersPage.tsx`
- `client/src/pages/infrastructure/hardware/RobotsPage.tsx`
- `client/src/pages/LLMPromotions.tsx:221-308` (Table variant)
- `client/src/pages/LLMControlPlane.tsx` (Table variant)
- `client/src/pages/LLMCataloguePage.tsx`
- `client/src/pages/SecretsPage.tsx:237-307` (list inside Card)
- `client/src/pages/Conversations.tsx:176-219` (search + filters in card)

### Proposed: `<DataTableShell>` component
```tsx
<DataTableShell
  title="Server Inventory"
  searchPlaceholder="Search servers..."
  searchValue={searchQuery}
  onSearchChange={setSearchQuery}
  filters={[
    { label: "All", value: "all" },
    { label: "Online", value: "online" },
  ]}
  activeFilter={statusFilter}
  onFilterChange={setStatusFilter}
  emptyMessage="No servers found"
  columns={columns}
  data={filteredServers}
/>
```

---

## 6. Bulk Selection

**Pattern:** Checkbox selection + select-all + bulk action toolbar.

Found in **6+ pages**. Common state:

```tsx
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

const toggleSelection = (id: number) => {
  const newSet = new Set(selectedIds);
  if (newSet.has(id)) newSet.delete(id);
  else newSet.add(id);
  setSelectedIds(newSet);
};

const toggleSelectAll = () => {
  if (selectedIds.size === items.length) setSelectedIds(new Set());
  else setSelectedIds(new Set(items.map(i => i.id)));
};
```

### Files affected
- `client/src/pages/AgentsPage.tsx:28,63-79` (selectedAgents Set, toggleAgentSelection, toggleSelectAll)
- `client/src/pages/Conversations.tsx:21,57-73` (selectedIds Set, handleToggleSelect, handleSelectAll)
- `client/src/pages/DocumentsDashboard.tsx` (selectedIds Set)
- `client/src/pages/AgentList.tsx` (selection logic)
- `client/src/pages/Models.tsx` (checkbox in selection)
- `client/src/pages/AutomationBuilder.tsx` (node selection)

### Proposed: `useBulkSelection<T>()` hook
```tsx
const { selectedIds, toggle, toggleAll, isSelected, isAllSelected, clear, count } =
  useBulkSelection(items.map(i => i.id));
```

---

## 7. Stats Cards Row

**Pattern:** Grid of small metric cards at the top of a page (below header).

Found in **15+ pages**. Structure:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">  {/* or md:grid-cols-4 */}
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">Total Items</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{count}</div>
    </CardContent>
  </Card>
  {/* ... more stat cards ... */}
</div>
```

### Files affected
- `client/src/pages/Providers.tsx:462-511` (4 stat cards)
- `client/src/pages/SecretsPage.tsx:202-229` (3 stat cards)
- `client/src/pages/ServersPage.tsx:117-155` (4 stat cards)
- `client/src/pages/MachinesPage.tsx:116-154` (4 stat cards, identical structure to Servers)
- `client/src/pages/KeyRotationPage.tsx:70-127` (5 stat cards)
- `client/src/pages/AutomationExecutions.tsx:171-183` (3 inline stats)
- `client/src/pages/ToolsManagementPage.tsx:195-221` (3 stats)
- All 6 infrastructure/hardware pages

---

## 8. Loading State

**Pattern:** Centered spinner while data loads.

### Variant A: Full-page spinner
```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
```

### Variant B: Inline text
```tsx
{isLoading ? (
  <div className="text-center py-8 text-muted-foreground">Loading items...</div>
) : (...)}
```

### Variant C: Custom spinner div
```tsx
<div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
```

### Files affected
- Workspaces:82-88, Models:61-67, WCPWorkflowsList:34-43
- TemplatesPage:51-57, ServersPage (Table loading), KeyRotationPage (tab loading)
- Providers:527-529, Conversations:222-227
- Many more with inline `isLoading` ternaries

---

## 9. Permission / Auth Gating

**Pattern:** Check `useAuth()` and render fallback if not logged in.

### Pages using `useAuth()`
- `client/src/pages/KeyRotationPage.tsx:22,36-42` -- full auth gate
- `client/src/pages/AgentEditor.tsx` -- conditional features
- `client/src/pages/AgentList.tsx` -- conditional features
- `client/src/pages/Home.tsx` -- display user info
- `client/src/pages/Settings.tsx` -- user settings
- `client/src/pages/WikiArticle.tsx` -- edit permission

---

## 10. Card-based Entity Grid

**Pattern:** Grid of cards displaying entities (not tables).

Found in **20+ pages**. Structure:

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {items.map((item) => (
    <Card key={item.id} className="hover:bg-accent/50 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </div>
          </div>
          <StatusBadge />
        </div>
      </CardHeader>
      <CardContent>
        {/* Key-value pairs */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Label</span>
          <span className="font-medium">Value</span>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button size="sm">Edit</Button>
          <Button size="sm" variant="outline"><Trash2 /></Button>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

### Files affected
- Workspaces, Documents, Models, Providers (cloud/local/all tabs)
- ProtocolsPage, TemplatesPage, WCPWorkflowsList, ToolsManagementPage

---

## 11. Toast Inconsistency

Two different toast systems are in use:
1. `useToast()` from `@/hooks/use-toast` -- returns `{ toast }` object with `{ title, description, variant }`
2. `toast` from `sonner` -- uses `toast.success()`, `toast.error()` string API

### Pages using `useToast()` (hook):
AgentsPage, PolicyManagement, SecretsPage, ProtocolsPage, ToolsManagementPage, WCPWorkflowsList, TemplatesPage

### Pages using `sonner`:
Providers, Documents, Workspaces, Conversations, LLMPromotions, AutomationExecutions, KeyRotationPage

---

## Summary: Extraction Priority

| Priority | Component | Affected Pages | Effort |
|---|---|---|---|
| P0 | **PageShell** | 78 pages | Low |
| P0 | **EmptyState** (reuse existing `empty.tsx`) | 39 pages | Low |
| P0 | **StatusPill** (CVA variants) | 30+ pages | Medium |
| P1 | **ConfirmDestructiveActionDialog** | 20+ pages | Medium |
| P1 | **useBulkSelection** hook | 6+ pages | Low |
| P1 | **DataTableShell** | 12+ pages | High |
| P2 | **StatsCardRow** | 15+ pages | Low |
| P2 | **useConfirmDialog** hook | 20+ pages | Medium |
| P2 | **Loading spinner** | 30+ pages | Low |
| P3 | **Toast unification** (pick one) | All pages | Medium |
