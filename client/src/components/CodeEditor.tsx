/**
 * Code Editor Component
 * Monaco-based code editor with syntax highlighting and IntelliSense
 */

import { useState, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Download, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CodeEditorProps {
  defaultValue?: string;
  defaultLanguage?: string;
  height?: string;
  theme?: "vs-dark" | "light";
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: (value: string) => void;
}

export function CodeEditor({
  defaultValue = "",
  defaultLanguage = "javascript",
  height = "600px",
  theme = "vs-dark",
  readOnly = false,
  onChange,
  onSave,
}: CodeEditorProps) {
  const [language, setLanguage] = useState(defaultLanguage);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;

    // Configure Monaco
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      typeRoots: ["node_modules/@types"],
    });

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) {
        const value = editor.getValue();
        onSave(value);
        toast.success("Saved");
      }
    });
  };

  const handleCopy = () => {
    const value = editorRef.current?.getValue();
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const value = editorRef.current?.getValue();
    if (value) {
      const blob = new Blob([value], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `code.${getFileExtension(language)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    }
  };

  const handleSave = () => {
    if (onSave) {
      const value = editorRef.current?.getValue();
      if (value) {
        onSave(value);
        toast.success("Saved");
      }
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Language:</span>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="css">CSS</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
              <SelectItem value="yaml">YAML</SelectItem>
              <SelectItem value="sql">SQL</SelectItem>
              <SelectItem value="shell">Shell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
          {onSave && !readOnly && (
            <Button variant="default" size="sm" onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          )}
        </div>
      </div>

      <Editor
        height={height}
        language={language}
        value={defaultValue}
        theme={theme}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: "on",
          roundedSelection: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
          glyphMargin: false,
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
          },
        }}
      />
    </Card>
  );
}

function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    json: "json",
    html: "html",
    css: "css",
    markdown: "md",
    yaml: "yaml",
    sql: "sql",
    shell: "sh",
  };

  return extensions[language] || "txt";
}
