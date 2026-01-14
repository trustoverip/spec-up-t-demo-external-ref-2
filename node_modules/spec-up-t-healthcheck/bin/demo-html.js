#!/usr/bin/env node

/**
 * @fileoverview Demonstration script for HTML health check reports
 * 
 * This script creates sample health check data with various statuses and
 * generates an HTML report to showcase the Bootstrap styling and interactive
 * features. It's useful for testing the HTML formatter and demonstrating
 * the visual appearance of health check reports.
 * 
 * @author spec-up-t-healthcheck

 */

import { formatResultsAsHtml } from '../lib/formatters.js';
import { openHtmlFile } from '../lib/file-opener.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Creates sample health check data for demonstration purposes.
 * 
 * This function generates realistic health check results with various
 * statuses to showcase how the HTML formatter handles different scenarios.
 * 
 * @returns {import('../lib/health-checker.js').HealthCheckReport} Mock health check report
 */
function createSampleHealthCheckData() {
  const timestamp = new Date().toISOString();
  
  const results = [
    {
      check: 'package-json-exists',
      status: 'pass',
      message: 'package.json file found and valid',
      timestamp,
      details: {
        packageData: {
          name: 'spec-up-t-healthcheck',
          version: '1.0.2'
        }
      }
    },
    {
      check: 'package-json-required-fields',
      status: 'pass',
      message: 'All required fields are present',
      timestamp,
      details: {}
    },
    {
      check: 'spec-files-present',
      status: 'pass',
      message: 'Specification files found',
      timestamp,
      details: {
        count: 3
      }
    },
    {
      check: 'readme-exists',
      status: 'pass',
      message: 'README.md file is present',
      timestamp,
      details: {}
    },
    {
      check: 'license-check',
      status: 'warn',
      message: 'License file not found - consider adding a LICENSE file',
      timestamp,
      details: {}
    },
    {
      check: 'git-ignore-validation',
      status: 'fail',
      message: '.gitignore file is missing or incomplete',
      timestamp,
      details: {
        missingFields: ['node_modules', '.cache', '*.log']
      }
    },
    {
      check: 'dependency-security',
      status: 'warn',
      message: 'Some dependencies have known vulnerabilities',
      timestamp,
      details: {}
    },
    {
      check: 'typescript-config',
      status: 'skip',
      message: 'TypeScript not detected, skipping config validation',
      timestamp,
      details: {}
    }
  ];

  // Calculate summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  
  const summary = {
    total: results.length,
    passed,
    failed,
    warnings,
    skipped,
    score: Math.round((passed / results.length) * 100),
    hasErrors: failed > 0,
    hasWarnings: warnings > 0
  };

  return {
    results,
    summary,
    timestamp,
    provider: {
      type: 'local',
      repoPath: '/Users/demo/my-spec-project'
    }
  };
}

/**
 * Main function that generates and opens the sample HTML report.
 */
async function generateSampleReport() {
  console.log('🎨 Generating sample HTML health check report...\n');
  
  // Create sample data
  const sampleData = createSampleHealthCheckData();
  
  // Generate HTML report with custom options
  const htmlContent = formatResultsAsHtml(sampleData, {
    title: 'Sample Spec-Up-T Health Check Report',
    repositoryUrl: 'https://github.com/blockchain-bird/spec-up-t-sample',
    showPassingByDefault: true
  });
  
  // Ensure output directory exists
  const outputDir = join(process.cwd(), '.cache');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Write HTML file
  const outputFile = join(outputDir, `sample-health-report-${Date.now()}.html`);
  writeFileSync(outputFile, htmlContent);
  
  console.log(`✅ Sample report generated: ${outputFile}`);
  console.log('\n📊 Sample Report Contents:');
  console.log(`   Total checks: ${sampleData.summary.total}`);
  console.log(`   ✓ Passed: ${sampleData.summary.passed}`);
  console.log(`   ✗ Failed: ${sampleData.summary.failed}`);
  console.log(`   ⚠ Warnings: ${sampleData.summary.warnings}`);
  console.log(`   ○ Skipped: ${sampleData.summary.skipped}`);
  console.log(`   Score: ${sampleData.summary.score}%`);
  
  console.log('\n🌐 Opening sample report in browser...');
  const opened = await openHtmlFile(outputFile);
  
  if (opened) {
    console.log('✅ Sample report opened successfully!');
  } else {
    console.log('⚠️  Could not automatically open browser. Please open manually:');
    console.log(`   ${outputFile}`);
  }
  
  console.log('\n🎯 Features demonstrated in the sample report:');
  console.log('   • Bootstrap responsive design');
  console.log('   • Interactive passing/failing filter toggle');
  console.log('   • Color-coded status indicators');
  console.log('   • Detailed health score calculation');
  console.log('   • Professional card-based layout');
  console.log('   • Repository information display');
  console.log('   • Various check result types (pass/fail/warn/skip)');
}

// Run the sample generator
generateSampleReport().catch(error => {
  console.error('❌ Error generating sample report:', error);
  process.exit(1);
});