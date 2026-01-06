import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Save, Plus, Clock, Webhook, FileUp, Zap, 
  Mail, Database, Code, MessageSquare, Menu, X,
  Link, Unlink, Trash2, Upload, History, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ValidationPanel, type ValidationError } from "@/components/ValidationPanel";
import { validateWorkflow } from "@/lib/validation";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { BlockConfigModal } from "@/components/automation/BlockConfigModal";
import { WorkflowNode } from "@/components/automation/WorkflowNode";

const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

// Register custom node types
const nodeTypes = {
  workflow: WorkflowNode,
};

interface BlockTemplate {
  id: string;
  type: "trigger" | "action";
  name: string;
  icon: any;
  description: string;
}

const blockTemplates: BlockTemplate[] = [
  {
    id: "time-trigger",
    type: "trigger",
    name: "Time Trigger",
    icon: Clock,
    description: "Run at specific times or intervals",
  },
  {
    id: "webhook-trigger",
    type: "trigger",
    name: "Webhook",
    icon: Webhook,
    description: "Trigger on HTTP webhook",
  },
  {
    id: "file-upload-trigger",
    type: "trigger",
    name: "File Upload",
    icon: FileUp,
    description: "Trigger when file is uploaded",
  },
  {
    id: "database-action",
    type: "action",
    name: "Database Query",
    icon: Database,
    description: "Query or update database",
  },
  {
    id: "ai-action",
    type: "action",
    name: "AI Processing",
    icon: Zap,
    description: "Process with AI agent",
  },
  {
    id: "email-action",
    type: "action",
    name: "Send Email",
    icon: Mail,
    description: "Send email notification",
  },
  {
    id: "code-action",
    type: "action",
    name: "Run Code",
    icon: Code,
    description: "Execute custom JavaScript",
  },
  {
    id: "chat-action",
    type: "action",
    name: "Send Message",
    icon: MessageSquare,
    description: "Send chat message",
  },
];

