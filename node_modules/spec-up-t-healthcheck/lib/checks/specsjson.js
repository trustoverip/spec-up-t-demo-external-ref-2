/**
 * @fileoverview Specs.json health check module
 *
 * This module validates the existence and structure of specs.json files in
 * specification repositories. It ensures that essential spec metadata is
 * present and properly formatted, including URL accessibility and file existence.
 *
 * @author spec-up-t-healthcheck
 */

import axios from 'axios';
import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'specs-json';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = 'specs.json';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates the existence and structure of specs.json file, including URL accessibility and file existence';

/**
 * Required fields that must be present in a valid specs.json file.
 * These fields are essential for proper spec functionality in Spec-Up-T.
 * @type {readonly string[]}
 */
const REQUIRED_FIELDS = Object.freeze([
  'title',
  'description', 
  'author',
  'spec_directory',
  'spec_terms_directory',
  'output_path',
  'markdown_paths',
  'logo',
  'logo_link',
  'source'
]);

/**
 * Warning fields that should be present but missing values only trigger warnings.
 * @type {readonly string[]}
 */
const WARNING_FIELDS = Object.freeze(['favicon']);

/**
 * Optional fields that provide info if missing.
 * @type {readonly string[]}
 */
const OPTIONAL_FIELDS = Object.freeze(['anchor_symbol', 'katex']);

/**
 * Timeout for HTTP requests in milliseconds
 * @type {number}
 */
const HTTP_TIMEOUT = 10000;

/**
 * Maximum number of redirects to follow
 * @type {number}
 */
const MAX_REDIRECTS = 5;

/**
 * Proxy URL for browser environments (to bypass CORS)
 * @type {string}
 */
const PROXY_URL = './proxy.php';

/**
 * Validates the existence and structure of specs.json in a repository.
 *
 * This health check ensures that a valid specs.json file exists at the repository root
 * and contains the required fields for proper Spec-Up-T functionality. It performs
 * comprehensive validation of the specs.json structure including the specs array.
 *
 * The check performs the following validations:
 * - File exists at repository root
 * - File contains valid JSON
 * - Root object contains exactly one 'specs' field
 * - 'specs' is an array with exactly one object
 * - Required fields are present and non-empty
 * - Warning fields are checked (favicon)
 * - Optional fields are noted if missing
 * - Source object has required subfields
 * - URL accessibility for logo, logo_link, and favicon (HTTP 200 OK)
 * - Markdown files specified in markdown_paths exist in spec_directory
 *
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result with validation details
 *
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkSpecsJson(provider);
 * console.log(result.status); // 'pass', 'fail', or 'warn'
 * ```
 */
export async function checkSpecsJson(provider) {
  try {
        // Check if specs.json exists
    const exists = await provider.fileExists('specs.json');
    if (!exists) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'specs.json not found in repository root',
        {
          suggestions: [
            'Create a specs.json file in your repository root',
            'Use the Spec-Up-T boilerplate as a template',
            'Ensure the file is named exactly "specs.json"'
          ]
        }
      );
    }

    // Read and parse the specs.json file
    const content = await provider.readFile('specs.json');
    let specsData;

    try {
      specsData = JSON.parse(content);
    } catch (parseError) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'specs.json contains invalid JSON',
        {
          parseError: parseError.message,
          fileContent: content.substring(0, 500) + (content.length > 500 ? '...' : '')
        }
      );
    }

    // Validate basic structure
    const structureValidation = validateBasicStructure(specsData);
    if (!structureValidation.isValid) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        structureValidation.message,
        { structureError: structureValidation.details }
      );
    }

    const spec = specsData.specs[0];
    const validationResults = {
      errors: [],
      warnings: [],
      info: [],
      success: []
    };

    // Validate required fields
    validateRequiredFields(spec, validationResults);
    
    // Validate warning fields  
    validateWarningFields(spec, validationResults);
    
    // Validate optional fields
    validateOptionalFields(spec, validationResults);
    
    // Validate field types and structure
    validateFieldTypes(spec, validationResults);
    
    // Validate URL accessibility
    await validateUrlAccessibility(spec, validationResults);
    
    // Validate markdown file existence
    await validateMarkdownFiles(spec, provider, validationResults);

    // Determine overall status
    let status = 'pass';
    let message = 'specs.json is valid';

    if (validationResults.errors.length > 0) {
      status = 'fail';
      message = `specs.json has ${validationResults.errors.length} error(s)`;
    } else if (validationResults.warnings.length > 0) {
      status = 'warn';
      message = `specs.json is valid but has ${validationResults.warnings.length} warning(s)`;
    }

    return createHealthCheckResult(
      CHECK_NAME,
      status,
      message,
      {
        errors: validationResults.errors,
        warnings: validationResults.warnings,
        info: validationResults.info,
        success: validationResults.success,
        totalIssues: validationResults.errors.length + validationResults.warnings.length
      }
    );

  } catch (error) {
    return createErrorResult(CHECK_NAME, error);
  }
}

