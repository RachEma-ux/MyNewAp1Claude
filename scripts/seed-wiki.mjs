import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const connection = await createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'app_db',
});

// Wiki Categories
const categories = [
  {
    name: 'Getting Started',
    description: 'Learn the basics and get up and running',
    icon: 'Rocket',
    order: 1,
  },
  {
    name: 'Agent Governance',
    description: 'Understand agent management and governance',
    icon: 'Shield',
    order: 2,
  },
  {
    name: 'Workflow Automation',
    description: 'Create and manage automated workflows',
    icon: 'Zap',
    order: 3,
  },
  {
    name: 'API Reference',
    description: 'API documentation and integration guides',
    icon: 'Code',
    order: 4,
  },
  {
    name: 'Troubleshooting',
    description: 'Common issues and solutions',
    icon: 'AlertCircle',
    order: 5,
  },
  {
    name: 'FAQ',
    description: 'Frequently asked questions',
    icon: 'HelpCircle',
    order: 6,
  },
];

// Wiki Pages
const pages = [
  {
    title: 'Welcome to the Wiki',
    slug: 'welcome',
    categoryName: 'Getting Started',
    content: `# Welcome to the Wiki

This is your comprehensive guide to using the application. Whether you're just getting started or looking for advanced features, you'll find everything you need here.

## Quick Navigation

- **Getting Started**: Learn the basics
- **Agent Governance**: Understand agent management
- **Workflow Automation**: Create automated workflows
- **API Reference**: Integration documentation
- **Troubleshooting**: Solve common issues
- **FAQ**: Quick answers to common questions

## What's New?

Check back regularly for updates and new content.`,
    isPublished: true,
  },
  {
    title: 'Getting Started Guide',
    slug: 'getting-started',
    categoryName: 'Getting Started',
    content: `# Getting Started Guide

Welcome! This guide will help you get started with the application in just a few minutes.

## Step 1: Create Your Account

First, create your account by signing up on the platform.

## Step 2: Explore the Dashboard

Once logged in, you'll see your dashboard. Here you can:
- View your recent projects
- Access your workflows
- Manage your agents
- Monitor your resources

## Step 3: Create Your First Workflow

Navigate to the Automation section and click "Create Workflow" to get started with your first automation.

## Step 4: Learn More

Explore the other sections of the wiki to learn about advanced features.`,
    isPublished: true,
  },
  {
    title: 'Agent Governance Overview',
    slug: 'agent-governance-overview',
    categoryName: 'Agent Governance',
    content: `# Agent Governance Overview

Agent governance is the framework for managing, monitoring, and controlling agents in your system.

## Key Concepts

### Agent Roles
Agents can have different roles and permissions:
- **Admin**: Full system access
- **User**: Standard access with limitations
- **Viewer**: Read-only access

### Permissions
Control what agents can do:
- Create workflows
- Execute workflows
- Manage other agents
- Access sensitive data

### Monitoring
Track agent activity:
- Execution logs
- Performance metrics
- Error tracking
- Resource usage

## Best Practices

1. Use role-based access control
2. Regularly audit agent permissions
3. Monitor agent performance
4. Document governance policies`,
    isPublished: true,
  },
  {
    title: 'Creating Your First Workflow',
    slug: 'creating-first-workflow',
    categoryName: 'Workflow Automation',
    content: `# Creating Your First Workflow

Workflows automate repetitive tasks and complex processes.

## Workflow Components

### Triggers
Events that start your workflow:
- **Time Trigger**: Run on a schedule
- **Webhook**: Run when an event occurs
- **Manual**: Run on demand

### Actions
Tasks your workflow performs:
- **Database Query**: Query your database
- **Send Email**: Send email notifications
- **Run Code**: Execute custom code
- **AI Processing**: Use AI to process data

### Connections
Link triggers and actions together to create your workflow.

## Creating a Workflow

1. Go to Automation > Workflows
2. Click "Create Workflow"
3. Add a trigger
4. Add actions
5. Connect them together
6. Test your workflow
7. Publish when ready

## Tips

- Start simple with one trigger and one action
- Test thoroughly before publishing
- Monitor execution logs
- Use version history to track changes`,
    isPublished: true,
  },
  {
    title: 'API Reference',
    slug: 'api-reference',
    categoryName: 'API Reference',
    content: `# API Reference

The API allows you to programmatically interact with the system.

## Authentication

All API requests require authentication using your API key:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Base URL

\`\`\`
https://api.example.com/v1
\`\`\`

## Common Endpoints

### Workflows
- \`GET /workflows\` - List workflows
- \`POST /workflows\` - Create workflow
- \`GET /workflows/:id\` - Get workflow
- \`PUT /workflows/:id\` - Update workflow
- \`DELETE /workflows/:id\` - Delete workflow

### Executions
- \`GET /executions\` - List executions
- \`POST /workflows/:id/execute\` - Execute workflow
- \`GET /executions/:id\` - Get execution details

## Error Handling

All errors return a standard error response:

\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
\`\`\``,
    isPublished: true,
  },
  {
    title: 'Common Issues and Solutions',
    slug: 'troubleshooting',
    categoryName: 'Troubleshooting',
    content: `# Troubleshooting Guide

## Common Issues

### Workflow Not Executing

**Problem**: Your workflow doesn't execute when expected.

**Solutions**:
1. Check the trigger configuration
2. Verify the trigger is enabled
3. Check execution logs for errors
4. Ensure all required fields are filled

### Database Connection Error

**Problem**: Cannot connect to database.

**Solutions**:
1. Verify database credentials
2. Check network connectivity
3. Ensure database is running
4. Check firewall rules

### Permission Denied

**Problem**: Getting permission denied errors.

**Solutions**:
1. Check your user role
2. Verify resource permissions
3. Contact your administrator
4. Check API key permissions

## Getting Help

If you can't find a solution:
1. Check the FAQ section
2. Search the wiki
3. Contact support
4. Check system logs`,
    isPublished: true,
  },
  {
    title: 'Frequently Asked Questions',
    slug: 'faq',
    categoryName: 'FAQ',
    content: `# Frequently Asked Questions

## General Questions

### Q: What is this application?
A: This is a comprehensive automation and agent management platform.

### Q: How do I get started?
A: See the "Getting Started Guide" in the Getting Started section.

### Q: Is there a free trial?
A: Yes, we offer a 14-day free trial with full access to all features.

## Workflow Questions

### Q: How many workflows can I create?
A: There's no limit to the number of workflows you can create.

### Q: Can I schedule workflows?
A: Yes, use the Time Trigger to schedule workflows.

### Q: Can I share workflows with others?
A: Yes, use the sharing feature to grant access to other users.

## Agent Questions

### Q: What is an agent?
A: An agent is an autonomous entity that can perform tasks and make decisions.

### Q: How do I create an agent?
A: Go to Agents section and click "Create Agent".

### Q: Can agents communicate with each other?
A: Yes, agents can communicate through the messaging system.

## Support

For more questions, contact our support team.`,
    isPublished: true,
  },
];

try {
  // Insert categories
  console.log('Inserting wiki categories...');
  for (const category of categories) {
    await connection.execute(
      'INSERT INTO wiki_categories (name, description, icon, \`order\`) VALUES (?, ?, ?, ?)',
      [category.name, category.description, category.icon, category.order]
    );
  }
  console.log(`✓ Inserted ${categories.length} categories`);

  // Get category IDs
  const [categoryRows] = await connection.execute('SELECT id, name FROM wiki_categories');
  const categoryMap = {};
  categoryRows.forEach((row) => {
    categoryMap[row.name] = row.id;
  });

  // Insert pages
  console.log('Inserting wiki pages...');
  for (const page of pages) {
    const categoryId = categoryMap[page.categoryName];
    await connection.execute(
      'INSERT INTO wiki_pages (title, slug, content, categoryId, version, isPublished) VALUES (?, ?, ?, ?, ?, ?)',
      [page.title, page.slug, page.content, categoryId, 1, page.isPublished ? 1 : 0]
    );
  }
  console.log(`✓ Inserted ${pages.length} pages`);

  console.log('\n✓ Wiki content seeded successfully!');
} catch (error) {
  console.error('Error seeding wiki:', error);
  process.exit(1);
} finally {
  await connection.end();
}
