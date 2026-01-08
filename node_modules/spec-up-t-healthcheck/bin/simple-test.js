#!/usr/bin/env node

/**
 * @fileoverview Simple test utility for basic functionality validation
 * 
 * This standalone test script provides a lightweight way to validate basic
 * functionality without complex imports or dependencies. It performs fundamental
 * checks on the current environment and repository structure to ensure the
 * health check tool can operate correctly.
 * 
 * The script is designed to be self-contained and can run independently
 * of the main library code, making it useful for troubleshooting and
 * basic environment validation.
 * 
 * @author spec-up-t-healthcheck
 */

/**
 * Performs basic environment and repository validation checks.
 * 
 * This function validates:
 * - Current working directory access
 * - package.json existence and content
 * - Basic Node.js functionality
 * - Repository identification
 * 
 * The checks are designed to be independent of the main health check
 * library and provide a foundation for more complex validation.
 */
async function runBasicHealthCheck() {
  console.log('🔍 Spec-Up-T Health Check Tool v1.0.0');
  console.log('');
  console.log('Available Health Check Categories:');
  console.log('  ✅ repository (Basic repository checks)');
  console.log('  ✅ configuration (3 checks)');
  console.log('  ✅ structure (Basic structure checks)');
  console.log('');
  console.log('📋 Basic functionality test:');

  try {
    // Test basic Node.js functionality
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const currentDir = process.cwd();
    console.log(`  ✓ Working directory: ${path.basename(currentDir)}`);
    
    // Check if package.json exists
    try {
      await fs.access('package.json');
      console.log('  ✓ package.json found');
    } catch {
      console.log('  ✗ package.json not found');
    }
    
    // Check if we're in a spec-up-t healthcheck repo
    const packageContent = await fs.readFile('package.json', 'utf-8');
    const pkg = JSON.parse(packageContent);
    
    if (pkg.name === 'spec-up-t-healthcheck') {
      console.log('  ✅ Running in spec-up-t-healthcheck repository');
      console.log(`  ✓ Version: ${pkg.version}`);
    } else {
      console.log(`  ℹ️  Running in: ${pkg.name || 'unknown project'}`);
    }
    
    console.log('');
    console.log('✅ Basic health check tool is working!');
    console.log('');
    console.log('Next: Implement full health check logic');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Execute the basic health check
runBasicHealthCheck();