/**
 * Validates the basic structure of specs.json
 * @param {any} data - Parsed JSON data
 * @returns {{isValid: boolean, message?: string, details?: any}}
 */
function validateBasicStructure(data) {
  // Check if data is an object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      isValid: false,
      message: 'specs.json must contain a JSON object at root level',
      details: { actualType: Array.isArray(data) ? 'array' : typeof data }
    };
  }

  // Check if it contains exactly one field called 'specs'
  const keys = Object.keys(data);
  if (keys.length !== 1) {
    return {
      isValid: false,
      message: `Root object should contain exactly one field, found ${keys.length}: [${keys.join(', ')}]`,
      details: { foundKeys: keys }
    };
  }

  if (keys[0] !== 'specs') {
    return {
      isValid: false,
      message: `Root object should contain field 'specs', found '${keys[0]}'`,
      details: { foundKey: keys[0] }
    };
  }

  // Check if specs is an array
  if (!Array.isArray(data.specs)) {
    return {
      isValid: false,
      message: 'Field "specs" should be an array',
      details: { actualType: typeof data.specs }
    };
  }

  // Check if array contains exactly one object
  if (data.specs.length !== 1) {
    return {
      isValid: false,
      message: `Field "specs" should contain exactly one object, found ${data.specs.length}`,
      details: { arrayLength: data.specs.length }
    };
  }

  // Check if the single item is an object
  if (typeof data.specs[0] !== 'object' || data.specs[0] === null || Array.isArray(data.specs[0])) {
    return {
      isValid: false,
      message: 'The item in "specs" array should be an object',
      details: { actualType: Array.isArray(data.specs[0]) ? 'array' : typeof data.specs[0] }
    };
  }

  return { isValid: true };
}

/**
 * Validates required fields
 * @param {Object} spec - The spec object to validate
 * @param {Object} results - Results accumulator
 */
function validateRequiredFields(spec, results) {
  REQUIRED_FIELDS.forEach(field => {
    if (!(field in spec)) {
      results.errors.push(`Required field "${field}" is missing`);
    } else if (spec[field] === null || spec[field] === undefined || spec[field] === '') {
      results.errors.push(`Required field "${field}" is empty or null`);
    } else if (Array.isArray(spec[field]) && spec[field].length === 0) {
      results.errors.push(`Required field "${field}" is an empty array`);
    } else {
      results.success.push(`Required field "${field}" is present and valid`);
    }
  });
}

/**
 * Validates warning fields
 * @param {Object} spec - The spec object to validate  
 * @param {Object} results - Results accumulator
 */
function validateWarningFields(spec, results) {
  WARNING_FIELDS.forEach(field => {
    if (!(field in spec)) {
      results.warnings.push(`Recommended field "${field}" is missing`);
    } else if (spec[field] === null || spec[field] === undefined || spec[field] === '') {
      results.warnings.push(`Recommended field "${field}" is empty or null`);
    } else {
      results.success.push(`Recommended field "${field}" is present and valid`);
    }
  });
}

/**
 * Validates optional fields
 * @param {Object} spec - The spec object to validate
 * @param {Object} results - Results accumulator  
 */
function validateOptionalFields(spec, results) {
  OPTIONAL_FIELDS.forEach(field => {
    if (!(field in spec)) {
      results.info.push(`Optional field "${field}" is not set (this is acceptable)`);
    } else {
      results.success.push(`Optional field "${field}" is present`);
    }
  });
}

