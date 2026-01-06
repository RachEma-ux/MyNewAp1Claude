import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema.js";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { schema, mode: "default" });

const templates = [
  {
    name: "Daily Report Workflow",
    description: "Automatically generate and send daily reports with key metrics and insights",
    category: "productivity",
    icon: "FileText",
    tags: ["reporting", "automation", "daily"],
    workflowDefinition: {
      nodes: [
        {
          id: "trigger-1",
          type: "time-trigger",
          position: { x: 100, y: 100 },
          data: { label: "Daily at 9 AM", config: { schedule: "0 9 * * *", timezone: "UTC" } }
        },
        {
          id: "action-1",
          type: "database-query",
          position: { x: 300, y: 100 },
          data: { label: "Fetch Metrics", config: { query: "SELECT * FROM metrics WHERE date = CURDATE()", database: "default" } }
        },
        {
          id: "action-2",
          type: "ai-processing",
          position: { x: 500, y: 100 },
          data: { label: "Generate Summary", config: { prompt: "Summarize these metrics", model: "gpt-4" } }
        },
        {
          id: "action-3",
          type: "send-email",
          position: { x: 700, y: 100 },
          data: { label: "Send Report", config: { to: "team@company.com", subject: "Daily Report", body: "{{summary}}" } }
        }
      ],
      edges: [
        { id: "e1-2", source: "trigger-1", target: "action-1" },
        { id: "e2-3", source: "action-1", target: "action-2" },
        { id: "e3-4", source: "action-2", target: "action-3" }
      ]
    },
    isPublic: true,
    createdBy: 1
  },
  {
    name: "Data Sync Workflow",
    description: "Synchronize data between databases and external APIs automatically",
    category: "data",
    icon: "RefreshCw",
    tags: ["sync", "database", "api"],
    workflowDefinition: {
      nodes: [
        {
          id: "trigger-1",
          type: "time-trigger",
          position: { x: 100, y: 100 },
          data: { label: "Every Hour", config: { schedule: "0 * * * *", timezone: "UTC" } }
        },
        {
          id: "action-1",
          type: "database-query",
          position: { x: 300, y: 100 },
          data: { label: "Fetch New Records", config: { query: "SELECT * FROM orders WHERE synced = 0", database: "default" } }
        },
        {
          id: "action-2",
          type: "run-code",
          position: { x: 500, y: 100 },
          data: { label: "Transform Data", config: { language: "javascript", code: "return data.map(r => ({ id: r.id, total: r.amount }))" } }
        },
        {
          id: "action-3",
          type: "database-query",
          position: { x: 700, y: 100 },
          data: { label: "Update Sync Status", config: { query: "UPDATE orders SET synced = 1 WHERE id IN ({{ids}})", database: "default" } }
        }
      ],
      edges: [
        { id: "e1-2", source: "trigger-1", target: "action-1" },
        { id: "e2-3", source: "action-1", target: "action-2" },
        { id: "e3-4", source: "action-2", target: "action-3" }
      ]
    },
    isPublic: true,
    createdBy: 1
  },
  {
    name: "Alert Notification Workflow",
    description: "Monitor system metrics and send alerts when thresholds are exceeded",
    category: "monitoring",
    icon: "Bell",
    tags: ["alerts", "monitoring", "notifications"],
    workflowDefinition: {
      nodes: [
        {
          id: "trigger-1",
          type: "time-trigger",
          position: { x: 100, y: 100 },
          data: { label: "Every 5 Minutes", config: { schedule: "*/5 * * * *", timezone: "UTC" } }
        },
        {
          id: "action-1",
          type: "database-query",
          position: { x: 300, y: 100 },
          data: { label: "Check Metrics", config: { query: "SELECT * FROM system_metrics WHERE value > threshold", database: "default" } }
        },
        {
          id: "action-2",
          type: "send-message",
          position: { x: 500, y: 100 },
          data: { label: "Send Alert", config: { channel: "slack", message: "⚠️ Alert: {{metric}} exceeded threshold!" } }
        }
      ],
      edges: [
        { id: "e1-2", source: "trigger-1", target: "action-1" },
        { id: "e2-3", source: "action-1", target: "action-2" }
      ]
    },
    isPublic: true,
    createdBy: 1
  }
];

console.log("Seeding workflow templates...");

for (const template of templates) {
  await db.insert(schema.workflowTemplates).values(template);
  console.log(`✓ Created template: ${template.name}`);
}

console.log("✓ All templates seeded successfully!");

await connection.end();
