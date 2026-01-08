/**
 * @fileoverview Link checker health check module
 * 
 * This module validates links in the generated HTML output file using the linkinator
 * package. It checks all links (internal and external) for broken links, redirects,
 * and other issues. The check requires the output_path from specs.json to locate
 * the index.html file to scan.
 * 
 * Key features:
 * - Uses the well-tested linkinator package (113k+ weekly downloads)
 * - Checks both internal and external links
 * - Handles redirects gracefully
 * - Provides detailed information about broken links
 * - Categorizes issues by severity (broken, timeout, errors)
 * 
 * @author spec-up-t-healthcheck
 */

import { LinkChecker } from 'linkinator';
import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';
import path from 'path';

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'link-checker';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = 'Link checker';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates all links in the generated HTML output using linkinator';

/**
 * Timeout for link checking in milliseconds.
 * Set to 30 seconds to handle slow external links.
 * @type {number}
 */
const LINK_CHECK_TIMEOUT = 30000;

/**
 * Maximum number of concurrent link checks.
 * Prevents overwhelming servers with too many simultaneous requests.
 * @type {number}
 */
const MAX_CONCURRENCY = 25;

/**
 * Link states that indicate broken links.
 * @type {readonly string[]}
 */
const BROKEN_STATES = Object.freeze(['BROKEN']);

/**
 * Link states that indicate skipped links.
 * @type {readonly string[]}
 */
const SKIPPED_STATES = Object.freeze(['SKIPPED']);

/**
 * Validates all links in the generated HTML output file.
 * 
 * This health check scans the index.html file in the output_path directory
 * specified in specs.json. It uses the linkinator package to check all links
 * (both internal and external) and reports any broken links, timeouts, or errors.
 * 
 * The check performs the following validations:
 * - Verifies specs.json exists and is valid JSON
 * - Extracts output_path from specs.json
 * - Checks that the output directory exists
 * - Verifies index.html exists in the output directory
 * - Scans all links in the HTML file
 * - Reports broken links with details (URL, status code, parent page)
 * - Categorizes issues by type (404, 500 errors, timeouts, etc.)
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result with link validation details
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkLinks(provider);
 * console.log(result.status); // 'pass', 'fail', or 'warn'
 * console.log(result.details.brokenLinks); // Array of broken links
 * ```
 */