/**
 * Validates specific field types and formats
 * @param {Object} spec - The spec object to validate
 * @param {Object} results - Results accumulator
 */
function validateFieldTypes(spec, results) {
  // Validate markdown_paths is array of strings
  if (spec.markdown_paths && Array.isArray(spec.markdown_paths)) {
    if (spec.markdown_paths.every(item => typeof item === 'string')) {
      results.success.push('Field "markdown_paths" contains valid string array');
    } else {
      results.errors.push('Field "markdown_paths" should contain only strings');
    }
  }

  // Validate source object structure
  if (spec.source && typeof spec.source === 'object') {
    const requiredSourceFields = ['host', 'account', 'repo', 'branch'];
    let sourceValid = true;
    
    requiredSourceFields.forEach(field => {
      if (!(field in spec.source) || !spec.source[field]) {
        if (field === 'branch') {
          results.warnings.push(`Source field "${field}" is missing or empty`);
        } else {
          results.errors.push(`Source field "${field}" is missing or empty`);
          sourceValid = false;
        }
      }
    });
    
    if (sourceValid) {
      results.success.push('Source object structure is valid');
    }
  }

  // Validate external_specs if present
  if (spec.external_specs) {
    if (Array.isArray(spec.external_specs)) {
      spec.external_specs.forEach((extSpec, index) => {
        const requiredExtFields = ['external_spec', 'gh_page', 'url', 'terms_dir'];
        requiredExtFields.forEach(field => {
          if (!(field in extSpec) || !extSpec[field]) {
            results.errors.push(`External spec ${index} missing "${field}"`);
          }
        });
      });
      results.success.push(`External specs array contains ${spec.external_specs.length} entries`);
    } else {
      results.errors.push('Field "external_specs" should be an array');
    }
  }

  // Validate katex is boolean if present
  if ('katex' in spec && typeof spec.katex !== 'boolean') {
    results.errors.push('Field "katex" should be a boolean value');
  }
}

/**
 * Validates URL accessibility for logo, logo_link, and favicon fields
 * @param {Object} spec - The spec object to validate
 * @param {Object} results - Results accumulator
 */
async function validateUrlAccessibility(spec, results) {
  const urlFields = [
    { field: 'logo', required: true },
    { field: 'logo_link', required: true },
    { field: 'favicon', required: false }
  ];

  for (const { field, required } of urlFields) {
    if (spec[field]) {
      try {
        const accessibility = await checkUrlAccessibility(spec[field], field);
        if (accessibility.isAccessible) {
          results.success.push(`${field} URL is accessible (HTTP ${accessibility.statusCode})`);
        } else {
          if (required) {
            results.errors.push(`${field} URL is not accessible: ${accessibility.message}`);
          } else {
            results.warnings.push(`${field} URL is not accessible: ${accessibility.message}`);
          }
        }
      } catch (error) {
        if (required) {
          results.errors.push(`Failed to check ${field} URL accessibility: ${error.message}`);
        } else {
          results.warnings.push(`Failed to check ${field} URL accessibility: ${error.message}`);
        }
      }
    }
  }
}

/**
 * Validates that markdown files specified in markdown_paths exist in spec_directory
 * @param {Object} spec - The spec object to validate
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @param {Object} results - Results accumulator
 */
async function validateMarkdownFiles(spec, provider, results) {
  if (!spec.markdown_paths || !Array.isArray(spec.markdown_paths)) {
    return;
  }

  if (!spec.spec_directory) {
    results.errors.push('Cannot validate markdown files: spec_directory is not defined');
    return;
  }

  for (const markdownFile of spec.markdown_paths) {
    if (typeof markdownFile !== 'string') {
      results.errors.push(`Invalid markdown_paths entry: "${markdownFile}" is not a string`);
      continue;
    }

    // Construct the full path to the markdown file
    const filePath = `${spec.spec_directory.replace(/\/$/, '')}/${markdownFile}`;
    
    try {
      const exists = await provider.fileExists(filePath);
      if (exists) {
        results.success.push(`Markdown file "${markdownFile}" exists in spec_directory`);
      } else {
        results.errors.push(`Markdown file "${markdownFile}" not found in spec_directory "${spec.spec_directory}"`);
      }
    } catch (error) {
      results.errors.push(`Failed to check existence of markdown file "${markdownFile}": ${error.message}`);
    }
  }
}

