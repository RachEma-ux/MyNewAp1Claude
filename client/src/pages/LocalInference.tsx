import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Zap, MessageSquare, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function LocalInference() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  
  // Fetch hardware capabilities
  const { data: hardware } = trpc.inference.getHardwareCapabilities.useQuery();
  
  // Fetch loaded models
  const { data: loadedModels } = trpc.inference.getLoadedModels.useQuery();
  
  // Infer mutation
  const inferMutation = trpc.inference.infer.useMutation();
  
  const handleSendMessage = async () => {
    if (!input.trim() || !loadedModels || loadedModels.length === 0) return;
    
    const userMessage = { role: "user" as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsInferring(true);
    
    try {
      const response = await inferMutation.mutateAsync({
        modelId: loadedModels[0].modelId, // Use first loaded model
        messages: [...messages, userMessage],
        temperature: 0.7,
        maxTokens: 512,
      });
      
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.choices[0]?.message.content || "No response" },
      ]);
    } catch (error) {
      console.error("Inference error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to generate response" },
      ]);
    } finally {
      setIsInferring(false);
    }
  };
  
  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Local Inference</h1>
        <p className="text-muted-foreground">
          Run AI models locally on your hardware for privacy-focused inference
        </p>
      </div>
      
      {/* Hardware Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Hardware Status
          </CardTitle>
          <CardDescription>Current system capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          {hardware ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">CPU</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {hardware.cpu.architecture}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hardware.cpu.cores} cores • {hardware.cpu.threads} threads
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">GPU</span>
                </div>
                {hardware.gpu && hardware.gpu.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {hardware.gpu[0].name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      VRAM: {hardware.gpu[0]?.vram || 'N/A'}
                    </p>
                  </>
                ) : (
                  <Badge variant="secondary">No GPU Detected</Badge>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {(hardware.memory.total / (1024 ** 3)).toFixed(1)} GB Total
                </p>
                <p className="text-xs text-muted-foreground">
                  {(hardware.memory.available / (1024 ** 3)).toFixed(1)} GB Available
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Loading hardware info...</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Loaded Models */}
      <Card>
        <CardHeader>
          <CardTitle>Loaded Models</CardTitle>
          <CardDescription>Models currently loaded in memory</CardDescription>
        </CardHeader>
        <CardContent>
          {loadedModels && loadedModels.length > 0 ? (
            <div className="space-y-2">
              {loadedModels.map((model) => (
                <div key={model.modelId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{model.modelId}</p>
                    <p className="text-sm text-muted-foreground">Ready for inference</p>
                  </div>
                  <Badge variant="default">Loaded</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                No models loaded. Download and load a model from the Model Browser to start.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/models/browser"}>
                Browse Models
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Chat Interface */}
      {loadedModels && loadedModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Local Chat
            </CardTitle>
            <CardDescription>
              Chat with your locally loaded model (privacy-focused, no data sent to cloud)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Messages */}
            <div className="border rounded-lg p-4 h-96 overflow-y-auto space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Start a conversation with your local model</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {isInferring && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Generating response...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Input */}
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isInferring}
                className="self-end"
              >
                {isInferring ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
