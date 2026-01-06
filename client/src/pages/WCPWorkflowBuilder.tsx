import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { 
  Save, 
  Play, 
  Upload, 
  Clock, 
  Webhook, 
  Database, 
  Mail, 
  Code, 
  MessageSquare,
  Bot,
  Menu,
  X,
  ArrowLeft,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// Block types for the palette
const blockTypes = [
  {
    category: "Triggers",
    blocks: [
      { id: "time_trigger", label: "Time Trigger", icon: Clock, color: "bg-blue-500" },
      { id: "webhook", label: "Webhook", icon: Webhook, color: "bg-green-500" },
    ],
  },
  {
    category: "Actions",
    blocks: [
      { id: "invoke_agent", label: "Invoke Agent", icon: Bot, color: "bg-purple-500" },
      { id: "database_query", label: "Database Query", icon: Database, color: "bg-yellow-500" },
      { id: "send_email", label: "Send Email", icon: Mail, color: "bg-red-500" },
      { id: "run_code", label: "Run Code", icon: Code, color: "bg-gray-500" },
      { id: "send_message", label: "Send Message", icon: MessageSquare, color: "bg-indigo-500" },
    ],
  },
];

function WCPWorkflowBuilderContent() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [workflowName, setWorkflowName] = useState("Untitled WCP Workflow");
  const [workflowId, setWorkflowId] = useState<number | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);

  // Get workflow ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const workflowIdParam = urlParams.get('id');

  // Load workflow data if ID is present
  const { data: workflowData, error: workflowError, isLoading: isQueryLoading } = trpc.wcpWorkflows.getWorkflow.useQuery(
    { id: parseInt(workflowIdParam || '0') },
    { enabled: !!workflowIdParam }
  );

  // Show error if workflow loading fails
  useEffect(() => {
    if (workflowError) {
      console.error('Workflow load error:', workflowError);
      toast({
        title: "Load Failed",
        description: workflowError.message || "Failed to load workflow data",
        variant: "destructive",
      });
    }
  }, [workflowError, toast]);

  // Load workflow data when available
  useEffect(() => {
    if (workflowData && !isLoadingWorkflow) {
      console.log('=== Loading workflow data ===');
      console.log('Workflow ID:', workflowData.id);
      console.log('Workflow Name:', workflowData.name);
      console.log('Nodes type:', typeof workflowData.nodes);
      console.log('Edges type:', typeof workflowData.edges);
      console.log('Nodes:', workflowData.nodes);
      console.log('Edges:', workflowData.edges);
      
      setIsLoadingWorkflow(true);
      setWorkflowId(workflowData.id);
      setWorkflowName(workflowData.name);
      
      // Server already returns parsed nodes/edges, no need to parse again
      setNodes(workflowData.nodes);
      setEdges(workflowData.edges);
      
      toast({
        title: "Workflow Loaded",
        description: `Loaded ${workflowData.name} successfully`,
      });
    }
  }, [workflowData, isLoadingWorkflow, setNodes, setEdges, toast]);

  const [selectedBlock, setSelectedBlock] = useState<{
    id: string;
    label: string;
    icon: any;
    color: string;
  } | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragStart = (event: React.DragEvent, blockType: string, label: string) => {
    event.dataTransfer.setData("application/reactflow", blockType);
    event.dataTransfer.setData("label", label);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      const label = event.dataTransfer.getData("label");

      if (!type) return;

      // Get the ReactFlow wrapper bounds
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 40,
      };

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type: "default",
        position,
        data: { label, blockType: type },
      };

      setNodes((nds) => nds.concat(newNode));
      
      // Close sidebar after adding block (mobile UX)
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Tap-to-place functionality for mobile
  const handleBlockSelect = (block: any) => {
    setSelectedBlock(block);
    setSidebarOpen(false);
    toast({
      title: "Block Selected",
      description: "Tap on the canvas to place the block",
    });
  };

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      if (!selectedBlock) return;

      // Get the ReactFlow wrapper bounds
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 40,
      };

      const newNode: Node = {
        id: `${selectedBlock.id}_${Date.now()}`,
        type: "default",
        position,
        data: { label: selectedBlock.label, blockType: selectedBlock.id },
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedBlock(null);
      
      toast({
        title: "Block Added",
        description: `${selectedBlock.label} added to canvas`,
      });
    },
    [selectedBlock, setNodes, toast]
  );

  const saveWorkflowMutation = trpc.wcpWorkflows.saveWorkflow.useMutation();
  const createExecutionMutation = trpc.wcpWorkflows.createExecution.useMutation();

  const handleSave = async () => {
    try {
      const result = await saveWorkflowMutation.mutateAsync({
        id: workflowId, // Pass existing ID for updates
        name: workflowName,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        status: "draft",
      });

      // Store the workflow ID after first save
      if (!workflowId && result.id) {
        setWorkflowId(result.id);
      }

      toast({
        title: "Workflow Saved",
        description: "WCP workflow compiled and saved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTest = () => {
    toast({
      title: "Test Started",
      description: "Workflow execution started in test mode",
    });
  };

  const handleRun = async () => {
    console.log('=== Run button clicked ===');
    console.log('Workflow ID:', workflowId);
    console.log('Workflow Name:', workflowName);
    
    // Save workflow first if not saved
    if (!workflowId) {
      console.error('No workflow ID - workflow not saved');
      toast({
        title: "Save Required",
        description: "Please save the workflow before running",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Calling createExecution mutation...');
      const result = await createExecutionMutation.mutateAsync({
        workflowId: workflowId,
        workflowName: workflowName,
      });
      console.log('Execution created:', result);

      toast({
        title: "Execution Started",
        description: `Running workflow "${workflowName}" (ID: ${workflowId})`,
      });
    } catch (error: any) {
      console.error('Run failed:', error);
      toast({
        title: "Run Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePublish = async () => {
    try {
      const result = await saveWorkflowMutation.mutateAsync({
        id: workflowId, // Pass existing ID for updates
        name: workflowName,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        status: "active",
      });

      // Store the workflow ID after first save
      if (!workflowId && result.id) {
        setWorkflowId(result.id);
      }

      toast({
        title: "Workflow Published",
        description: "WCP workflow is now active",
      });
    } catch (error: any) {
      toast({
        title: "Publish Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Custom Toolbar */}
      <div className="bg-background border-b p-2 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Back Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/wcp/executions")}
              className="shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            {/* Hamburger Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="shrink-0"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-32 sm:w-48 md:w-64 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-1 md:gap-2">
            <div className="hidden lg:block text-xs md:text-sm text-muted-foreground mr-2">
              {nodes.length} blocks • {edges.length} connections
            </div>
            <Button variant="outline" size="sm" onClick={handleTest}>
              <Play className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline text-xs">Test</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleRun}>
              <Zap className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline text-xs">Run</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline text-xs">Save</span>
            </Button>
            <Button size="sm" onClick={handlePublish}>
              <Upload className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline text-xs">Publish</span>
            </Button>
          </div>
        </div>
        
        {/* Selected block indicator for mobile */}
        {selectedBlock && (
          <div className="mt-2 p-2 bg-accent rounded-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${selectedBlock.color}`}>
                <selectedBlock.icon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-medium">{selectedBlock.label} selected</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedBlock(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Block Palette Sidebar */}
        <div
          className={`
            fixed md:relative inset-y-0 left-0 z-50
            w-64 bg-background border-r p-4 overflow-y-auto
            transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            top-[73px] md:top-0 md:translate-x-0
          `}
        >
          <h3 className="font-semibold mb-4">Blocks</h3>
          {blockTypes.map((category) => (
            <div key={category.category} className="mb-6">
              <h4 className="text-sm text-muted-foreground mb-2">{category.category}</h4>
              <div className="space-y-2">
                {category.blocks.map((block) => (
                  <Card
                    key={block.id}
                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                    draggable
                    onDragStart={(e) => onDragStart(e, block.id, block.label)}
                    onClick={() => handleBlockSelect(block)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded ${block.color}`}>
                        <block.icon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-medium">{block.label}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Overlay for mobile when sidebar is open */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden top-[73px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ReactFlow Canvas */}
        <div 
          className="flex-1 relative"
          onClick={handleCanvasClick}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap className="hidden md:block" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function WCPWorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WCPWorkflowBuilderContent />
    </ReactFlowProvider>
  );
}
