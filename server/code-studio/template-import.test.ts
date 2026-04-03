import { describe, expect, it } from "vitest";
import { getAuditJobTemplateDefinition, renderTemplate } from "./repository";
import { parseTemplateImportFile } from "./template-import";

describe("Code Studio template import", () => {
  it("parses JSON template files", () => {
    const templates = parseTemplateImportFile(
      "templates.json",
      JSON.stringify({
        templates: [
          {
            name: "Audit Job",
            description: "Audit prompt",
            titleTemplate: "Audit Job",
            objectiveTemplate: "Target prompt to audit:\n{{targetPrompt}}",
            defaultPriority: "normal",
            variableSchema: [
              {
                key: "targetPrompt",
                label: "Target prompt to audit",
                type: "long_text",
                required: true,
              },
            ],
          },
        ],
      })
    );

    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Audit Job");
    expect(templates[0].variableSchema?.[0]?.type).toBe("long_text");
  });

  it("parses YAML template files", () => {
    const templates = parseTemplateImportFile(
      "templates.yaml",
      `templates:
  - name: Audit Job
    description: Audit prompt
    titleTemplate: Audit Job
    objectiveTemplate: |
      Target prompt to audit:
      {{targetPrompt}}
    defaultPriority: normal
    variableSchema:
      - key: targetPrompt
        label: Target prompt to audit
        type: long_text
        required: true
`
    );

    expect(templates).toHaveLength(1);
    expect(templates[0].objectiveTemplate).toContain("{{targetPrompt}}");
  });

  it("rejects invalid template files with a usable error", () => {
    expect(() =>
      parseTemplateImportFile(
        "broken.json",
        JSON.stringify({
          templates: [{ description: "Missing name" }],
        })
      )
    ).toThrow(/Template file is invalid/i);
  });
});

describe("Code Studio template rendering", () => {
  it("preserves multiline input during interpolation", () => {
    const rendered = renderTemplate(
      "Target prompt to audit:\n{{targetPrompt}}",
      {
        targetPrompt: "Line 1\nLine 2",
      }
    );

    expect(rendered).toBe("Target prompt to audit:\nLine 1\nLine 2");
  });

  it("defines the built-in Audit Job template with the required multiline field", () => {
    const template = getAuditJobTemplateDefinition();
    const targetPromptField = template.variableSchema.find(
      field => field.key === "targetPrompt"
    );

    expect(template.name).toBe("Audit Job");
    expect(template.titleTemplate).toBe("Audit Job");
    expect(template.objectiveTemplate).toContain("Target prompt to audit:");
    expect(targetPromptField).toMatchObject({
      label: "Target prompt to audit",
      type: "long_text",
      required: true,
    });
  });
});
