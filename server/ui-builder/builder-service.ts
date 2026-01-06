/**
 * UI Builder Service
 * Visual interface builder for creating custom UIs
 */

export interface UIComponent {
  id: string;
  type: string;
  props: Record<string, any>;
  children: UIComponent[];
  styles?: Record<string, any>;
}

export interface UIPage {
  id: string;
  name: string;
  path: string;
  components: UIComponent[];
  metadata: {
    title: string;
    description?: string;
    layout?: "full" | "centered" | "sidebar";
  };
  createdAt: number;
  updatedAt: number;
}

export interface UIProject {
  id: string;
  name: string;
  description: string;
  pages: UIPage[];
  theme: UITheme;
  createdAt: number;
  updatedAt: number;
}

export interface UITheme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  spacing: {
    unit: number;
  };
}

/**
 * UI Builder Service
 */
class UIBuilderService {
  private projects: Map<string, UIProject> = new Map();
  private componentLibrary: Map<string, ComponentDefinition> = new Map();
  
  constructor() {
    this.initializeComponentLibrary();
  }
  
  /**
   * Initialize component library
   */
  private initializeComponentLibrary(): void {
    // Register built-in components
    this.registerComponent({
      type: "container",
      name: "Container",
      category: "layout",
      props: {
        padding: { type: "number", default: 16 },
        gap: { type: "number", default: 8 },
        direction: { type: "select", options: ["row", "column"], default: "column" },
      },
      acceptsChildren: true,
    });
    
    this.registerComponent({
      type: "text",
      name: "Text",
      category: "content",
      props: {
        content: { type: "string", default: "Text" },
        size: { type: "select", options: ["sm", "md", "lg", "xl"], default: "md" },
        weight: { type: "select", options: ["normal", "bold"], default: "normal" },
      },
      acceptsChildren: false,
    });
    
    this.registerComponent({
      type: "button",
      name: "Button",
      category: "input",
      props: {
        label: { type: "string", default: "Button" },
        variant: { type: "select", options: ["primary", "secondary", "outline"], default: "primary" },
        size: { type: "select", options: ["sm", "md", "lg"], default: "md" },
        onClick: { type: "action", default: null },
      },
      acceptsChildren: false,
    });
    
    this.registerComponent({
      type: "input",
      name: "Input",
      category: "input",
      props: {
        placeholder: { type: "string", default: "" },
        type: { type: "select", options: ["text", "email", "password", "number"], default: "text" },
        value: { type: "string", default: "" },
      },
      acceptsChildren: false,
    });
    
    this.registerComponent({
      type: "card",
      name: "Card",
      category: "layout",
      props: {
        title: { type: "string", default: "Card Title" },
        padding: { type: "number", default: 16 },
      },
      acceptsChildren: true,
    });
  }
  
  /**
   * Register component definition
   */
  registerComponent(definition: ComponentDefinition): void {
    this.componentLibrary.set(definition.type, definition);
  }
  
  /**
   * Get component library
   */
  getComponentLibrary(): ComponentDefinition[] {
    return Array.from(this.componentLibrary.values());
  }
  
  /**
   * Create UI project
   */
  createProject(name: string, description: string): UIProject {
    const project: UIProject = {
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      pages: [],
      theme: {
        colors: {
          primary: "#3B82F6",
          secondary: "#8B5CF6",
          background: "#FFFFFF",
          text: "#1F2937",
        },
        fonts: {
          heading: "Inter",
          body: "Inter",
        },
        spacing: {
          unit: 8,
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.projects.set(project.id, project);
    
    console.log(`[UIBuilder] Created project: ${project.name}`);
    
    return project;
  }
  
  /**
   * Add page to project
   */
  addPage(projectId: string, name: string, path: string): UIPage | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    
    const page: UIPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      path,
      components: [],
      metadata: {
        title: name,
        layout: "full",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    project.pages.push(page);
    project.updatedAt = Date.now();
    
    return page;
  }
  
  /**
   * Add component to page
   */
  addComponent(
    projectId: string,
    pageId: string,
    componentType: string,
    parentId?: string
  ): UIComponent | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    
    const page = project.pages.find((p) => p.id === pageId);
    if (!page) return null;
    
    const definition = this.componentLibrary.get(componentType);
    if (!definition) return null;
    
    const component: UIComponent = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: componentType,
      props: this.getDefaultProps(definition),
      children: [],
    };
    
    if (parentId) {
      const parent = this.findComponent(page.components, parentId);
      if (parent) {
        parent.children.push(component);
      }
    } else {
      page.components.push(component);
    }
    
    page.updatedAt = Date.now();
    project.updatedAt = Date.now();
    
    return component;
  }
  
  /**
   * Update component props
   */
  updateComponent(
    projectId: string,
    pageId: string,
    componentId: string,
    props: Record<string, any>
  ): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    
    const page = project.pages.find((p) => p.id === pageId);
    if (!page) return false;
    
    const component = this.findComponent(page.components, componentId);
    if (!component) return false;
    
    Object.assign(component.props, props);
    
    page.updatedAt = Date.now();
    project.updatedAt = Date.now();
    
    return true;
  }
  
