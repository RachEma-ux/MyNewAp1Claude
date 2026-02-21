import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client(process.env.DATABASE_URL || 'postgresql://localhost/app');
await client.connect();

// Wiki Categories
const categories = [
  { name: 'Getting Started', description: 'Learn the basics and get up and running', icon: 'Rocket', order: 1 },
  { name: 'Agent Governance', description: 'Understand agent management and governance', icon: 'Shield', order: 2 },
  { name: 'Workflow Automation', description: 'Create and manage automated workflows', icon: 'Zap', order: 3 },
  { name: 'API Reference', description: 'API documentation and integration guides', icon: 'Code', order: 4 },
  { name: 'Troubleshooting', description: 'Common issues and solutions', icon: 'AlertCircle', order: 5 },
  { name: 'FAQ', description: 'Frequently asked questions', icon: 'HelpCircle', order: 6 },
];

// Wiki Pages
const pages = [
  {
    title: 'Welcome to the Wiki',
    slug: 'welcome',
    categoryName: 'Getting Started',
    content: `# Welcome to the Wiki\n\nThis is your comprehensive guide to using the application.\n\n## Quick Navigation\n\n- **Getting Started**: Learn the basics\n- **Agent Governance**: Understand agent management\n- **Workflow Automation**: Create automated workflows\n- **API Reference**: Integration documentation\n- **Troubleshooting**: Solve common issues\n- **FAQ**: Quick answers to common questions`,
    isPublished: true,
  },
  {
    title: 'Getting Started Guide',
    slug: 'getting-started',
    categoryName: 'Getting Started',
    content: `# Getting Started Guide\n\n## Step 1: Create Your Account\nSign up on the platform.\n\n## Step 2: Explore the Dashboard\nView projects, workflows, agents, and resources.\n\n## Step 3: Create Your First Workflow\nNavigate to Automation and click "Create Workflow".\n\n## Step 4: Learn More\nExplore the wiki for advanced features.`,
    isPublished: true,
  },
  {
    title: 'Agent Governance Overview',
    slug: 'agent-governance-overview',
    categoryName: 'Agent Governance',
    content: `# Agent Governance Overview\n\nAgent governance is the framework for managing, monitoring, and controlling agents.\n\n## Key Concepts\n\n### Agent Roles\n- **Admin**: Full system access\n- **User**: Standard access\n- **Viewer**: Read-only access\n\n### Monitoring\n- Execution logs\n- Performance metrics\n- Error tracking\n- Resource usage`,
    isPublished: true,
  },
  {
    title: 'Creating Your First Workflow',
    slug: 'creating-first-workflow',
    categoryName: 'Workflow Automation',
    content: `# Creating Your First Workflow\n\n## Workflow Components\n\n### Triggers\n- **Time Trigger**: Run on a schedule\n- **Webhook**: Run on events\n- **Manual**: Run on demand\n\n### Actions\n- **Database Query**: Query your database\n- **Send Email**: Notifications\n- **Run Code**: Custom code\n- **AI Processing**: AI data processing`,
    isPublished: true,
  },
  {
    title: 'API Reference',
    slug: 'api-reference',
    categoryName: 'API Reference',
    content: `# API Reference\n\n## Authentication\nAll API requests require authentication:\n\`Authorization: Bearer YOUR_API_KEY\`\n\n## Endpoints\n- GET /workflows - List workflows\n- POST /workflows - Create workflow\n- GET /workflows/:id - Get workflow\n- PUT /workflows/:id - Update workflow\n- DELETE /workflows/:id - Delete workflow`,
    isPublished: true,
  },
  {
    title: 'Common Issues and Solutions',
    slug: 'troubleshooting',
    categoryName: 'Troubleshooting',
    content: `# Troubleshooting Guide\n\n## Workflow Not Executing\n1. Check trigger configuration\n2. Verify trigger is enabled\n3. Check execution logs\n\n## Database Connection Error\n1. Verify credentials\n2. Check network connectivity\n3. Ensure database is running\n\n## Permission Denied\n1. Check your user role\n2. Verify resource permissions\n3. Contact administrator`,
    isPublished: true,
  },
  {
    title: 'Frequently Asked Questions',
    slug: 'faq',
    categoryName: 'FAQ',
    content: `# FAQ\n\n### What is this application?\nA comprehensive automation and agent management platform.\n\n### How do I get started?\nSee the Getting Started Guide.\n\n### How many workflows can I create?\nNo limit.\n\n### Can I schedule workflows?\nYes, use the Time Trigger.\n\n### What is an agent?\nAn autonomous entity that can perform tasks and make decisions.`,
    isPublished: true,
  },
];

try {
  // Insert categories
  console.log('Inserting wiki categories...');
  for (const category of categories) {
    await client.query(
      'INSERT INTO wiki_categories (name, description, icon, display_order) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING',
      [category.name, category.description, category.icon, category.order]
    );
  }
  console.log(`Inserted ${categories.length} categories`);

  // Get category IDs
  const { rows: categoryRows } = await client.query('SELECT id, name FROM wiki_categories');
  const categoryMap = {};
  categoryRows.forEach((row) => {
    categoryMap[row.name] = row.id;
  });

  // Insert pages
  console.log('Inserting wiki pages...');
  for (const page of pages) {
    const categoryId = categoryMap[page.categoryName];
    await client.query(
      'INSERT INTO wiki_pages (title, slug, content, category_id, version, is_published) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING',
      [page.title, page.slug, page.content, categoryId, 1, page.isPublished]
    );
  }
  console.log(`Inserted ${pages.length} pages`);

  console.log('\nWiki content seeded successfully!');
} catch (error) {
  console.error('Error seeding wiki:', error);
  process.exit(1);
} finally {
  await client.end();
}
