/**
 * @fileoverview Health check utilities and common types for spec-up-t-healthcheck
 * 
 * This module provides shared utilities, type definitions, and helper functions
 * used across all health check modules. It ensures consistency in health check
 * result formatting and provides a centralized location for common functionality.
 * 
 * @author spec-up-t-healthcheck
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {string} check - The name/identifier of the health check
 * @property {'pass'|'fail'|'warn'|'skip'} status - The result status
 * @property {string} message - Human-readable result message
 * @property {string} timestamp - ISO timestamp when the check was performed
 * @property {Object} [details={}] - Additional details about the check result
 */

/**
 * @typedef {Object} HealthCheckSummary
 * @property {number} total - Total number of checks performed
 * @property {number} passed - Number of checks that passed
 * @property {number} failed - Number of checks that failed
 * @property {number} warnings - Number of checks with warnings
 * @property {number} skipped - Number of checks that were skipped
 * @property {number} score - Overall health score as a percentage (0-100)
 * @property {boolean} hasErrors - Whether any checks failed
 * @property {boolean} hasWarnings - Whether any checks had warnings
 */

/**
 * @typedef {Object} HealthCheckReport
 * @property {HealthCheckResult[]} results - Array of individual check results
 * @property {HealthCheckSummary} summary - Aggregated summary of all check results
 * @property {string} timestamp - ISO timestamp when the report was generated
 * @property {Object} provider - Information about the provider used for checks
 * @property {string} provider.type - The type of provider ('local', 'remote', etc.)
 * @property {string} [provider.repoPath] - The repository path (for local providers)
 */

/**
 * @typedef {function(import('./providers.js').Provider): Promise<HealthCheckResult>} HealthCheckFunction
 * @description A function that performs a health check using a provider and returns a result
 */

/**
 * Valid status values for health check results.
 * @type {readonly string[]}
 */
export const HEALTH_CHECK_STATUSES = Object.freeze(['pass', 'fail', 'warn', 'skip']);

/**
 * Creates a standardized health check result object.
 * 
 * This utility function ensures consistent structure across all health check results,
 * automatically adding timestamps and providing a standard format for reporting.
 * The function validates input parameters to maintain data integrity.
 * 
 * @param {string} check - The identifier/name of the health check being performed
 * @param {'pass'|'fail'|'warn'|'skip'} status - The status of the health check
 * @param {string} message - A human-readable message describing the result
 * @param {Object} [details={}] - Optional additional details about the check
 * @returns {HealthCheckResult} A standardized health check result object
 * @throws {Error} If check name or message is empty, or status is invalid
 * 
 * @example
 * ```javascript
 * const result = createHealthCheckResult(
 *   'package-json',
 *   'pass',
 *   'package.json is valid',
 *   { packageData: { name: 'my-spec', version: '1.0.0' } }
 * );
 * ```
 */
export function createHealthCheckResult(check, status, message, details = {}) {
  // Input validation to ensure data integrity
  if (typeof check !== 'string' || check.trim() === '') {
    throw new Error('Check name must be a non-empty string');
  }
  
  if (typeof message !== 'string' || message.trim() === '') {
    throw new Error('Message must be a non-empty string');
  }
  
  if (!HEALTH_CHECK_STATUSES.includes(status)) {
    throw new Error(`Status must be one of: ${HEALTH_CHECK_STATUSES.join(', ')}`);
  }
  
  if (details !== null && typeof details !== 'object') {
    throw new Error('Details must be an object or null');
  }

  return {
    check: check.trim(),
    status,
    message: message.trim(),
    timestamp: new Date().toISOString(),
    details: details || {}
  };
}

/**
 * Calculates summary statistics from an array of health check results.
 * 
 * This function aggregates individual health check results into a comprehensive
 * summary that includes counts, percentages, and boolean flags for quick
 * assessment of overall repository health.
 * 
 * @param {HealthCheckResult[]} results - Array of health check results to summarize
 * @returns {HealthCheckSummary} Aggregated summary statistics
 * 
 * @example
 * ```javascript
 * const results = [
 *   createHealthCheckResult('check1', 'pass', 'All good'),
 *   createHealthCheckResult('check2', 'fail', 'Found issue')
 * ];
 * const summary = calculateSummary(results);
 * console.log(summary.score); // 50 (50% passed)
 * ```
 */
export function calculateSummary(results) {
  if (!Array.isArray(results)) {
    throw new Error('Results must be an array');
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warn').length,
    skipped: results.filter(r => r.status === 'skip').length
  };

  // Calculate health score as percentage of passed checks
  summary.score = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  
  // Boolean flags for quick status assessment
  summary.hasErrors = summary.failed > 0;
  summary.hasWarnings = summary.warnings > 0;

  return summary;
}

/**
 * Validates that an object conforms to the HealthCheckResult interface.
 * 
 * This function performs runtime validation of health check result objects
 * to ensure they meet the expected structure and data types. Useful for
 * validating results from external or dynamic sources.
 * 
 * @param {any} result - The object to validate
 * @returns {boolean} True if the object is a valid HealthCheckResult
 * 
 * @example
 * ```javascript
 * const result = { check: 'test', status: 'pass', message: 'OK', timestamp: '...' };
 * if (isValidHealthCheckResult(result)) {
 *   // Safe to use as HealthCheckResult
 * }
 * ```
 */
export function isValidHealthCheckResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const requiredFields = ['check', 'status', 'message', 'timestamp'];
  
  // Check all required fields are present and have correct types
  for (const field of requiredFields) {
    if (!(field in result) || typeof result[field] !== 'string') {
      return false;
    }
  }

  // Validate status is a known value
  if (!HEALTH_CHECK_STATUSES.includes(result.status)) {
    return false;
  }

  // Validate timestamp is a valid ISO string
  if (isNaN(Date.parse(result.timestamp))) {
    return false;
  }

  // Details field is optional but must be an object if present
  if ('details' in result && (result.details === null || typeof result.details !== 'object')) {
    return false;
  }

  return true;
}

/**
 * Creates a standardized error result for health checks that encounter exceptions.
 * 
 * This utility function provides a consistent way to handle and report errors
 * that occur during health check execution, ensuring proper error information
 * is captured and formatted for reporting.
 * 
 * @param {string} check - The identifier of the health check that encountered an error
 * @param {Error|string} error - The error object or error message
 * @param {Object} [additionalDetails={}] - Additional context about the error
 * @returns {HealthCheckResult} A standardized error result
 * 
 * @example
 * ```javascript
 * try {
 *   // Health check logic
 * } catch (error) {
 *   return createErrorResult('my-check', error, { context: 'additional info' });
 * }
 * ```
 */
export function createErrorResult(check, error, additionalDetails = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const details = {
    error: errorMessage,
    ...(errorStack && { stack: errorStack }),
    ...additionalDetails
  };

  return createHealthCheckResult(
    check,
    'fail',
    `Error during health check: ${errorMessage}`,
    details
  );
}