export async function checkLinks(provider) {
  try {
    // Step 1: Read and parse specs.json
    const specsExists = await provider.fileExists('specs.json');
    if (!specsExists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        'specs.json not found - cannot determine output path',
        {
          suggestions: [
            'Create a specs.json file in your repository root',
            'Link checking requires specs.json to locate the generated HTML'
          ]
        }
      );
    }

    let specsData;
    try {
      const specsContent = await provider.readFile('specs.json');
      specsData = JSON.parse(specsContent);
    } catch (parseError) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        'specs.json contains invalid JSON - cannot determine output path',
        {
          parseError: parseError.message
        }
      );
    }

    // Step 2: Extract output_path from specs.json
    if (!specsData.specs || !Array.isArray(specsData.specs) || specsData.specs.length === 0) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        'specs.json does not contain valid specs array - cannot determine output path',
        {
          suggestions: ['Ensure specs.json has a valid "specs" array with at least one spec configuration']
        }
      );
    }

    const spec = specsData.specs[0];
    const outputPath = spec.output_path;

    if (!outputPath) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        'output_path not specified in specs.json - cannot locate HTML file',
        {
          suggestions: ['Add "output_path" field to your spec configuration in specs.json']
        }
      );
    }

    // Step 3: Check if output directory exists
    const outputDirExists = await provider.directoryExists(outputPath);
    if (!outputDirExists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        `Output directory "${outputPath}" does not exist - run spec-up-t render first`,
        {
          outputPath,
          suggestions: [
            'Run "npm run render" or "npm run dev" to generate the HTML output',
            `The output directory "${outputPath}" will be created after rendering`
          ]
        }
      );
    }

    // Step 4: Check if index.html exists in output directory
    const indexPath = path.join(outputPath, 'index.html');
    const indexExists = await provider.fileExists(indexPath);
    
    if (!indexExists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'skip',
        `index.html not found in "${outputPath}" - run spec-up-t render first`,
        {
          expectedPath: indexPath,
          suggestions: [
            'Run "npm run render" or "npm run dev" to generate index.html',
            'Ensure the rendering process completes successfully'
          ]
        }
      );
    }

    // Step 5: Perform link checking using linkinator
    // Linkinator needs the directory path, and it will look for index.html automatically
    const outputDirPath = path.join(provider.getBasePath(), outputPath);
    
    // Create a linkinator instance
    const checker = new LinkChecker();
    
    // Collect all link results
    const allLinks = [];
    const brokenLinks = [];
    const warnings = [];
    
    // Listen for link events
    checker.on('link', (result) => {
      allLinks.push(result);
      
      // Categorize broken links
      if (result.state === 'BROKEN') {
        brokenLinks.push({
          url: result.url,
          status: result.status,
          statusText: result.statusText || 'Unknown error',
          parent: result.parent || 'Unknown'
        });
      }
      
      // Track redirects as warnings
      if (result.status >= 300 && result.status < 400 && result.state !== 'BROKEN') {
        warnings.push({
          url: result.url,
          status: result.status,
          message: 'Link redirects',
          parent: result.parent || 'Unknown'
        });
      }
    });

    // Run the link check
    // Linkinator will automatically serve the directory and check index.html
    const checkResult = await checker.check({
      path: outputDirPath,
      recurse: false, // Only check links in this file, don't crawl
      timeout: LINK_CHECK_TIMEOUT,
      concurrency: MAX_CONCURRENCY,
      retry: true, // Retry on 429 (rate limit)
      retryErrors: false, // Don't retry on other errors to save time
    });

    // Step 6: Analyze results and create report
    const totalLinks = allLinks.length;
    const passedLinks = allLinks.filter(link => link.state === 'OK').length;
    const skippedLinks = allLinks.filter(link => link.state === 'SKIPPED').length;
    
    // Categorize broken links by status code
    const categorizedBroken = categorizeBrokenLinks(brokenLinks);

    // Determine status
    let status = 'pass';
    let message = `All ${passedLinks} links are valid`;
    
    if (brokenLinks.length > 0) {
      status = 'fail';
      // Create detailed message with first broken link
      const firstBroken = brokenLinks[0];
      message = `Found ${brokenLinks.length} broken link(s) out of ${totalLinks} total links. First broken: ${firstBroken.url} (${firstBroken.status || 'Error'})`;
      
      // If there are multiple broken links, add count
      if (brokenLinks.length > 1) {
        message += ` and ${brokenLinks.length - 1} more`;
      }
    } else if (warnings.length > 0) {
      status = 'warn';
      message = `All links are valid, but ${warnings.length} link(s) redirect`;
    } else if (totalLinks === 0) {
      status = 'warn';
      message = 'No links found to check in the HTML file';
    }

    return createHealthCheckResult(
      CHECK_NAME,
      status,
      message,
      {
        totalLinks,
        passedLinks,
        brokenLinks: brokenLinks.length,
        skippedLinks,
        redirects: warnings.length,
        outputPath,
        indexPath,
        brokenLinkDetails: categorizedBroken,
        redirectDetails: warnings.slice(0, 10), // Limit to first 10 redirects
        suggestions: brokenLinks.length > 0 ? generateSuggestions(categorizedBroken) : []
      }
    );

  } catch (error) {
    return createErrorResult(CHECK_NAME, error);
  }
}

/**
 * Categorizes broken links by HTTP status code or error type.
 * This helps identify patterns in link failures (e.g., all 404s vs timeouts).
 * 
 * @param {Array<Object>} brokenLinks - Array of broken link objects
 * @returns {Object} Categorized broken links by status code
 * @private
 */
function categorizeBrokenLinks(brokenLinks) {
  const categories = {
    notFound: [], // 404
    serverError: [], // 5xx
    timeout: [], // Timeout errors
    other: [] // Other errors
  };

  for (const link of brokenLinks) {
    if (link.status === 404) {
      categories.notFound.push(link);
    } else if (link.status >= 500 && link.status < 600) {
      categories.serverError.push(link);
    } else if (link.statusText && link.statusText.toLowerCase().includes('timeout')) {
      categories.timeout.push(link);
    } else {
      categories.other.push(link);
    }
  }

  return categories;
}

/**
 * Generates helpful suggestions based on the types of broken links found.
 * Provides actionable advice for common link issues.
 * 
 * @param {Object} categorizedBroken - Categorized broken links
 * @returns {string[]} Array of suggestion strings
 * @private
 */
function generateSuggestions(categorizedBroken) {
  const suggestions = [];

  if (categorizedBroken.notFound.length > 0) {
    suggestions.push(
      `Fix ${categorizedBroken.notFound.length} broken link(s) with 404 Not Found errors`,
      'Check for typos in URLs or removed pages'
    );
  }

  if (categorizedBroken.serverError.length > 0) {
    suggestions.push(
      `${categorizedBroken.serverError.length} link(s) returned server errors (5xx)`,
      'These may be temporary - verify the linked servers are operational'
    );
  }

  if (categorizedBroken.timeout.length > 0) {
    suggestions.push(
      `${categorizedBroken.timeout.length} link(s) timed out`,
      'Check if these URLs are accessible and responding'
    );
  }

  if (categorizedBroken.other.length > 0) {
    suggestions.push(
      `${categorizedBroken.other.length} link(s) failed with other errors`,
      'Review the details to understand the specific issues'
    );
  }

  return suggestions;
}
