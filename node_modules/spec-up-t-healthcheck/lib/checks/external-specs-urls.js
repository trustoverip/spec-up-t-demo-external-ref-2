/**
 * @fileoverview External Specs URL Validator
 *
 * This module validates external specification references in specs.json,
 * specifically checking the structure and accessibility of URLs.
 * It verifies both gh_page and url fields exist, have correct formats,
 * and return HTTP 200 responses.
 *
 * @author spec-up-t-healthcheck
 */

import axios from 'axios';
import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * The identifier for this health check
 * @type {string}
 */
export const CHECK_ID = 'external-specs-urls';

/**
 * Human-readable name for this health check
 * @type {string}
 */
export const CHECK_NAME = 'External Specs URL Validation';

/**
 * Description of what this health check validates
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates external specification URLs exist, have correct structure, and are accessible';

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
 * Assumes proxy.php is in the public root directory
 * @type {string}
 */
const PROXY_URL = './proxy.php';

/**
 * Detects if code is running in a browser environment
 * 
 * @returns {boolean} True if running in browser
 */
function isBrowserEnvironment() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Validates that a string is a properly formatted URL
 * 
 * @param {string} urlString - The URL string to validate
 * @returns {{isValid: boolean, message?: string}} Validation result
 */
function validateUrlStructure(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        return { isValid: false, message: 'URL is missing or not a string' };
    }

    if (urlString.trim() === '') {
        return { isValid: false, message: 'URL is empty' };
    }

    try {
        const url = new URL(urlString);

        // Check protocol
        if (!['http:', 'https:'].includes(url.protocol)) {
            return {
                isValid: false,
                message: `URL must use http or https protocol, found: ${url.protocol}`
            };
        }

        // Check for hostname
        if (!url.hostname) {
            return { isValid: false, message: 'URL must have a hostname' };
        }

        return { isValid: true };
    } catch (error) {
        return {
            isValid: false,
            message: `Invalid URL format: ${error.message}`
        };
    }
}

/**
 * Validates that a URL matches GitHub Pages URL pattern
 * 
 * @param {string} urlString - The URL string to validate
 * @returns {{isValid: boolean, message?: string}} Validation result
 */
function validateGitHubPagesStructure(urlString) {
    const structureCheck = validateUrlStructure(urlString);
    if (!structureCheck.isValid) {
        return structureCheck;
    }

    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();

        // Check if it's a GitHub Pages URL
        if (hostname.endsWith('.github.io')) {
            return { isValid: true };
        }

        // Custom domain could also be used for GitHub Pages
        // We'll accept any valid URL but note it's not standard GitHub Pages
        return {
            isValid: true,
            message: `Valid URL (${urlString}) but not a standard GitHub Pages domain (.github.io)`
        };
    } catch (error) {
        return {
            isValid: false,
            message: `Error validating GitHub Pages URL: ${error.message}`
        };
    }
}

/**
 * Validates that a URL matches GitHub repository URL pattern
 * 
 * @param {string} urlString - The URL string to validate
 * @returns {{isValid: boolean, message?: string}} Validation result
 */
function validateGitHubRepoStructure(urlString) {
    const structureCheck = validateUrlStructure(urlString);
    if (!structureCheck.isValid) {
        return structureCheck;
    }

    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();

        // Check if it's a GitHub URL
        if (hostname === 'github.com' || hostname === 'www.github.com') {
            // Check basic path structure (should have at least /owner/repo)
            const pathParts = url.pathname.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                return {
                    isValid: false,
                    message: 'GitHub URL should have format: https://github.com/{owner}/{repo}'
                };
            }

            return { isValid: true };
        }

        return {
            isValid: false,
            message: 'URL is not a GitHub repository URL (should be github.com)'
        };
    } catch (error) {
        return {
            isValid: false,
            message: `Error validating GitHub repository URL: ${error.message}`
        };
    }
}

/**
 * Checks if a URL is accessible and returns HTTP 200
 * 
 * @param {string} url - The URL to check
 * @param {string} fieldName - Name of the field being checked (for error messages)
 * @returns {Promise<{isAccessible: boolean, statusCode?: number, message?: string}>}
 */
