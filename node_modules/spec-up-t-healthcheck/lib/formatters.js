/**
 * @fileoverview Output formatters for health check results
 * 
 * This module provides various formatting options for health check results,
 * including human-readable text output with icons, structured JSON output,
 * and interactive HTML reports with Bootstrap styling.
 * The formatters support customization options and maintain consistent styling.
 * 
 * @author spec-up-t-healthcheck
 
 */

import { generateHtmlReport } from './html-formatter.js';

/**
 * Formats health check results as human-readable text with emojis and structured layout.
 * 
 * This formatter creates a comprehensive text report that's suitable for console output
 * or text files. It includes a summary section, overall status, and detailed results
 * for each individual check. The output uses Unicode emojis for visual clarity.
 * 
 * @param {import('./health-checker.js').HealthCheckReport} healthCheckOutput - The complete health check report
 * @param {boolean} [useColors=false] - Whether to include ANSI color codes (reserved for future use)
 * @returns {string} Formatted text report ready for display or logging
 * 
 * @example
 * ```javascript
 * const report = await runHealthChecks(provider);
 * const textOutput = formatResultsAsText(report);
 * console.log(textOutput);
 * 
 * // Example output:
 * // 📋 Spec-up-t Health Check Report
 * // Generated: 9/18/2025, 10:30:00 AM
 * // 
 * // Repository: /path/to/spec
 * // 
 * // 📊 Summary
 * // Total checks: 2
 * // ✓ Passed: 2
 * // ✗ Failed: 0
 * // Score: 100%
 * ```
 */
export function formatResultsAsText(healthCheckOutput, useColors = false) {
  const { results, summary, timestamp, provider } = healthCheckOutput;
  
  let output = [];

  output.push('📋 Spec-up-t Health Check Report');
  output.push(`Generated: ${new Date(timestamp).toLocaleString()}`);
  output.push('');

  if (provider.repoPath) {
    output.push(`Repository: ${provider.repoPath}`);
  }
  output.push('');

  output.push('📊 Summary');
  output.push(`Total checks: ${summary.total}`);
  output.push(`✓ Passed: ${summary.passed}`);
  output.push(`✗ Failed: ${summary.failed}`);
  if (summary.warnings > 0) output.push(`⚠ Warnings: ${summary.warnings}`);
  if (summary.skipped > 0) output.push(`○ Skipped: ${summary.skipped}`);
  output.push(`Score: ${Math.round(summary.score)}%`);
  output.push('');

  if (summary.hasErrors) {
    output.push('❌ Overall Status: FAILED');
  } else if (summary.hasWarnings) {
    output.push('⚠️  Overall Status: PASSED WITH WARNINGS');
  } else {
    output.push('✅ Overall Status: PASSED');
  }
  output.push('');

  output.push('📝 Detailed Results');
  output.push('');

  results.forEach((result, index) => {
    const statusIcon = {
      pass: '✓',
      fail: '✗',
      warn: '⚠',
      skip: '○'
    }[result.status];

    output.push(`${index + 1}. ${statusIcon} ${result.check}`);
    output.push(`   ${result.message}`);
    
    if (result.details && Object.keys(result.details).length > 0) {
      if (result.details.missingFields) {
        output.push(`   Missing fields: ${result.details.missingFields.join(', ')}`);
      }
      if (result.details.count) {
        output.push(`   Files found: ${result.details.count}`);
      }
      if (result.details.packageData) {
        output.push(`   Package: ${result.details.packageData.name}@${result.details.packageData.version}`);
      }
    }
    
    output.push('');
  });

  return output.join('\n');
}

/**
 * Formats health check results as structured JSON with optional pretty-printing.
 * 
 * This formatter converts the health check report to JSON format, making it suitable
 * for programmatic consumption, API responses, or storage. The output maintains the
 * complete structure of the original report with configurable indentation.
 * 
 * @param {import('./health-checker.js').HealthCheckReport} healthCheckOutput - The complete health check report
 * @param {number} [indent=2] - Number of spaces for JSON indentation (0 for compact output)
 * @returns {string} JSON-formatted string representation of the health check report
 * 
 * @example
 * ```javascript
 * const report = await runHealthChecks(provider);
 * 
 * // Pretty-printed JSON (default)
 * const prettyJson = formatResultsAsJson(report);
 * 
 * // Compact JSON
 * const compactJson = formatResultsAsJson(report, 0);
 * 
 * // Custom indentation
 * const customJson = formatResultsAsJson(report, 4);
 * 
 * // Parse back to object
 * const parsedReport = JSON.parse(prettyJson);
 * ```
 */
export function formatResultsAsJson(healthCheckOutput, indent = 2) {
  return JSON.stringify(healthCheckOutput, null, indent);
}

/**
 * Formats health check results as an interactive Bootstrap-styled HTML report.
 * 
 * This formatter creates a comprehensive HTML document with responsive design,
 * interactive filtering capabilities, and visual status indicators. The report
 * follows modern web design patterns and provides an excellent user experience
 * for reviewing health check results in a browser.
 * 
 * @param {import('./health-checker.js').HealthCheckReport} healthCheckOutput - The complete health check report
 * @param {Object} [options={}] - Configuration options for HTML generation
 * @param {string} [options.title='Spec-Up-T Health Check Report'] - Custom title for the report
 * @param {boolean} [options.showPassingByDefault=true] - Whether to show passing checks by default
 * @param {string} [options.repositoryUrl] - URL to the repository being checked
 * @returns {string} Complete HTML document ready for saving or displaying
 * 
 * @example
 * ```javascript
 * const report = await runHealthChecks(provider);
 * 
 * // Basic HTML report
 * const htmlReport = formatResultsAsHtml(report);
 * 
 * // Customized HTML report
 * const customHtml = formatResultsAsHtml(report, {
 *   title: 'My Project Health Check',
 *   repositoryUrl: 'https://github.com/user/repo',
 *   showPassingByDefault: false
 * });
 * 
 * // Save to file
 * fs.writeFileSync('health-report.html', htmlReport);
 * ```
 */
export function formatResultsAsHtml(healthCheckOutput, options = {}) {
  return generateHtmlReport(healthCheckOutput, options);
}
