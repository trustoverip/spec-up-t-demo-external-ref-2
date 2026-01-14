/**
 * @fileoverview Spec Directory and Files health check module
 * 
 * This module validates the directory structure and required files specified
 * in specs.json. It ensures that the spec_directory and spec_terms_directory
 * exist, and validates the presence of required markdown files.
 * 
 * @author spec-up-t-healthcheck
 */

import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * Simple cross-platform path joining that works in both Node.js and browser.
 * Normalizes paths by:
 * - Removing leading './' from paths
 * - Ensuring single '/' separators between segments
 * - Handling empty segments
 * 
 * @param {...string} segments - Path segments to join
 * @returns {string} Joined path
 * @private
 */
function joinPath(...segments) {
  return segments
    .filter(segment => segment && segment !== '')  // Remove empty segments
    .map(segment => segment.replace(/^\.\//, ''))  // Remove leading './'
    .map(segment => segment.replace(/\/$/, ''))    // Remove trailing '/'
    .join('/')
    .replace(/\/+/g, '/');  // Replace multiple '/' with single '/'
}

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'spec-directory-and-files';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = 'Specification Directory and Files';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates spec directories and required markdown files';

/**
 * Required markdown files that must exist in spec_directory.
 * @type {readonly string[]}
 */
const REQUIRED_SPEC_FILES = Object.freeze(['terms-and-definitions-intro.md']);

/**
 * Recommended markdown files that should exist in spec_directory.
 * @type {readonly string[]}
 */
const RECOMMENDED_SPEC_FILES = Object.freeze(['spec-head.md', 'spec-body.md']);

/**
 * Validates the existence of spec directories and required files specified in specs.json.
 * 
 * This health check performs the following validations:
 * - Checks if specs.json exists and can be parsed
 * - Validates that spec_directory exists (triggers error if missing)
 * - Validates that spec_terms_directory exists (triggers error if missing)
 * - Checks for mandatory terms-and-definitions-intro.md file (triggers error if missing)
 * - Checks for recommended spec-head.md and spec-body.md files (triggers warning if missing)
 * - Checks if spec_terms_directory contains any markdown files (triggers warning if empty)
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result with validation details
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkSpecDirectoryAndFiles(provider);
 * console.log(result.status); // 'pass', 'fail', or 'warn'
 * ```
 */
export async function checkSpecDirectoryAndFiles(provider) {
  try {
    // First, check if specs.json exists
    const specsJsonExists = await provider.fileExists('specs.json');
    if (!specsJsonExists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'specs.json not found - cannot validate spec directories',
        {
          errors: ['specs.json file is required to determine spec directory locations']
        }
      );
    }

    // Read and parse specs.json
    const specsJsonContent = await provider.readFile('specs.json');
    let specsData;
    
    try {
      specsData = JSON.parse(specsJsonContent);
    } catch (parseError) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'specs.json contains invalid JSON',
        {
          errors: [`Failed to parse specs.json: ${parseError.message}`]
        }
      );
    }

    // Validate basic structure
    if (!specsData.specs || !Array.isArray(specsData.specs) || specsData.specs.length === 0) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'specs.json has invalid structure',
        {
          errors: ['specs.json must contain a "specs" array with at least one entry']
        }
      );
    }

    const spec = specsData.specs[0];
    const validationResults = {
      errors: [],
      warnings: [],
      success: []
    };

    // Extract directory paths
    const specDirectory = spec.spec_directory;
    const specTermsDirectory = spec.spec_terms_directory;

    // Resolve spec_terms_directory path
    // If it's a relative path (doesn't start with ./ or /), join it with spec_directory
    let fullSpecTermsDirectory = specTermsDirectory;
    if (specDirectory && specTermsDirectory) {
      if (!specTermsDirectory.startsWith('./') && !specTermsDirectory.startsWith('/')) {
        // Relative path - join with spec_directory using our cross-platform joinPath
        fullSpecTermsDirectory = joinPath(specDirectory, specTermsDirectory);
      }
    }

    // Validate spec_directory exists
    await validateSpecDirectory(provider, specDirectory, validationResults);

    // Validate spec_terms_directory exists
    await validateSpecTermsDirectory(provider, fullSpecTermsDirectory, specTermsDirectory, validationResults);

    // Validate required files in spec_directory
    if (specDirectory) {
      await validateRequiredFiles(provider, specDirectory, validationResults);
      await validateRecommendedFiles(provider, specDirectory, validationResults);
    }

    // Validate spec_terms_directory contains markdown files
    if (fullSpecTermsDirectory) {
      await validateTermsDirectoryFiles(provider, fullSpecTermsDirectory, specTermsDirectory, validationResults);
    }

    // Determine overall status
    let status = 'pass';
    let message = 'All spec directories and required files are present';

    if (validationResults.errors.length > 0) {
      status = 'fail';
      message = `Found ${validationResults.errors.length} critical issue(s) with spec directories or files`;
    } else if (validationResults.warnings.length > 0) {
      status = 'warn';
      message = `Spec directories are valid but ${validationResults.warnings.length} recommended file(s) are missing`;
    }

    return createHealthCheckResult(
      CHECK_NAME,
      status,
      message,
      {
        errors: validationResults.errors,
        warnings: validationResults.warnings,
        success: validationResults.success,
        specDirectory,
        specTermsDirectory,
        fullSpecTermsDirectory
      }
    );

  } catch (error) {
    return createErrorResult(CHECK_NAME, error);
  }
}