async function checkUrlAccessibility(url, fieldName) {
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
 * Attempts to check URL accessibility using HEAD request
 * In browser environments, attempts to use proxy to bypass CORS restrictions.
 * Falls back gracefully if proxy is unavailable (e.g., in dev environment).
 * 
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
 * In browser environments, attempts to use proxy to bypass CORS restrictions.
 * Falls back gracefully if proxy is unavailable (e.g., in dev environment).
 * 
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
 * 
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

/**
 * Validates a single external spec entry
 * 
 * @param {Object} spec - The external spec object to validate
 * @param {number} index - Index of the spec in the array
 * @param {boolean} checkAccessibility - Whether to check URL accessibility
 * @returns {Promise<Object>} Validation results for this spec
 */
async function validateExternalSpec(spec, index, checkAccessibility = true) {
    const results = {
        specIndex: index,
        specId: spec.external_spec || `[spec ${index}]`,
        errors: [],
        warnings: [],
        info: [],
        success: []
    };

    // Check gh_page field existence
    if (!('gh_page' in spec)) {
        results.errors.push('Field "gh_page" is missing');
    } else if (!spec.gh_page) {
        results.errors.push('Field "gh_page" is empty');
    } else {
        results.success.push('Field "gh_page" exists');

        // Validate gh_page structure
        const ghPageStructure = validateGitHubPagesStructure(spec.gh_page);
        if (!ghPageStructure.isValid) {
            results.errors.push(`gh_page structure invalid: ${ghPageStructure.message}`);
        } else {
            results.success.push('Field "gh_page" has valid URL structure');

            if (ghPageStructure.message) {
                results.info.push(ghPageStructure.message);
            }

            // Check gh_page accessibility
            if (checkAccessibility) {
                const accessibility = await checkUrlAccessibility(spec.gh_page, 'gh_page');
                if (accessibility.isAccessible) {
                    results.success.push(`gh_page is accessible (HTTP ${accessibility.statusCode})`);
                } else {
                    results.errors.push(accessibility.message || 'gh_page is not accessible');
                }
            }
        }
    }

    // Check url field existence
    if (!('url' in spec)) {
        results.errors.push('Field "url" is missing');
    } else if (!spec.url) {
        results.errors.push('Field "url" is empty');
    } else {
        results.success.push('Field "url" exists');

        // Validate url structure
        const urlStructure = validateGitHubRepoStructure(spec.url);
        if (!urlStructure.isValid) {
            results.errors.push(`url structure invalid: ${urlStructure.message}`);
        } else {
            results.success.push('Field "url" has valid GitHub repository structure');

            // Check url accessibility
            if (checkAccessibility) {
                const accessibility = await checkUrlAccessibility(spec.url, 'url');
                if (accessibility.isAccessible) {
                    results.success.push(`url is accessible (HTTP ${accessibility.statusCode})`);
                } else {
                    results.errors.push(accessibility.message || 'url is not accessible');
                }
            }
        }
    }

    return results;
}

/**
 * Validates external specification URLs in specs.json
 *
 * This health check performs comprehensive validation of external spec references:
 * 1. Checks if gh_page field exists and is not empty
 * 2. Validates gh_page URL structure (proper format for GitHub Pages)
 * 3. Checks if gh_page URL is accessible (returns HTTP 200)
 * 4. Checks if url field exists and is not empty
 * 5. Validates url structure (proper format for GitHub repository)
 * 6. Checks if url is accessible (returns HTTP 200)
 *
 * Note: In browser environments, accessibility checks use a proxy (/proxy.php)
 * to bypass CORS restrictions. The proxy must be available for full validation.
 *
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @param {Object} options - Validation options
 * @param {boolean} options.checkAccessibility - Whether to check URL accessibility (default: true)
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result
 *
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkExternalSpecsUrls(provider);
 * console.log(result.status); // 'pass', 'fail', or 'warn'
 * ```
 */
export async function checkExternalSpecsUrls(provider, options = {}) {
    // Default to checking accessibility (proxy handles CORS in browser)
    const checkAccessibility = options.checkAccessibility !== undefined 
        ? options.checkAccessibility 
        : true;

    try {
        // Check if specs.json exists
        const exists = await provider.fileExists('specs.json');
        if (!exists) {
            return createHealthCheckResult(
                CHECK_NAME,
                'fail',
                'specs.json not found - cannot validate external specs',
                {
                    suggestions: [
                        'Create a specs.json file in the repository root',
                        'Run the specs-json health check first'
                    ]
                }
            );
        }

        // Read and parse specs.json
        const content = await provider.readFile('specs.json');
        let specsData;

        try {
            specsData = JSON.parse(content);
        } catch (parseError) {
            return createHealthCheckResult(
                CHECK_NAME,
                'fail',
                'specs.json contains invalid JSON',
                { parseError: parseError.message }
            );
        }

        // Check if specs array exists
        if (!specsData.specs || !Array.isArray(specsData.specs) || specsData.specs.length === 0) {
            return createHealthCheckResult(
                CHECK_NAME,
                'fail',
                'No specs found in specs.json',
                { details: 'specs.json must contain a "specs" array with at least one entry' }
            );
        }

        const spec = specsData.specs[0];

        // Check if external_specs exists
        if (!spec.external_specs) {
            return createHealthCheckResult(
                CHECK_NAME,
                'pass',
                'No external_specs defined (this is acceptable)',
                {
                    info: 'This specification does not reference external specifications',
                    note: 'If you want to add external specs, add an "external_specs" array to your spec'
                }
            );
        }

        // Validate external_specs is an array
        if (!Array.isArray(spec.external_specs)) {
            return createHealthCheckResult(
                CHECK_NAME,
                'fail',
                'external_specs must be an array',
                { actualType: typeof spec.external_specs }
            );
        }

        // If empty array, that's acceptable
        if (spec.external_specs.length === 0) {
            return createHealthCheckResult(
                CHECK_NAME,
                'pass',
                'external_specs array is empty (this is acceptable)',
                { info: 'No external specifications are configured' }
            );
        }

        // Validate each external spec
        const allResults = [];
        const totalErrors = [];
        const totalWarnings = [];
        const totalInfo = [];
        const totalSuccess = [];

        for (let i = 0; i < spec.external_specs.length; i++) {
            const extSpec = spec.external_specs[i];
            const result = await validateExternalSpec(extSpec, i, checkAccessibility);
            allResults.push(result);

            totalErrors.push(...result.errors.map(err => `${result.specId}: ${err}`));
            totalWarnings.push(...result.warnings.map(warn => `${result.specId}: ${warn}`));
            totalInfo.push(...result.info.map(inf => `${result.specId}: ${inf}`));
            totalSuccess.push(...result.success.map(succ => `${result.specId}: ${succ}`));
        }

        // Determine overall status
        let status = 'pass';
        let message = `All ${spec.external_specs.length} external spec(s) validated successfully`;

        if (totalErrors.length > 0) {
            status = 'fail';
            message = `Found ${totalErrors.length} error(s) in external specs`;
        } else if (totalWarnings.length > 0) {
            status = 'warn';
            message = `External specs validated with ${totalWarnings.length} warning(s)`;
        } else if (totalInfo.length > 0) {
            // Info messages don't affect the pass status
            message = `All ${spec.external_specs.length} external spec(s) validated successfully (${totalInfo.length} info note(s))`;
        }

        // Collect all informational messages
        const infoMessages = [...totalInfo];
        if (isBrowserEnvironment() && checkAccessibility) {
            infoMessages.push('URL accessibility checks performed via proxy (browser environment)');
        }

        return createHealthCheckResult(
            CHECK_NAME,
            status,
            message,
            {
                totalSpecs: spec.external_specs.length,
                errors: totalErrors,
                warnings: totalWarnings,
                success: totalSuccess,
                info: infoMessages.length > 0 ? infoMessages : undefined,
                detailedResults: allResults,
                accessibilityChecked: checkAccessibility
            }
        );

    } catch (error) {
        return createErrorResult(CHECK_NAME, error);
    }
}

// Export as default for backward compatibility
export default {
    CHECK_ID,
    CHECK_NAME,
    CHECK_DESCRIPTION,
    checkExternalSpecsUrls
};
