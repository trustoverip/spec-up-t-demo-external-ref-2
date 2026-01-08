/**
 * @fileoverview Specification files health check module
 * 
 * This module validates the presence and accessibility of specification files
 * in repositories. It searches for markdown files in common specification
 * directories and ensures that specification content is properly organized.
 * 
 * @author spec-up-t-healthcheck
 */

import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'spec-files';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = 'Specification Files Discovery';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Discovers and validates specification files in the repository';

/**
 * Common directory paths where specification files are typically located.
 * These paths are searched in order of preference.
 * @type {readonly string[]}
 */
const SPEC_DIRECTORIES = Object.freeze([
  'spec/',
  'specs/', 
  'docs/',
  'documentation/',
  'doc/'
]);

/**
 * File extensions that are considered specification files.
 * @type {readonly string[]}
 */
const SPEC_EXTENSIONS = Object.freeze(['.md', '.markdown', '.rst', '.txt']);

/**
 * Common specification file names that indicate primary specification content.
 * These files are given higher priority in reporting.
 * @type {readonly string[]}
 */
const PRIMARY_SPEC_NAMES = Object.freeze([
  'spec.md',
  'specification.md',
  'README.md',
  'index.md',
  'main.md'
]);

/**
 * Checks for the presence and accessibility of specification files in the repository.
 * 
 * This health check searches for markdown and other documentation files in common
 * specification directories as well as the repository root. It validates that
 * specification content is available and properly organized.
 * 
 * The check performs the following discovery:
 * - Searches common spec directories (spec/, docs/, etc.)
 * - Looks for markdown and text files in root directory
 * - Identifies primary specification files
 * - Reports on file organization and accessibility
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result with file discovery details
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkSpecFiles(provider);
 * console.log(result.details.specFiles); // Array of found specification files
 * ```
 */
export async function checkSpecFiles(provider) {
  try {
    const discoveryResult = await discoverSpecificationFiles(provider);
    
    const {
      specFiles,
      specDirectory, 
      primarySpecs,
      rootSpecFiles,
      searchedPaths,
      totalFiles
    } = discoveryResult;

    // No specification files found
    if (totalFiles === 0) {
      return createHealthCheckResult(
        CHECK_NAME, 
        'fail', 
        'No specification files found in repository',
        { 
          searchedPaths,
          searchedExtensions: SPEC_EXTENSIONS,
          suggestions: [
            'Create a spec/ or docs/ directory',
            'Add a README.md file with specification content',
            'Ensure specification files use supported extensions (.md, .markdown, .rst, .txt)'
          ]
        }
      );
    }

    // Determine health status - keep it simple like the original
    let status = 'pass';
    let message = `Found ${totalFiles} specification file${totalFiles === 1 ? '' : 's'}`;
    
    const details = {
      specFiles: specFiles.map(f => f.name),
      specDirectory,
      primarySpecs: primarySpecs.map(f => f.name),
      rootSpecFiles: rootSpecFiles.map(f => f.name),
      totalFiles,
      hasOrganizedSpecs: !!specDirectory,
      hasPrimarySpecs: primarySpecs.length > 0,
      searchedPaths
    };

    // Only add organization info to message, don't change status
    if (specDirectory) {
      message += ` in organized ${specDirectory} directory`;
    } else if (rootSpecFiles.length > 0) {
      message += ' in repository root';
      // Only warn if there are many unorganized files in root (more aggressive threshold)
      if (rootSpecFiles.length > 5) {
        details.organizationSuggestion = 'Consider moving specification files to a dedicated directory like spec/ or docs/';
      }
    }

    // Don't warn about missing primary specs - this is optional organizational advice only
    if (primarySpecs.length === 0 && totalFiles > 1) {
      details.primarySpecSuggestion = 'Consider adding a main specification file (spec.md, README.md, or index.md)';
    }

    return createHealthCheckResult(CHECK_NAME, status, message, details);

  } catch (error) {
    return createErrorResult(CHECK_NAME, error, {
      context: 'discovering specification files',
      provider: provider.type
    });
  }
}

/**
 * Discovers all specification files in the repository.
 * 
 * This function performs the actual file discovery logic, searching through
 * common specification directories and the repository root for relevant files.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<Object>} Discovery result with found files and metadata
 * @private
 */
async function discoverSpecificationFiles(provider) {
  let specFiles = [];
  let specDirectory = null;
  let primarySpecs = [];
  let rootSpecFiles = [];
  const searchedPaths = [];

  // Search spec directories first
  for (const dir of SPEC_DIRECTORIES) {
    searchedPaths.push(dir);
    try {
      const files = await provider.listFiles(dir);
      if (files.length > 0) {
        const relevantFiles = filterSpecificationFiles(files);
        if (relevantFiles.length > 0) {
          specDirectory = dir;
          specFiles = relevantFiles;
          primarySpecs = identifyPrimarySpecs(relevantFiles, dir);
          break; // Use first directory with spec files
        }
      }
    } catch (dirError) {
      // Directory doesn't exist or can't be accessed, continue searching
    }
  }

  // Also check root directory for specification files
  try {
    const rootFiles = await provider.listFiles('');
    const rootRelevantFiles = filterSpecificationFiles(rootFiles);
    rootSpecFiles = rootRelevantFiles;
    
    // If no organized spec directory found, use root files as primary
    if (!specDirectory && rootRelevantFiles.length > 0) {
      specFiles = rootRelevantFiles;
      primarySpecs = identifyPrimarySpecs(rootRelevantFiles, '');
    }
  } catch (rootError) {
    // Can't access root directory
  }

  const totalFiles = specFiles.length + (specDirectory ? 0 : rootSpecFiles.length);

  return {
    specFiles,
    specDirectory,
    primarySpecs,
    rootSpecFiles,
    searchedPaths,
    totalFiles
  };
}

/**
 * Filters a list of files to include only specification-relevant files.
 * 
 * @param {Array} files - Array of file objects from provider.listFiles()
 * @returns {Array} Filtered array of specification files
 * @private
 */
function filterSpecificationFiles(files) {
  return files.filter(file => {
    if (!file.isFile) return false;
    
    return SPEC_EXTENSIONS.some(ext => 
      file.name.toLowerCase().endsWith(ext.toLowerCase())
    );
  });
}

/**
 * Identifies primary specification files from a list of files.
 * 
 * Primary specification files are those with common names that typically
 * contain the main specification content.
 * 
 * @param {Array} files - Array of specification files
 * @param {string} directory - The directory containing the files
 * @returns {Array} Array of primary specification files
 * @private
 */
function identifyPrimarySpecs(files, directory) {
  const primaryFiles = [];
  
  for (const file of files) {
    const fileName = file.name.toLowerCase();
    if (PRIMARY_SPEC_NAMES.some(name => fileName === name.toLowerCase())) {
      primaryFiles.push(file);
    }
  }
  
  return primaryFiles;
}

// Export the health check function as default for easy registration
export default checkSpecFiles;