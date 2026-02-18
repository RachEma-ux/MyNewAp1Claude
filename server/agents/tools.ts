/**
 * Agent Tool System
 * Provides a registry of tools that agents can use to perform actions
 */

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>) => Promise<string>;
}

/**
 * Tool Registry - manages available tools
 */
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, params: Record<string, any>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Validate required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    return tool.execute(params);
  }
}

// Global tool registry
const globalToolRegistry = new ToolRegistry();

export function getToolRegistry(): ToolRegistry {
  return globalToolRegistry;
}

// ============================================================================
// Built-in Tools
// ============================================================================

/**
 * Calculator Tool - performs mathematical calculations
 */
const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Performs mathematical calculations. Supports basic arithmetic, trigonometry, and more.',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sin(45)", "sqrt(16)")',
      required: true,
    },
  ],
  execute: async (params) => {
    try {
      const expression = params.expression as string;

      // Safe math evaluator — only allows numbers, operators, parens, and Math functions
      const sanitized = expression.replace(/\s+/g, "");
      if (!/^[0-9+\-*/().,%^a-zA-Z]+$/.test(sanitized)) {
        return "Error: Expression contains invalid characters";
      }
      // Block anything that isn't a known Math function or number
      const dangerous = /[;{}\[\]`$\\'"=!<>?&|~]|function|return|import|require|process|global|this|window|eval|Function/;
      if (dangerous.test(expression)) {
        return "Error: Expression contains disallowed keywords";
      }

      // Map common math names to Math.* and evaluate safely
      const mathExpr = expression
        .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|ceil|floor|round|log|log2|log10|exp|pow|min|max|PI|E)\b/g,
          (m) => `Math.${m}`);
      const result = new Function(`"use strict"; return (${mathExpr})`)();

      return `Result: ${result}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Calculation failed'}`;
    }
  },
};

/**
 * Current Time Tool - gets the current date and time
 */
const currentTimeTool: Tool = {
  name: 'current_time',
  description: 'Gets the current date and time in various formats.',
  parameters: [
    {
      name: 'format',
      type: 'string',
      description: 'Format: "iso" (ISO 8601), "unix" (Unix timestamp), "human" (human-readable)',
      required: false,
      default: 'human',
    },
    {
      name: 'timezone',
      type: 'string',
      description: 'Timezone (e.g., "UTC", "America/New_York"). Defaults to local timezone.',
      required: false,
    },
  ],
  execute: async (params) => {
    const format = (params.format as string) || 'human';
    const now = new Date();

    switch (format) {
      case 'iso':
        return `Current time (ISO): ${now.toISOString()}`;
      case 'unix':
        return `Current time (Unix): ${Math.floor(now.getTime() / 1000)}`;
      case 'human':
      default:
        return `Current time: ${now.toLocaleString()}`;
    }
  },
};

/**
 * Text Analysis Tool - analyzes text properties
 */
const textAnalysisTool: Tool = {
  name: 'text_analysis',
  description: 'Analyzes text and provides statistics like word count, character count, and reading time.',
  parameters: [
    {
      name: 'text',
      type: 'string',
      description: 'Text to analyze',
      required: true,
    },
  ],
  execute: async (params) => {
    const text = params.text as string;
    
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = text.length;
    const charCountNoSpaces = text.replace(/\s/g, '').length;
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const readingTimeMinutes = Math.ceil(wordCount / 200); // Average reading speed: 200 words/min

    return `Text Analysis:
- Words: ${wordCount}
- Characters: ${charCount} (${charCountNoSpaces} without spaces)
- Sentences: ${sentenceCount}
- Estimated reading time: ${readingTimeMinutes} minute${readingTimeMinutes !== 1 ? 's' : ''}`;
  },
};

/**
 * JSON Parser Tool - parses and validates JSON
 */
const jsonParserTool: Tool = {
  name: 'json_parser',
  description: 'Parses JSON strings and validates their structure. Can also extract specific fields.',
  parameters: [
    {
      name: 'json_string',
      type: 'string',
      description: 'JSON string to parse',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Optional JSON path to extract (e.g., "user.name")',
      required: false,
    },
  ],
  execute: async (params) => {
    try {
      const jsonString = params.json_string as string;
      const parsed = JSON.parse(jsonString);
      
      if (params.path) {
        const path = (params.path as string).split('.');
        let value = parsed;
        
        for (const key of path) {
          value = value[key];
          if (value === undefined) {
            return `Error: Path "${params.path}" not found in JSON`;
          }
        }
        
        return `Value at "${params.path}": ${JSON.stringify(value, null, 2)}`;
      }
      
      return `Parsed JSON:\n${JSON.stringify(parsed, null, 2)}`;
    } catch (error) {
      return `Error: Invalid JSON - ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * URL Parser Tool - parses and extracts information from URLs
 */
const urlParserTool: Tool = {
  name: 'url_parser',
  description: 'Parses URLs and extracts components like protocol, host, path, and query parameters.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'URL to parse',
      required: true,
    },
  ],
  execute: async (params) => {
    try {
      const urlString = params.url as string;
      const url = new URL(urlString);
      
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      return `URL Components:
- Protocol: ${url.protocol}
- Host: ${url.host}
- Hostname: ${url.hostname}
- Port: ${url.port || '(default)'}
- Path: ${url.pathname}
- Query: ${url.search || '(none)'}
- Hash: ${url.hash || '(none)'}
- Query Parameters: ${JSON.stringify(queryParams, null, 2)}`;
    } catch (error) {
      return `Error: Invalid URL - ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

// Register all built-in tools
globalToolRegistry.register(calculatorTool);
globalToolRegistry.register(currentTimeTool);
globalToolRegistry.register(textAnalysisTool);
globalToolRegistry.register(jsonParserTool);
globalToolRegistry.register(urlParserTool);

console.log(`[ToolRegistry] Initialized with ${globalToolRegistry.list().length} built-in tools`);