/**
 * Validates that the spec_directory exists.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance
 * @param {string} specDirectory - The spec_directory path from specs.json
 * @param {Object} validationResults - Results object to populate
 * @private
 */
async function validateSpecDirectory(provider, specDirectory, validationResults) {
  // Check if spec_directory field exists
  if (!specDirectory) {
    validationResults.errors.push('spec_directory is not defined in specs.json');
    return;
  }

  try {
    // Check if the directory exists
    const dirExists = await provider.directoryExists(specDirectory);
    
    if (dirExists) {
      validationResults.success.push(`spec_directory exists: ${specDirectory}`);
    } else {
      validationResults.errors.push(`spec_directory does not exist: ${specDirectory}`);
    }
  } catch (error) {
    validationResults.errors.push(`Error checking spec_directory: ${error.message}`);
  }
}

/**
 * Validates that the spec_terms_directory exists.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance
 * @param {string} fullSpecTermsDirectory - The full path to the spec_terms_directory
 * @param {string} originalSpecTermsDirectory - The original spec_terms_directory value from specs.json
 * @param {Object} validationResults - Results object to populate
 * @private
 */
async function validateSpecTermsDirectory(provider, fullSpecTermsDirectory, originalSpecTermsDirectory, validationResults) {
  // Check if spec_terms_directory field exists
  if (!originalSpecTermsDirectory) {
    validationResults.errors.push('spec_terms_directory is not defined in specs.json');
    return;
  }

  try {
    // Check if the directory exists
    const dirExists = await provider.directoryExists(fullSpecTermsDirectory);
    
    if (dirExists) {
      validationResults.success.push(`spec_terms_directory exists: ${originalSpecTermsDirectory}`);
    } else {
      validationResults.errors.push(`spec_terms_directory does not exist: ${originalSpecTermsDirectory}`);
    }
  } catch (error) {
    validationResults.errors.push(`Error checking spec_terms_directory: ${error.message}`);
  }
}

/**
 * Validates the presence of required markdown files in spec_directory.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance
 * @param {string} specDirectory - The spec_directory path
 * @param {Object} validationResults - Results object to populate
 * @private
 */
async function validateRequiredFiles(provider, specDirectory, validationResults) {
  for (const filename of REQUIRED_SPEC_FILES) {
    const filePath = joinPath(specDirectory, filename);
    
    try {
      const fileExists = await provider.fileExists(filePath);
      
      if (fileExists) {
        validationResults.success.push(`Required file exists: ${filePath}`);
      } else {
        validationResults.errors.push(`Required file missing: ${filePath}`);
      }
    } catch (error) {
      validationResults.errors.push(`Error checking required file ${filePath}: ${error.message}`);
    }
  }
}

/**
 * Validates the presence of recommended markdown files in spec_directory.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance
 * @param {string} specDirectory - The spec_directory path
 * @param {Object} validationResults - Results object to populate
 * @private
 */
async function validateRecommendedFiles(provider, specDirectory, validationResults) {
  const foundFiles = [];
  const missingFiles = [];

  for (const filename of RECOMMENDED_SPEC_FILES) {
    const filePath = joinPath(specDirectory, filename);
    
    try {
      const fileExists = await provider.fileExists(filePath);
      
      if (fileExists) {
        foundFiles.push(filename);
      } else {
        missingFiles.push(filename);
      }
    } catch (error) {
      // Treat errors as missing files for recommended files
      missingFiles.push(filename);
    }
  }

  // Report results
  if (foundFiles.length > 0) {
    validationResults.success.push(`Found ${foundFiles.length} of ${RECOMMENDED_SPEC_FILES.length} recommended files: ${foundFiles.join(', ')}`);
  }

  if (missingFiles.length > 0) {
    validationResults.warnings.push(`Missing ${missingFiles.length} recommended markdown file(s) in ${specDirectory}: ${missingFiles.join(', ')}`);
  }
}

/**
 * Validates that the spec_terms_directory contains markdown files.
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance
 * @param {string} fullSpecTermsDirectory - The full path to the spec_terms_directory
 * @param {string} originalSpecTermsDirectory - The original spec_terms_directory value from specs.json
 * @param {Object} validationResults - Results object to populate
 * @private
 */
async function validateTermsDirectoryFiles(provider, fullSpecTermsDirectory, originalSpecTermsDirectory, validationResults) {
  try {
    // Check if directory exists first
    const dirExists = await provider.directoryExists(fullSpecTermsDirectory);
    
    if (!dirExists) {
      // Already reported as an error in validateSpecTermsDirectory
      return;
    }

    // List files in the directory
    const fileEntries = await provider.listFiles(fullSpecTermsDirectory);
    
    // Filter for markdown files (only actual files, not directories)
    const markdownFiles = fileEntries.filter(entry => 
      entry.isFile && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))
    );

    if (markdownFiles.length > 0) {
      validationResults.success.push(`spec_terms_directory contains ${markdownFiles.length} markdown file(s)`);
    } else {
      validationResults.warnings.push(`spec_terms_directory exists but contains no markdown files: ${originalSpecTermsDirectory}`);
    }
  } catch (error) {
    validationResults.warnings.push(`Unable to list files in spec_terms_directory: ${error.message}`);
  }
}
