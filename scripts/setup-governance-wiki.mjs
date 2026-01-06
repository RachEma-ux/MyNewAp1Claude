#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Read all governance reports
const reports = [
  {
    name: 'Test Report',
    file: '/home/ubuntu/GOVERNANCE_TEST_REPORT.md',
    slug: 'governance-test-report',
    description: 'Comprehensive test coverage and validation results for the governance module'
  },
  {
    name: 'Coverage Report',
    file: '/home/ubuntu/GOVERNANCE_COVERAGE_REPORT.md',
    slug: 'governance-coverage-report',
    description: 'Code coverage analysis and testing metrics for governance features'
  },
  {
    name: 'Gap Analysis',
    file: '/home/ubuntu/GOVERNANCE_GAP_ANALYSIS.md',
    slug: 'governance-gap-analysis',
    description: 'Identified gaps between requirements and current implementation'
  },
  {
    name: 'Requirements Mapping',
    file: '/home/ubuntu/GOVERNANCE_MAPPING.md',
    slug: 'governance-requirements-mapping',
    description: 'Detailed mapping of requirements to implementation components'
  }
];

console.log('📚 Governance Reports Ready for Wiki\n');
console.log('=====================================\n');

const validReports = [];
reports.forEach((report, idx) => {
  try {
    if (fs.existsSync(report.file)) {
      const content = fs.readFileSync(report.file, 'utf-8');
      const lines = content.split('\n').length;
      const size = (content.length / 1024).toFixed(2);
      
      validReports.push({
        ...report,
        content,
        lines,
        size
      });
      
      console.log(`✅ ${idx + 1}. ${report.name}`);
      console.log(`   File: ${report.file}`);
      console.log(`   Size: ${size}KB | Lines: ${lines}`);
      console.log(`   Description: ${report.description}\n`);
    } else {
      console.log(`❌ ${idx + 1}. ${report.name} - FILE NOT FOUND\n`);
    }
  } catch (error) {
    console.log(`❌ ${idx + 1}. ${report.name} - ERROR: ${error.message}\n`);
  }
});

console.log('\n📝 Wiki Setup Instructions\n');
console.log('==========================\n');
console.log('To add these reports to your Wiki:\n');
console.log('1. Open the application at: https://3000-i69ete6udi3v38tbmdyff-f4029a6c.manusvm.computer');
console.log('2. Navigate to the Wiki section');
console.log('3. Create a new category called "Governance Follow Up"');
console.log('4. Add each report as a wiki page:\n');

validReports.forEach((report, idx) => {
  console.log(`   ${idx + 1}. Title: ${report.name}`);
  console.log(`      Slug: ${report.slug}`);
  console.log(`      Description: ${report.description}`);
  console.log(`      Content: Copy from ${report.file}\n`);
});

console.log('\n📋 Summary\n');
console.log('===========\n');
console.log(`Total Reports: ${validReports.length}`);
console.log(`Total Size: ${validReports.reduce((sum, r) => sum + parseFloat(r.size), 0).toFixed(2)}KB`);
console.log(`Total Lines: ${validReports.reduce((sum, r) => sum + r.lines, 0)}`);

// Create a manifest file for reference
const manifest = {
  category: 'Governance Follow Up',
  description: 'Governance module testing reports and analysis',
  reports: validReports.map(r => ({
    name: r.name,
    slug: r.slug,
    description: r.description,
    file: r.file,
    size: r.size,
    lines: r.lines,
    createdAt: new Date().toISOString()
  }))
};

fs.writeFileSync(
  path.join(projectRoot, 'wiki-governance-manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log('\n✅ Manifest saved to: wiki-governance-manifest.json');
console.log('\n🎉 All governance reports are ready for Wiki import!');
