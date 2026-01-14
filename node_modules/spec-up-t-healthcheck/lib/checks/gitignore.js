/**
 * @fileoverview .gitignore health check module
 * 
 * This module validates the existence and content of .gitignore files in
 * specification repositories. It ensures that essential entries are present
 * to prevent common files from being accidentally committed to version control.
 * 
 * The check validates:
 * - Existence of .gitignore file
 * - Valid content (not empty, properly formatted)
 * - Presence of required entries that should be ignored
 * 
 * @author spec-up-t-healthcheck
 */

import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'gitignore';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = '.gitignore';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates the existence and content of .gitignore file';

/**
 * GitHub URL for the boilerplate .gitignore file that defines the reference entries.
 * This is used to fetch the latest required .gitignore entries dynamically.
 * @type {string}
 */
const BOILERPLATE_GITIGNORE_URL = 'https://raw.githubusercontent.com/trustoverip/spec-up-t/master/src/install-from-boilerplate/boilerplate/gitignore';

/**
 * Cache duration for fetched boilerplate .gitignore (in milliseconds).
 * Set to 1 hour to avoid excessive network requests while keeping data reasonably fresh.
 * @type {number}
 */
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * In-memory cache for required entries.
 * @type {Object}
 * @private
 */
let entriesCache = {
  entries: null,
  lastFetch: 0
};

/**
 * Fallback required entries if the remote fetch fails.
 * These entries prevent common files and directories from being committed.
 * 
 * Each entry can appear as-is or with variations (e.g., /node_modules, node_modules/, etc.)
 * 
 * @type {readonly string[]}
 */
const FALLBACK_REQUIRED_ENTRIES = Object.freeze([
  'node_modules',
  '*.log',
  'dist',
  '*.bak',
  '*.tmp',
  '.DS_Store',
  '.env',
  'coverage',
  'build',
  '.history',
  '/.cache/'
]);

/**
 * Fetches the latest required .gitignore entries from the boilerplate repository.
 * 
 * This function retrieves the reference .gitignore file from the spec-up-t
 * repository to determine the currently required entries. Results are cached
 * to minimize network requests.
 * 
 * The boilerplate .gitignore is parsed line by line, filtering out empty lines
 * and comments to extract the actual entries.
 * 
 * @returns {Promise<string[]>} Array of required .gitignore entries, or fallback entries if fetch fails
 * @private
 */
