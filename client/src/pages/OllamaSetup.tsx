import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Download, Terminal, ExternalLink, RefreshCw } from "lucide-react";

type OS = "windows" | "macos" | "linux" | "unknown";

interface OllamaModel {
  name: string;
  size: string;
  description: string;
  recommended: boolean;
}

const RECOMMENDED_MODELS: OllamaModel[] = [
  {
    name: "llama2",
    size: "3.8GB",
    description: "Meta's Llama 2 model - great for general conversation and tasks",
    recommended: true,
  },
  {
    name: "mistral",
    size: "4.1GB",
    description: "Mistral 7B - excellent performance with good speed",
    recommended: true,
  },
  {
    name: "codellama",
    size: "3.8GB",
    description: "Specialized for code generation and programming tasks",
    recommended: false,
  },
  {
    name: "mixtral",
    size: "26GB",
    description: "Mixtral 8x7B - very powerful but requires more resources",
    recommended: false,
  },
];

export default function OllamaSetup() {
  const [os, setOS] = useState<OS>("unknown");
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [installedModels, setInstalledModels] = useState<string[]>([]);

  // Detect OS
  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes("win")) setOS("windows");
    else if (userAgent.includes("mac")) setOS("macos");
    else if (userAgent.includes("linux")) setOS("linux");
    else setOS("unknown");
  }, []);

  // Check Ollama connection
  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const response = await fetch("http://localhost:11434/api/tags");
      if (response.ok) {
        const data = await response.json();
        setIsConnected(true);
        setInstalledModels(data.models?.map((m: any) => m.name) || []);
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      setIsConnected(false);
    }
    setIsChecking(false);
  };

  useEffect(() => {
    checkConnection();
    // Check every 5 seconds
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const getInstallInstructions = () => {
    switch (os) {
      case "windows":
        return {
          title: "Windows Installation",
          steps: [
            "Download the Ollama installer from ollama.ai",
            "Run the downloaded .exe file",
            "Follow the installation wizard",
            "Ollama will start automatically after installation",
            "Verify installation by opening Command Prompt and typing: ollama --version",
          ],
          downloadUrl: "https://ollama.ai/download/windows",
        };
      case "macos":
        return {
          title: "macOS Installation",
          steps: [
            "Download Ollama for macOS from ollama.ai",
            "Open the downloaded .dmg file",
            "Drag Ollama to your Applications folder",
            "Launch Ollama from Applications",
            "Verify installation by opening Terminal and typing: ollama --version",
          ],
          downloadUrl: "https://ollama.ai/download/mac",
        };
      case "linux":
        return {
          title: "Linux Installation",
          steps: [
            "Open Terminal",
            "Run the installation script: curl -fsSL https://ollama.ai/install.sh | sh",
            "Wait for the installation to complete",
            "Start Ollama service: ollama serve",
            "Verify installation: ollama --version",
          ],
          downloadUrl: "https://ollama.ai/download/linux",
        };
      default:
        return {
          title: "Installation",
          steps: ["Visit ollama.ai to download the installer for your operating system"],
          downloadUrl: "https://ollama.ai",
        };
    }
  };

  const instructions = getInstallInstructions();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ollama Setup</h1>
        <p className="text-muted-foreground mt-2">
          Set up local AI models with Ollama for free, private inference
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connection Status</CardTitle>
              <CardDescription>Checking Ollama service on localhost:11434</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={checkConnection}
              disabled={isChecking}
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {isChecking ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Checking connection...</span>
              </>
            ) : isConnected ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-medium">Connected</span>
                <Badge variant="outline" className="ml-auto">
                  {installedModels.length} model{installedModels.length !== 1 ? "s" : ""} installed
                </Badge>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="font-medium">Not Connected</span>
                <span className="text-sm text-muted-foreground ml-2">
                  Ollama is not running or not installed
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installation Instructions */}
      {!isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>{instructions.title}</CardTitle>
            <CardDescription>Follow these steps to install Ollama</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3 list-decimal list-inside">
              {instructions.steps.map((step, index) => (
                <li key={index} className="text-sm">
                  {step}
                </li>
              ))}
            </ol>

            <div className="flex gap-2 pt-2">
              <Button asChild>
                <a href={instructions.downloadUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download Ollama
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href="https://github.com/ollama/ollama" target="_blank" rel="noopener noreferrer">
                  <Terminal className="mr-2 h-4 w-4" />
                  View Documentation
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </div>

            <Alert>
              <AlertDescription>
                After installation, Ollama will run in the background. This page will automatically detect when it's running.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Recommended Models */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Models</CardTitle>
            <CardDescription>
              Pull models to use with your agents. Recommended models are optimized for most use cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {RECOMMENDED_MODELS.map((model) => {
                const isInstalled = installedModels.some(m => m.startsWith(model.name));
                return (
                  <div
                    key={model.name}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {model.size}
                        </Badge>
                        {model.recommended && (
                          <Badge variant="default" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                        {isInstalled && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Installed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {model.description}
                      </p>
                    </div>
                    {!isInstalled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Show instructions to pull model
                          alert(`To install ${model.name}, open Terminal and run:\n\nollama pull ${model.name}\n\nThis will download the model. The page will automatically detect when it's ready.`);
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Pull Model
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <Alert className="mt-4">
              <Terminal className="h-4 w-4" />
              <AlertDescription>
                <strong>How to pull models:</strong> Open Terminal and run <code className="bg-muted px-1 py-0.5 rounded">ollama pull model-name</code>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
          <CardDescription>Common issues and solutions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Ollama not detected</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Make sure Ollama is installed and running</li>
                <li>Check if the Ollama service is running in the background</li>
                <li>Try restarting Ollama</li>
                <li>Verify port 11434 is not blocked by firewall</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Model download fails</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Check your internet connection</li>
                <li>Ensure you have enough disk space (models can be large)</li>
                <li>Try pulling a smaller model first</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Performance issues</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Smaller models (7B parameters) run faster on most hardware</li>
                <li>Close other applications to free up RAM</li>
                <li>Consider using quantized models for better performance</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