/**
 * Checks if a URL is accessible and returns HTTP 200
 * @param {string} url - The URL to check
 * @param {string} fieldName - Name of the field being checked (for error messages)
 * @returns {Promise<{isAccessible: boolean, statusCode?: number, message?: string}>}
 */
async function checkUrlAccessibility(url, fieldName) {
  // Validate URL format first
  if (!isValidUrl(url)) {
    return {
      isAccessible: false,
      message: `Invalid URL format: ${url}`
    };
  }

  // First, try HEAD request (more efficient)
  const headResult = await attemptHeadRequest(url, fieldName);
  if (headResult !== null) {
    return headResult;
  }

  // If HEAD fails, try GET request (some servers don't support HEAD)
  const getResult = await attemptGetRequest(url, fieldName);
  return getResult;
}

/**
 * Validates URL format
 * @param {string} urlString - URL to validate
 * @returns {boolean} True if URL is valid
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Detects if running in browser environment
 * @returns {boolean} True if in browser environment
 */
function isBrowserEnvironment() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Attempts to check URL accessibility using HEAD request
 * @param {string} url - The URL to check
 * @param {string} fieldName - Name of the field being checked
 * @returns {Promise<Object|null>} Result object or null if HEAD is not supported
 */
async function attemptHeadRequest(url, fieldName) {
  try {
    const isBrowser = isBrowserEnvironment();
    
    if (isBrowser) {
      // In browser, try using proxy first
      try {
        const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
        const response = await axios.head(proxyUrl, {
          timeout: HTTP_TIMEOUT,
          validateStatus: (status) => status < 500
        });
        return createAccessibilityResult(response.status, fieldName);
      } catch (proxyError) {
        // Proxy not available (e.g., dev environment without PHP)
        // Return null to skip this check gracefully
        return null;
      }
    } else {
      // In Node.js, make direct request
      const response = await axios.head(url, {
        timeout: HTTP_TIMEOUT,
        maxRedirects: MAX_REDIRECTS,
        validateStatus: (status) => status < 500
      });
      return createAccessibilityResult(response.status, fieldName);
    }
  } catch (error) {
    // Return null to signal that GET should be attempted
    return null;
  }
}

/**
 * Attempts to check URL accessibility using GET request
 * @param {string} url - The URL to check
 * @param {string} fieldName - Name of the field being checked
 * @returns {Promise<Object>} Result object
 */
async function attemptGetRequest(url, fieldName) {
  try {
    const isBrowser = isBrowserEnvironment();
    
    if (isBrowser) {
      // In browser, try using proxy
      try {
        const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
        const response = await axios.get(proxyUrl, {
          timeout: HTTP_TIMEOUT,
          validateStatus: (status) => status < 500
        });
        return createAccessibilityResult(response.status, fieldName);
      } catch (proxyError) {
        // Proxy not available (e.g., dev environment without PHP)
        return {
          isAccessible: false,
          message: `${fieldName} accessibility check skipped (proxy unavailable in dev environment)`
        };
      }
    } else {
      // In Node.js, make direct request
      const response = await axios.get(url, {
        timeout: HTTP_TIMEOUT,
        maxRedirects: MAX_REDIRECTS,
        validateStatus: (status) => status < 500
      });
      return createAccessibilityResult(response.status, fieldName);
    }
  } catch (error) {
    return {
      isAccessible: false,
      message: `${fieldName} is not accessible: ${error.code || error.message}`
    };
  }
}

/**
 * Creates a standardized accessibility result based on HTTP status code
 * @param {number} statusCode - HTTP status code
 * @param {string} fieldName - Name of the field being checked
 * @returns {Object} Accessibility result
 */
function createAccessibilityResult(statusCode, fieldName) {
  if (statusCode === 200) {
    return {
      isAccessible: true,
      statusCode: 200
    };
  } else {
    return {
      isAccessible: false,
      statusCode: statusCode,
      message: `${fieldName} returned HTTP ${statusCode}`
    };
  }
}

// Export as default for backward compatibility
export default {
  CHECK_ID,
  CHECK_NAME,
  CHECK_DESCRIPTION,
  checkSpecsJson
};