export default function AutomationBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [, setLocation] = useLocation();
  
  const handleBack = () => {
    setLocation("/automation/executions");
  };
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedNodeForConfig, setSelectedNodeForConfig] = useState<Node | null>(null);

  // Get workflow ID from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const idParam = urlParams.get('id');

  // Fetch workflow if editing
  const { data: existingWorkflow } = trpc.automation.getWorkflow.useQuery(
    { id: Number(idParam) },
    { enabled: !!idParam }
  );

  // Load workflow data when fetched
  useEffect(() => {
    if (existingWorkflow) {
      setWorkflowId(existingWorkflow.id);
      setWorkflowName(existingWorkflow.name);
      
      // Parse and load nodes
      try {
        const parsedNodes = JSON.parse(existingWorkflow.nodes);
        setNodes(parsedNodes);
      } catch (e) {
        console.error("Failed to parse nodes:", e);
      }
      
      // Parse and load edges
      try {
        const parsedEdges = JSON.parse(existingWorkflow.edges);
        setEdges(parsedEdges);
      } catch (e) {
        console.error("Failed to parse edges:", e);
      }
      
      toast.success(`Loaded workflow: ${existingWorkflow.name}`);
    }
  }, [existingWorkflow, setNodes, setEdges]);
  
  const saveMutation = trpc.automation.createWorkflow.useMutation({
    onSuccess: (data) => {
      toast.success("Workflow created successfully");
      // Update workflowId so subsequent saves use update instead of create
      setWorkflowId(data.id);
    },
    onError: (error) => {
      toast.error(`Failed to create workflow: ${error.message}`);
    },
  });

  const updateMutation = trpc.automation.updateWorkflow.useMutation({
    onSuccess: (data) => {
      toast.success("Workflow updated successfully");
      // Stay on builder page after save
    },
    onError: (error) => {
      toast.error(`Failed to update workflow: ${error.message}`);
    },
  });

  const executeMutation = trpc.automation.executeWorkflow.useMutation({
    onSuccess: (data) => {
      toast.success("Workflow execution started! Check Executions page for results.");
      // Stay on builder page after test
    },
    onError: (error) => {
      toast.error(`Failed to execute workflow: ${error.message}`);
    },
  });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<BlockTemplate | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedNodeForConnection, setSelectedNodeForConnection] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationError[]>([]);
  const [validationInfo, setValidationInfo] = useState<ValidationError[]>([]);
  const [connectionMode, setConnectionMode] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Fetch workflow versions if workflowId exists
  const { data: versions = [] } = trpc.automation.getWorkflowVersions.useQuery(
    { workflowId: workflowId! },
    { enabled: !!workflowId }
  );

  // Rollback mutation
  const rollbackMutation = trpc.automation.rollbackToVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Rolled back successfully`);
      // Reload the workflow data
      if (data?.nodes && data?.edges) {
        setNodes(JSON.parse(data.nodes));
        setEdges(JSON.parse(data.edges));
        if (data.name) {
          setWorkflowName(data.name);
        }
      }
    },
    onError: (error) => {
      toast.error(`Failed to rollback: ${error.message}`);
    },
  });

  const handleRollback = (versionId: number) => {
    if (!workflowId) return;
    rollbackMutation.mutate({ workflowId, versionId });
  };

  const handleAddBlock = (template: BlockTemplate) => {
    if (selectedTemplate?.id === template.id) {
      // If clicking the same template again, deselect it
      setSelectedTemplate(null);
      toast.info("Click mode cancelled");
      return;
    }
    
    // Select this template for placement
    setSelectedTemplate(template);
    toast.info(`Click on canvas to place ${template.name}`);
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTemplate || !reactFlowInstance) return;

    // Get the click position relative to the ReactFlow canvas
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });

    const newNode: Node = {
      id: `${selectedTemplate.id}-${Date.now()}`,
      type: "workflow",
      data: { 
        label: selectedTemplate.name,
        blockType: selectedTemplate.type // Add blockType for validation
      },
      position,
    };

    setNodes((nds) => [...nds, newNode]);
    toast.success(`Added ${selectedTemplate.name}`);
    setSelectedTemplate(null);
  };

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (!selectedTemplate || !reactFlowInstance) return;

    // Get the position in flow coordinates
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode: Node = {
      id: `${selectedTemplate.id}-${Date.now()}`,
      type: "workflow",
      data: { 
        label: selectedTemplate.name,
        blockType: selectedTemplate.type // Add blockType for validation
      },
      position,
    };

    setNodes((nds) => [...nds, newNode]);
    toast.success(`Added ${selectedTemplate.name}`);
    setSelectedTemplate(null);
  }, [selectedTemplate, reactFlowInstance, setNodes]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    
    if (connectionMode && selectedNodeForConnection) {
      // Second tap - create connection
      if (selectedNodeForConnection !== node.id) {
        const newEdge: Edge = {
          id: `e${selectedNodeForConnection}-${node.id}`,
          source: selectedNodeForConnection,
          target: node.id,
          animated: true,
        };
        setEdges((eds) => [...eds, newEdge]);
        toast.success("Nodes connected!");
      }
      setSelectedNodeForConnection(null);
      setConnectionMode(false);
    } else {
      // First tap - select node for connection
      setSelectedNodeForConnection(node.id);
      toast.info("Tap 'Connect' then tap another node, or tap 'Disconnect' to remove connections");
    }
  }, [connectionMode, selectedNodeForConnection, setEdges]);

  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    setSelectedNodeForConfig(node);
    setConfigModalOpen(true);
  }, []);

  const handleConnect = () => {
    if (!selectedNodeForConnection) {
      toast.error("Please select a node first");
      return;
    }
    setConnectionMode(true);
    toast.info("Now tap the target node to create connection");
  };

  const handleDisconnect = () => {
    if (!selectedNodeForConnection) {
      toast.error("Please select a node first");
      return;
    }
    
    // Remove all edges connected to this node
    const connectedEdges = edges.filter(
      (edge) => edge.source === selectedNodeForConnection || edge.target === selectedNodeForConnection
    );
    
    if (connectedEdges.length === 0) {
      toast.info("This node has no connections");
      return;
    }
    
    setEdges((eds) => eds.filter(
      (edge) => edge.source !== selectedNodeForConnection && edge.target !== selectedNodeForConnection
    ));
    toast.success(`Removed ${connectedEdges.length} connection(s)`);
    setSelectedNodeForConnection(null);
  };

  const handleDeleteNode = () => {
    if (!selectedNodeForConnection) {
      toast.error("Please select a node first");
      return;
    }
    
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeForConnection));
    setEdges((eds) => eds.filter(
      (edge) => edge.source !== selectedNodeForConnection && edge.target !== selectedNodeForConnection
    ));
    toast.success("Node deleted");
    setSelectedNodeForConnection(null);
  };

  const handleSave = () => {
    // Run client-side validation first
    const validationResult = validateWorkflow(nodes, edges);
    
    // Update validation state
    setValidationErrors(validationResult.errors);
    setValidationWarnings(validationResult.warnings);
    setValidationInfo(validationResult.info);

    // If validation fails, don't save
    if (!validationResult.valid) {
      toast.error(`Cannot save workflow: ${validationResult.errors.length} validation error(s) found`);
      return;
    }

    // Show warnings but allow save
    if (validationResult.warnings.length > 0) {
      toast.warning(`Workflow has ${validationResult.warnings.length} warning(s), but will be saved`);
    }
    
    const workflowData = {
      name: workflowName,
      description: `Workflow with ${nodes.length} blocks and ${edges.length} connections`,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
    };

    // If editing existing workflow, update it; otherwise create new
    if (workflowId) {
      updateMutation.mutate({
        id: workflowId,
        ...workflowData,
      });
    } else {
      saveMutation.mutate(workflowData);
    }
  };

  // Publish mutation
  const publishMutation = trpc.automation.publishWorkflow.useMutation({
    onSuccess: (data) => {
      toast.success(`Workflow published as version ${data?.version}`);
    },
    onError: (error) => {
      toast.error(`Failed to publish: ${error.message}`);
    },
  });

  const handlePublish = () => {
    if (!workflowId) {
      toast.error("Please save the workflow first before publishing.");
      return;
    }

    if (nodes.length === 0) {
      toast.error("Cannot publish empty workflow.");
      return;
    }

    publishMutation.mutate({
      workflowId,
      changeNotes: `Published workflow with ${nodes.length} blocks and ${edges.length} connections`,
    });
  };



  const handleTest = () => {
    // Validate workflow has blocks
    if (nodes.length === 0) {
      toast.error("Cannot test empty workflow. Add at least one block.");
      return;
    }

    if (!workflowId) {
      toast.error("Please save the workflow first before testing.");
      return;
    }

    // Execute the workflow
    toast.info("Starting workflow execution...");
    executeMutation.mutate({
      workflowId,
    });
  };

  const handleRun = () => {
    // Validate workflow has blocks
    if (nodes.length === 0) {
      toast.error("Cannot run empty workflow. Add at least one block.");
      return;
    }

    if (!workflowId) {
      toast.error("Please save the workflow first before running.");
      return;
    }

    // Execute the workflow
    toast.info("Running workflow...");
    executeMutation.mutate({
      workflowId,
    });
  };

  return (
    <div className="space-y-4">
      {/* Back Arrow */}
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Executions
        </Button>
      </div>
      
      <div className="h-[calc(100vh-12rem)] flex flex-col lg:flex-row gap-4 relative">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="lg:hidden fixed top-28 left-4 z-50 p-2 bg-primary text-primary-foreground rounded-md shadow-lg"
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

      {/* Sidebar - Block Templates */}
      <Card className={`
        w-80 flex-shrink-0
        lg:relative lg:translate-x-0
        fixed inset-y-0 left-0 z-40
        transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        mt-16 lg:mt-0
      `}>
        <CardHeader>
          <CardTitle>Workflow Blocks</CardTitle>
          <CardDescription>Drag blocks to the canvas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Triggers */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Triggers
            </h3>
            <div className="space-y-2">
              {blockTemplates
                .filter((t) => t.type === "trigger")
                .map((template) => {
                  const Icon = template.icon;
                  return (
                    <Button
                      key={template.id}
                      variant={selectedTemplate?.id === template.id ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => {
                        handleAddBlock(template);
                        setIsSidebarOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      <div className="text-left flex-1">
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      </div>
                    </Button>
                  );
                })}
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Code className="h-4 w-4" />
              Actions
            </h3>
            <div className="space-y-2">
              {blockTemplates
                .filter((t) => t.type === "action")
                .map((template) => {
                  const Icon = template.icon;
                  return (
                    <Button
                      key={template.id}
                      variant={selectedTemplate?.id === template.id ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => {
                        handleAddBlock(template);
                        setIsSidebarOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      <div className="text-left flex-1">
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      </div>
                    </Button>
                  );
                })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Canvas */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  className="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  placeholder="Enter workflow name..."
                />
                <p className="text-sm text-muted-foreground">
                  {nodes.length} blocks • {edges.length} connections
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedNodeForConnection && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleConnect}>
                      <Link className="h-4 w-4 mr-2" />
                      Connect
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDisconnect}>
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleDeleteNode}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
                <Badge variant="outline">Draft</Badge>
                <Button variant="outline" onClick={handleTest}>
                  <Play className="h-4 w-4 mr-2" />
                  Test
                </Button>
                <Button variant="outline" onClick={handleRun}>
                  <Zap className="h-4 w-4 mr-2" />
                  Run
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button variant="default" onClick={handlePublish} disabled={!workflowId}>
                  <Upload className="h-4 w-4 mr-2" />
                  Publish
                </Button>
                {workflowId && versions.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                  >
                    <History className="h-4 w-4 mr-2" />
                    History ({versions.length})
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ReactFlow Canvas */}
        <Card className="flex-1">
          <CardContent className="p-0 h-full">
            <div className="h-full">
              <ReactFlow
                nodes={nodes.map((node) => ({
                  ...node,
                  style: {
                    ...node.style,
                    border: selectedNodeForConnection === node.id ? '3px solid #3b82f6' : undefined,
                    boxShadow: selectedNodeForConnection === node.id ? '0 0 10px rgba(59, 130, 246, 0.5)' : undefined,
                  },
                }))}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                onPaneClick={onPaneClick}
                onInit={setReactFlowInstance}
                nodeTypes={nodeTypes}
                fitView
                className={selectedTemplate ? "cursor-crosshair" : ""}
              >
              <Controls />
              <MiniMap />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
            </div>
          </CardContent>
        </Card>

        {/* Validation Panel */}
        {(validationErrors.length > 0 || validationWarnings.length > 0 || validationInfo.length > 0) && (
          <ValidationPanel
            errors={validationErrors}
            warnings={validationWarnings}
            info={validationInfo}
            onNodeClick={(nodeId) => {
              // Highlight the node by selecting it
              const node = nodes.find(n => n.id === nodeId);
              if (node && reactFlowInstance) {
                reactFlowInstance.fitView({ nodes: [node], duration: 500, padding: 0.5 });
              }
            }}
          />
        )}

        {/* Version History Panel */}
        {showVersionHistory && workflowId && (
          <VersionHistoryPanel
            versions={versions}
            onRollback={handleRollback}
            isLoading={rollbackMutation.isPending}
          />
        )}
      </div>

      {/* Block Configuration Modal */}
      {selectedNodeForConfig && (
        <BlockConfigModal
          isOpen={configModalOpen}
          onClose={() => {
            setConfigModalOpen(false);
            setSelectedNodeForConfig(null);
          }}
          onSave={(config) => {
            // Update the node with the new configuration
            setNodes((nds) =>
              nds.map((node) =>
                node.id === selectedNodeForConfig.id
                  ? { ...node, data: { ...node.data, config } }
                  : node
              )
            );
            toast.success("Block configuration saved");
          }}
          blockType={selectedNodeForConfig.id.split('-')[0] + '-' + selectedNodeForConfig.id.split('-')[1]}
          blockLabel={selectedNodeForConfig.data.label || "Block"}
          currentConfig={selectedNodeForConfig.data.config || {}}
        />
      )}
      </div>
    </div>
  );
}