async function fetchRequiredEntries() {
  const now = Date.now();
  
  // Return cached entries if still valid
  if (entriesCache.entries && (now - entriesCache.lastFetch) < CACHE_DURATION) {
    return entriesCache.entries;
  }

  try {
    const response = await fetch(BOILERPLATE_GITIGNORE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    // Parse the .gitignore content to extract entries
    const entries = parseGitignoreContent(content);
    
    if (entries.length === 0) {
      throw new Error('No entries found in boilerplate .gitignore');
    }
    
    // Cache the fetched entries
    entriesCache.entries = entries;
    entriesCache.lastFetch = now;
    
    return entries;
  } catch (error) {
    // If fetch fails, return cached entries if available, otherwise use fallback
    if (entriesCache.entries) {
      return entriesCache.entries;
    }
    
    // Use fallback entries as last resort
    return Array.from(FALLBACK_REQUIRED_ENTRIES);
  }
}

/**
 * Normalizes a .gitignore line for comparison.
 * 
 * This function removes leading/trailing slashes and whitespace to allow
 * flexible matching of entries that may be written in different styles.
 * 
 * Examples:
 * - "/node_modules/" -> "node_modules"
 * - "node_modules/" -> "node_modules"
 * - " node_modules " -> "node_modules"
 * 
 * @param {string} line - The line to normalize
 * @returns {string} The normalized line
 * @private
 */
function normalizeLine(line) {
  return line.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Checks if a required entry is present in the .gitignore content.
 * 
 * This function performs a flexible match that accounts for different ways
 * the entry might be written (with or without slashes, wildcards, etc.)
 * 
 * @param {string} requiredEntry - The required entry to look for
 * @param {string[]} normalizedLines - Array of normalized .gitignore lines
 * @returns {boolean} True if the entry is present
 * @private
 */
function isEntryPresent(requiredEntry, normalizedLines) {
  const normalizedRequired = normalizeLine(requiredEntry);
  
  return normalizedLines.some(line => {
    // Exact match after normalization
    if (line === normalizedRequired) {
      return true;
    }
    
    // For wildcard patterns, check if the pattern is present
    if (normalizedRequired.includes('*') && line === normalizedRequired) {
      return true;
    }
    
    // For paths with slashes, check if the base name matches
    const requiredBase = normalizedRequired.split('/').pop();
    const lineBase = line.split('/').pop();
    
    if (requiredBase === lineBase) {
      return true;
    }
    
    return false;
  });
}

/**
 * Parses .gitignore content into an array of valid entries.
 * 
 * This function:
 * - Splits content by newlines
 * - Removes empty lines
 * - Removes comment lines (starting with #)
 * - Trims whitespace
 * 
 * @param {string} content - The raw .gitignore content
 * @returns {string[]} Array of valid .gitignore entries
 * @private
 */
function parseGitignoreContent(content) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Validates the .gitignore file in a specification repository.
 * 
 * This function performs a comprehensive check of the .gitignore file:
 * 1. Verifies the file exists
 * 2. Validates that it has content
 * 3. Checks for required entries
 * 4. Reports missing entries as warnings or failures
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for repository access
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} Result of the .gitignore validation
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkGitignore(provider);
 * console.log(result.status); // 'pass', 'warn', or 'fail'
 * console.log(result.message);
 * console.log(result.details.missingEntries);
 * ```
 */
export async function checkGitignore(provider) {
  try {
    // Fetch the required entries from the boilerplate repository
    const requiredEntries = await fetchRequiredEntries();
    
    // Check if .gitignore file exists
    const exists = await provider.fileExists('.gitignore');
    
    if (!exists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        '.gitignore file not found - repository should have a .gitignore file',
        {
          fileExists: false,
          recommendation: 'Create a .gitignore file with common exclusion patterns',
          boilerplateUrl: BOILERPLATE_GITIGNORE_URL
        }
      );
    }

    // Read .gitignore content
    const content = await provider.readFile('.gitignore');
    
    // Check if file has valid content
    if (!content || content.trim().length === 0) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        '.gitignore file is empty - should contain exclusion patterns',
        {
          fileExists: true,
          isEmpty: true,
          recommendation: 'Add common exclusion patterns to .gitignore',
          boilerplateUrl: BOILERPLATE_GITIGNORE_URL
        }
      );
    }

    // Parse .gitignore content
    const lines = parseGitignoreContent(content);
    
    if (lines.length === 0) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        '.gitignore file contains no valid entries (only comments or empty lines)',
        {
          fileExists: true,
          hasOnlyComments: true,
          recommendation: 'Add valid exclusion patterns to .gitignore',
          boilerplateUrl: BOILERPLATE_GITIGNORE_URL
        }
      );
    }

    // Normalize lines for comparison
    const normalizedLines = lines.map(normalizeLine);

    // Check for missing required entries
    const missingEntries = requiredEntries.filter(
      required => !isEntryPresent(required, normalizedLines)
    );

    // Build details object
    const details = {
      fileExists: true,
      totalEntries: lines.length,
      requiredEntriesCount: requiredEntries.length,
      presentEntriesCount: requiredEntries.length - missingEntries.length,
      missingEntries: missingEntries.length > 0 ? missingEntries : undefined,
      sample: lines.slice(0, 10), // Include first 10 entries as sample
      boilerplateUrl: BOILERPLATE_GITIGNORE_URL,
      usedFallback: entriesCache.entries === FALLBACK_REQUIRED_ENTRIES
    };

    // Determine status and message
    if (missingEntries.length === 0) {
      return createHealthCheckResult(
        CHECK_NAME,
        'pass',
        '.gitignore file is valid and contains all required entries',
        details
      );
    }

    // If some required entries are missing, it's a warning
    const missingCount = missingEntries.length;
    const message = `${missingCount} required ${missingCount === 1 ? 'entry' : 'entries'} missing from .gitignore: ${missingEntries.join(', ')}`;
    
    return createHealthCheckResult(
      CHECK_NAME,
      'warn',
      message,
      details
    );

  } catch (error) {
    return createErrorResult(CHECK_NAME, error, {
      context: 'checking .gitignore file',
      provider: provider.type
    });
  }
}

/**
 * Clears the cached required entries.
 * This is primarily useful for testing to force a fresh fetch.
 * 
 * @private
 */
export function clearEntriesCache() {
  entriesCache = {
    entries: null,
    lastFetch: 0
  };
}

// Export the health check function as default for easy registration
export default checkGitignore;
