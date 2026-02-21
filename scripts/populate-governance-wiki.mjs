#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const client = new pg.Client(process.env.DATABASE_URL || 'postgresql://localhost/app');
await client.connect();

const reports = [
  {
    title: 'Governance Test Report',
    slug: 'governance-test-report',
    file: path.join(projectRoot, 'GOVERNANCE_TEST_REPORT.md'),
    excerpt: 'Comprehensive test execution report with 43/43 tests passing, 100% feature completeness, and production-ready status.'
  },
  {
    title: 'Governance Coverage Report',
    slug: 'governance-coverage-report',
    file: path.join(projectRoot, 'GOVERNANCE_COVERAGE_REPORT.md'),
    excerpt: 'Detailed code coverage analysis showing 88% overall coverage with line, branch, and function metrics.'
  },
  {
    title: 'Governance Gap Analysis',
    slug: 'governance-gap-analysis',
    file: path.join(projectRoot, 'GOVERNANCE_GAP_ANALYSIS.md'),
    excerpt: 'Gap identification and remediation plan with 0 critical gaps and comprehensive roadmap for improvements.'
  },
  {
    title: 'Governance Requirements Mapping',
    slug: 'governance-requirements-mapping',
    file: path.join(projectRoot, 'GOVERNANCE_MAPPING.md'),
    excerpt: 'Requirements-to-implementation mapping showing frontend components, backend routers, services, and data layer.'
  }
];

async function populateWiki() {
  try {
    console.log('Connecting to database...');

    // Get or create user (use user 1 as default)
    let userId = 1;
    try {
      const { rows } = await client.query('SELECT id FROM users LIMIT 1');
      if (rows.length > 0) {
        userId = rows[0].id;
        console.log(`Using user ID: ${userId}`);
      } else {
        console.log('No user found, using default ID: 1');
      }
    } catch (error) {
      console.log('Could not query users, using default ID: 1');
    }

    // Create or get "Governance Follow Up" category
    const categoryName = 'Governance Follow Up';
    let categoryId;

    const { rows: existingCats } = await client.query(
      'SELECT id FROM wiki_categories WHERE name = $1',
      [categoryName]
    );

    if (existingCats.length > 0) {
      categoryId = existingCats[0].id;
      console.log(`Using existing category ID: ${categoryId}`);
    } else {
      const { rows: newCat } = await client.query(
        'INSERT INTO wiki_categories (name, description, icon, display_order) VALUES ($1, $2, $3, $4) RETURNING id',
        [categoryName, 'Governance module testing reports and analysis', 'BookOpen', 1]
      );
      categoryId = newCat[0].id;
      console.log(`Created category ID: ${categoryId}`);
    }

    // Add each governance report as a wiki page
    let successCount = 0;

    for (const report of reports) {
      try {
        if (!fs.existsSync(report.file)) {
          console.log(`${report.title} - File not found: ${report.file}`);
          continue;
        }

        const content = fs.readFileSync(report.file, 'utf-8');
        const size = (content.length / 1024).toFixed(2);

        const { rows: existingPage } = await client.query(
          'SELECT id FROM wiki_pages WHERE slug = $1',
          [report.slug]
        );

        if (existingPage.length > 0) {
          await client.query(
            'UPDATE wiki_pages SET content = $1, is_published = TRUE, updated_at = NOW() WHERE slug = $2',
            [content, report.slug]
          );
          console.log(`${report.title} - Updated (${size}KB)`);
        } else {
          await client.query(
            'INSERT INTO wiki_pages (title, slug, content, category_id, author_id, is_published, version) VALUES ($1, $2, $3, $4, $5, TRUE, 1)',
            [report.title, report.slug, content, categoryId, userId]
          );
          console.log(`${report.title} - Created (${size}KB)`);
        }
        successCount++;
      } catch (error) {
        console.log(`${report.title} - Error: ${error.message}`);
      }
    }

    console.log(`\nDone: ${successCount}/${reports.length} reports added to wiki`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

populateWiki();
