import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { FileCode, Play, Save, FolderOpen, Plus, X } from "lucide-react";

interface EditorFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

export default function CodeEditor() {
  const [files, setFiles] = useState<EditorFile[]>([
    {
      id: "file-1",
      name: "example.ts",
      language: "typescript",
      content: `// Welcome to the Code Editor\n\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("World"));`,
    },
  ]);
  
  const [activeFileId, setActiveFileId] = useState("file-1");
  const [theme, setTheme] = useState<"vs-dark" | "light">("vs-dark");
  
  const activeFile = files.find((f) => f.id === activeFileId);
  
  const handleEditorChange = (value: string | undefined) => {
    if (!value || !activeFileId) return;
    
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: value } : f))
    );
  };
  
  const addNewFile = () => {
    const newFile: EditorFile = {
      id: `file-${Date.now()}`,
      name: "untitled.txt",
      language: "plaintext",
      content: "",
    };
    
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };
  
  const closeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    
    if (activeFileId === fileId) {
      const remainingFiles = files.filter((f) => f.id !== fileId);
      setActiveFileId(remainingFiles[0]?.id || "");
    }
  };
  
  const saveFile = () => {
    if (!activeFile) return;
    
    // In production, this would save to backend
    console.log("Saving file:", activeFile.name, activeFile.content);
    alert(`File "${activeFile.name}" saved successfully!`);
  };
  
  const runCode = () => {
    if (!activeFile) return;
    
    // In production, this would execute code in a sandbox
    console.log("Running code:", activeFile.content);
    alert("Code execution feature coming soon!");
  };
  
  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileCode className="h-8 w-8" />
            Code Editor
          </h1>
          <p className="text-muted-foreground">
            Multi-file code editor with syntax highlighting
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={theme} onValueChange={(v: any) => setTheme(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vs-dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={addNewFile}>
            <Plus className="h-4 w-4 mr-2" />
            New File
          </Button>
          
          <Button variant="outline" onClick={saveFile}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          
          <Button onClick={runCode}>
            <Play className="h-4 w-4 mr-2" />
            Run
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                  activeFileId === file.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
                onClick={() => setActiveFileId(file.id)}
              >
                <span className="text-sm font-medium">{file.name}</span>
                {files.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(file.id);
                    }}
                    className="hover:bg-background/20 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activeFile ? (
            <Editor
              height="600px"
              language={activeFile.language}
              value={activeFile.content}
              onChange={handleEditorChange}
              theme={theme}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: "on",
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          ) : (
            <div className="h-[600px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No files open</p>
                <Button variant="outline" className="mt-4" onClick={addNewFile}>
                  Create New File
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* File Properties */}
      {activeFile && (
        <Card>
          <CardHeader>
            <CardTitle>File Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">File Name</label>
                <Input
                  value={activeFile.name}
                  onChange={(e) =>
                    setFiles((prev) =>
                      prev.map((f) =>
                        f.id === activeFileId ? { ...f, name: e.target.value } : f
                      )
                    )
                  }
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <Select
                  value={activeFile.language}
                  onValueChange={(v) =>
                    setFiles((prev) =>
                      prev.map((f) =>
                        f.id === activeFileId ? { ...f, language: v } : f
                      )
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="css">CSS</SelectItem>
                    <SelectItem value="plaintext">Plain Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Lines: {activeFile.content.split("\n").length} • Characters: {activeFile.content.length}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
