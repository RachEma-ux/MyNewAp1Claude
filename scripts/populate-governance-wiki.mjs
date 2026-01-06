#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConnection } from 'mysql2/promise';
import { URL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Parse DATABASE_URL
function parseDbUrl(dbUrl) {
  try {
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      port: url.port || 3306,
      ssl: {}
    };
  } catch (error) {
    console.error('❌ Invalid DATABASE_URL:', error.message);
    process.exit(1);
  }
}

const dbConfig = parseDbUrl(process.env.DATABASE_URL || 'mysql://root@localhost/app');

const reports = [
  {
    title: 'Governance Test Report',
    slug: 'governance-test-report',
    file: '/home/ubuntu/GOVERNANCE_TEST_REPORT.md',
    excerpt: 'Comprehensive test execution report with 43/43 tests passing, 100% feature completeness, and production-ready status.'
  },
  {
    title: 'Governance Coverage Report',
    slug: 'governance-coverage-report',
    file: '/home/ubuntu/GOVERNANCE_COVERAGE_REPORT.md',
    excerpt: 'Detailed code coverage analysis showing 88% overall coverage with line, branch, and function metrics.'
  },
  {
    title: 'Governance Gap Analysis',
    slug: 'governance-gap-analysis',
    file: '/home/ubuntu/GOVERNANCE_GAP_ANALYSIS.md',
    excerpt: 'Gap identification and remediation plan with 0 critical gaps and comprehensive roadmap for improvements.'
  },
  {
    title: 'Governance Requirements Mapping',
    slug: 'governance-requirements-mapping',
    file: '/home/ubuntu/GOVERNANCE_MAPPING.md',
    excerpt: 'Requirements-to-implementation mapping showing frontend components, backend routers, services, and data layer.'
  }
];

async function populateWiki() {
  let connection;
  try {
    console.log('🔗 Connecting to database...');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   SSL: Enabled\n`);
    
    connection = await createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Create wiki_categories table if it doesn't exist
    console.log('📋 Ensuring wiki_categories table exists...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wiki_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        icon VARCHAR(50),
        \`order\` INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX wiki_categories_order_idx (\`order\`)
      )
    `);
    console.log('✅ wiki_categories table ready\n');

    // Create wiki_pages table if it doesn't exist
    console.log('📋 Ensuring wiki_pages table exists...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wiki_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        content LONGTEXT NOT NULL,
        categoryId INT,
        authorId INT,
        version INT DEFAULT 1,
        isPublished BOOLEAN DEFAULT FALSE,
        views INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX wiki_pages_slug_idx (slug),
        INDEX wiki_pages_category_idx (categoryId),
        INDEX wiki_pages_author_idx (authorId),
        INDEX wiki_pages_published_idx (isPublished)
      )
    `);
    console.log('✅ wiki_pages table ready\n');



    // Get or create user (use user 1 as default)
    console.log('👤 Getting user...');
    let userId = 1;
    try {
      const [users] = await connection.execute('SELECT id FROM users LIMIT 1');
      if (users.length > 0) {
        userId = users[0].id;
        console.log(`✅ Using user ID: ${userId}\n`);
      } else {
        console.log('⚠️  No user found, using default ID: 1\n');
      }
    } catch (error) {
      console.log('⚠️  Could not query users, using default ID: 1\n');
    }

    // Create or get "Governance Follow Up" category
    console.log('📁 Creating "Governance Follow Up" category...');
    const categoryName = 'Governance Follow Up';
    
    let categoryId;
    try {
      const [existingCategory] = await connection.execute(
        'SELECT id FROM wiki_categories WHERE name = ?',
        [categoryName]
      );

      if (existingCategory.length > 0) {
        categoryId = existingCategory[0].id;
        console.log(`✅ Using existing category ID: ${categoryId}\n`);
      } else {
        const [result] = await connection.execute(
          'INSERT INTO wiki_categories (name, description, icon, display_order) VALUES (?, ?, ?, ?)',
          [
            categoryName,
            'Governance module testing reports and analysis',
            'BookOpen',
            1
          ]
        );
        categoryId = result.insertId;
        console.log(`✅ Created category ID: ${categoryId}\n`);
      }
    } catch (error) {
      console.error(`❌ Error creating category: ${error.message}`);
      throw error;
    }

    // Add each governance report as a wiki page
    console.log('📄 Adding governance reports to Wiki...\n');
    let successCount = 0;

    for (const report of reports) {
      try {
        // Read the report file
        if (!fs.existsSync(report.file)) {
          console.log(`❌ ${report.title} - File not found: ${report.file}`);
          continue;
        }

        const content = fs.readFileSync(report.file, 'utf-8');
        const size = (content.length / 1024).toFixed(2);

        // Check if page already exists
        const [existingPage] = await connection.execute(
          'SELECT id FROM wiki_pages WHERE slug = ?',
          [report.slug]
        );

        if (existingPage.length > 0) {
          // Update existing page
          await connection.execute(
            'UPDATE wiki_pages SET content = ?, isPublished = TRUE, updatedAt = NOW() WHERE slug = ?',
            [content, report.slug]
          );
          console.log(`✅ ${report.title}`);
          console.log(`   Status: Updated`);
          console.log(`   Size: ${size}KB\n`);
        } else {
          // Insert new page
          await connection.execute(
            'INSERT INTO wiki_pages (title, slug, content, categoryId, authorId, isPublished, version) VALUES (?, ?, ?, ?, ?, TRUE, 1)',
            [
              report.title,
              report.slug,
              content,
              categoryId,
              userId
            ]
          );
          console.log(`✅ ${report.title}`);
          console.log(`   Status: Created`);
          console.log(`   Size: ${size}KB\n`);
        }
        successCount++;
      } catch (error) {
        console.log(`❌ ${report.title} - Error: ${error.message}\n`);
      }
    }

    console.log('\n📊 Summary\n');
    console.log('===========\n');
    console.log(`✅ Successfully added ${successCount}/${reports.length} reports`);
    console.log(`📁 Category: "${categoryName}" (ID: ${categoryId})`);
    console.log(`👤 User ID: ${userId}`);
    console.log('\n🎉 Governance Follow Up Wiki folder is ready!');
    console.log('\nYou can now access the Wiki at: /wiki');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

populateWiki();