  /**
   * Delete component
   */
  deleteComponent(projectId: string, pageId: string, componentId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    
    const page = project.pages.find((p) => p.id === pageId);
    if (!page) return false;
    
    page.components = this.removeComponent(page.components, componentId);
    
    page.updatedAt = Date.now();
    project.updatedAt = Date.now();
    
    return true;
  }
  
  /**
   * Export project to code
   */
  exportToCode(projectId: string): string | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    
    // Generate React code
    let code = `// Generated by UI Builder\n\n`;
    
    project.pages.forEach((page) => {
      code += `export function ${this.toPascalCase(page.name)}() {\n`;
      code += `  return (\n`;
      code += this.generateComponentCode(page.components, 2);
      code += `  );\n`;
      code += `}\n\n`;
    });
    
    return code;
  }
  
  /**
   * Generate component code
   */
  private generateComponentCode(components: UIComponent[], indent: number): string {
    const spaces = " ".repeat(indent * 2);
    let code = "";
    
    components.forEach((component) => {
      code += `${spaces}<${this.toPascalCase(component.type)}`;
      
      // Add props
      Object.entries(component.props).forEach(([key, value]) => {
        if (typeof value === "string") {
          code += ` ${key}="${value}"`;
        } else {
          code += ` ${key}={${JSON.stringify(value)}}`;
        }
      });
      
      if (component.children.length > 0) {
        code += `>\n`;
        code += this.generateComponentCode(component.children, indent + 1);
        code += `${spaces}</${this.toPascalCase(component.type)}>\n`;
      } else {
        code += ` />\n`;
      }
    });
    
    return code;
  }
  
  /**
   * Helper: Find component by ID
   */
  private findComponent(components: UIComponent[], id: string): UIComponent | null {
    for (const component of components) {
      if (component.id === id) return component;
      
      const found = this.findComponent(component.children, id);
      if (found) return found;
    }
    
    return null;
  }
  
  /**
   * Helper: Remove component by ID
   */
  private removeComponent(components: UIComponent[], id: string): UIComponent[] {
    return components
      .filter((c) => c.id !== id)
      .map((c) => ({
        ...c,
        children: this.removeComponent(c.children, id),
      }));
  }
  
  /**
   * Helper: Get default props from definition
   */
  private getDefaultProps(definition: ComponentDefinition): Record<string, any> {
    const props: Record<string, any> = {};
    
    Object.entries(definition.props).forEach(([key, prop]) => {
      props[key] = prop.default;
    });
    
    return props;
  }
  
  /**
   * Helper: Convert to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  }
  
  /**
   * Get project
   */
  getProject(projectId: string): UIProject | undefined {
    return this.projects.get(projectId);
  }
  
  /**
   * List projects
   */
  listProjects(): UIProject[] {
    return Array.from(this.projects.values());
  }
}

interface ComponentDefinition {
  type: string;
  name: string;
  category: string;
  props: Record<string, PropDefinition>;
  acceptsChildren: boolean;
}

interface PropDefinition {
  type: "string" | "number" | "boolean" | "select" | "action";
  default: any;
  options?: string[];
}

export const uiBuilderService = new UIBuilderService();
