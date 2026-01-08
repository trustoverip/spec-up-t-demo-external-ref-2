/**
 * @fileoverview Health check orchestrator module
 * 
 * This module coordinates the execution of multiple health checks, manages
 * their sequencing, and generates comprehensive reports. It provides the
 * main interface for running health check suites and handles error recovery.
 * 
 * @author spec-up-t-healthcheck
 */

import { calculateSummary } from './health-check-utils.js';
import { globalRegistry } from './health-check-registry.js';

/**
 * @typedef {Object} HealthCheckOptions
 * @property {string[]} [checks] - Specific check IDs to run (runs all if not specified)
 * @property {string[]} [categories] - Categories of checks to run
 * @property {boolean} [continueOnError=true] - Whether to continue running checks after failures
 * @property {number} [timeout=30000] - Timeout for individual checks in milliseconds
 * @property {boolean} [parallel=false] - Whether to run checks in parallel (ignores dependencies)
 * @property {Object} [checkOptions={}] - Options to pass to individual health checks
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {import('./providers.js').Provider} provider - The provider instance
 * @property {HealthCheckOptions} options - Execution options
 * @property {Map<string, import('./health-check-utils.js').HealthCheckResult>} results - Results map
 * @property {string[]} failures - IDs of failed checks
 * @property {Date} startTime - When execution started
 */

/**
 * Health check orchestrator that coordinates running multiple health checks.
 * 
 * This class manages the execution flow of health checks, handles dependencies,
 * timeouts, error recovery, and report generation. It provides both sequential
 * and parallel execution modes.
 */
export class HealthCheckOrchestrator {
  constructor(registry = globalRegistry) {
    this.registry = registry;
    this.defaultOptions = {
      continueOnError: true,
      timeout: 30000,
      parallel: false,
      checkOptions: {}
    };
  }

  /**
   * Runs a comprehensive health check suite on a specification repository.
   * 
   * This is the main entry point for performing health checks. It orchestrates multiple
   * individual checks, aggregates results, and provides detailed reporting with summary
   * statistics. The function supports configurable check selection and provides comprehensive
   * error handling.
   * 
   * @param {import('./providers.js').Provider} provider - The provider instance for repository access
   * @param {HealthCheckOptions} [options={}] - Configuration options for the health check run
   * @returns {Promise<import('./health-check-utils.js').HealthCheckReport>} Complete health check report with results and summary
   * 
   * @example
   * ```javascript
   * const orchestrator = new HealthCheckOrchestrator();
   * const provider = createLocalProvider('/path/to/repo');
   * 
   * // Run all default checks
   * const report = await orchestrator.runHealthChecks(provider);
   * 
   * // Run specific checks only
   * const customReport = await orchestrator.runHealthChecks(provider, {
   *   checks: ['package-json']
   * });
   * 
   * // Run checks by category
   * const categoryReport = await orchestrator.runHealthChecks(provider, {
   *   categories: ['configuration', 'content']
   * });
   * 
   * console.log(`Health score: ${report.summary.score}%`);
   * console.log(`${report.summary.passed}/${report.summary.total} checks passed`);
   * ```
   */
  async runHealthChecks(provider, options = {}) {
    // Ensure the registry has discovered available checks
    if (!this.registry.autoDiscovered) {
      await this.registry.autoDiscover();
    }

    const mergedOptions = { ...this.defaultOptions, ...options };
    const context = this.createExecutionContext(provider, mergedOptions);
    
    try {
      const checksToRun = this.selectChecksToRun(mergedOptions);
      
      if (checksToRun.length === 0) {
        return this.createEmptyReport(context);
      }

      // Execute checks based on execution mode
      if (mergedOptions.parallel) {
        await this.runChecksInParallel(context, checksToRun);
      } else {
        await this.runChecksSequentially(context, checksToRun);
      }

      return this.generateReport(context);

    } catch (error) {
      return this.createErrorReport(context, error);
    }
  }

  /**
   * Creates an execution context for tracking check execution state.
   * 
   * @param {import('./providers.js').Provider} provider - The provider instance
   * @param {HealthCheckOptions} options - Execution options
   * @returns {ExecutionContext} The execution context
   * @private
   */
  createExecutionContext(provider, options) {
    return {
      provider,
      options,
      results: new Map(),
      failures: [],
      startTime: new Date()
    };
  }

  /**
   * Selects which health checks to run based on options.
   * 
   * @param {HealthCheckOptions} options - Execution options
   * @returns {string[]} Array of check IDs to run
   * @private
   */
  selectChecksToRun(options) {
    if (options.checks && options.checks.length > 0) {
      // Validate requested checks exist
      const validChecks = options.checks.filter(id => this.registry.has(id));
      if (validChecks.length !== options.checks.length) {
        const missing = options.checks.filter(id => !this.registry.has(id));
        console.warn(`Requested health checks not found: ${missing.join(', ')}`);
      }
      return validChecks;
    }

    if (options.categories && options.categories.length > 0) {
      const checksByCategory = [];
      for (const category of options.categories) {
        const categoryChecks = this.registry.getByCategory(category);
        checksByCategory.push(...categoryChecks.map(check => check.id));
      }
      return [...new Set(checksByCategory)]; // Remove duplicates
    }

    // Return all available checks in execution order
    const orderedChecks = this.registry.getExecutionOrder();
    return orderedChecks.map(check => check.id);
  }

  /**
   * Runs health checks sequentially, respecting dependencies and priority.
   * 
   * @param {ExecutionContext} context - Execution context
   * @param {string[]} checkIds - Array of check IDs to run
   * @private
   */
  async runChecksSequentially(context, checkIds) {
    const orderedChecks = this.registry.getExecutionOrder(checkIds);
    
    for (const checkMetadata of orderedChecks) {
      if (!context.options.continueOnError && context.failures.length > 0) {
        break; // Stop on first failure if configured
      }

      try {
        const result = await this.executeWithTimeout(
          checkMetadata.id, 
          context.provider, 
          context.options.timeout
        );
        
        context.results.set(checkMetadata.id, result);
        
        if (result.status === 'fail') {
          context.failures.push(checkMetadata.id);
        }

      } catch (error) {
        const errorResult = this.createCheckErrorResult(checkMetadata.id, error);
        context.results.set(checkMetadata.id, errorResult);
        context.failures.push(checkMetadata.id);
      }
    }
  }

  /**
   * Runs health checks in parallel for faster execution.
   * 
   * @param {ExecutionContext} context - Execution context
   * @param {string[]} checkIds - Array of check IDs to run
   * @private
   */
  async runChecksInParallel(context, checkIds) {
    const checkPromises = checkIds.map(async (checkId) => {
      try {
        const result = await this.executeWithTimeout(
          checkId, 
          context.provider, 
          context.options.timeout
        );
        return { checkId, result, error: null };
      } catch (error) {
        return { checkId, result: null, error };
      }
    });

    const results = await Promise.allSettled(checkPromises);
    
    for (const promiseResult of results) {
      if (promiseResult.status === 'fulfilled') {
        const { checkId, result, error } = promiseResult.value;
        
        if (error) {
          const errorResult = this.createCheckErrorResult(checkId, error);
          context.results.set(checkId, errorResult);
          context.failures.push(checkId);
        } else {
          context.results.set(checkId, result);
          if (result.status === 'fail') {
            context.failures.push(checkId);
          }
        }
      } else {
        // This shouldn't happen with our current implementation, but handle it
        console.error('Unexpected promise rejection in parallel execution:', promiseResult.reason);
      }
    }
  }

  /**
   * Executes a health check with timeout protection.
   * 
   * @param {string} checkId - The health check ID
   * @param {import('./providers.js').Provider} provider - The provider instance
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<import('./health-check-utils.js').HealthCheckResult>} The check result
   * @private
   */
  async executeWithTimeout(checkId, provider, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Health check '${checkId}' timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await this.registry.execute(checkId, provider);
        clearTimeout(timeoutHandle);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Creates an error result for a health check that failed to execute.
   * 
   * @param {string} checkId - The health check ID
   * @param {Error} error - The error that occurred
   * @returns {import('./health-check-utils.js').HealthCheckResult} Error result
   * @private
   */
  createCheckErrorResult(checkId, error) {
    return {
      check: checkId,
      status: 'fail',
      message: `Health check execution failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      details: {
        error: error.message,
        executionError: true
      }
    };
  }

  /**
   * Generates the final health check report.
   * 
   * @param {ExecutionContext} context - Execution context
   * @returns {import('./health-check-utils.js').HealthCheckReport} The complete report
   * @private
   */
  generateReport(context) {
    const results = Array.from(context.results.values());
    const summary = calculateSummary(results);
    const executionTime = Date.now() - context.startTime.getTime();

    return {
      results,
      summary: {
        ...summary,
        executionTimeMs: executionTime,
        executionDate: context.startTime.toISOString()
      },
      timestamp: new Date().toISOString(),
      provider: {
        type: context.provider.type,
        ...(context.provider.repoPath && { repoPath: context.provider.repoPath })
      }
    };
  }

  /**
   * Creates an empty report when no checks are selected.
   * 
   * @param {ExecutionContext} context - Execution context
   * @returns {import('./health-check-utils.js').HealthCheckReport} Empty report
   * @private
   */
  createEmptyReport(context) {
    return {
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        skipped: 0,
        score: 0,
        hasErrors: false,
        hasWarnings: false,
        executionTimeMs: 0
      },
      timestamp: new Date().toISOString(),
      provider: {
        type: context.provider.type,
        ...(context.provider.repoPath && { repoPath: context.provider.repoPath })
      }
    };
  }

  /**
   * Creates an error report when orchestration fails.
   * 
   * @param {ExecutionContext} context - Execution context
   * @param {Error} error - The orchestration error
   * @returns {import('./health-check-utils.js').HealthCheckReport} Error report
   * @private
   */
  createErrorReport(context, error) {
    const results = Array.from(context.results.values());
    const summary = calculateSummary(results);

    return {
      results,
      summary: {
        ...summary,
        orchestrationError: error.message
      },
      timestamp: new Date().toISOString(),
      provider: {
        type: context.provider.type,
        ...(context.provider.repoPath && { repoPath: context.provider.repoPath })
      },
      error: {
        message: error.message,
        type: 'orchestration'
      }
    };
  }

  /**
   * Gets available health checks with their metadata.
   * 
   * @returns {Object[]} Array of available health check metadata
   */
  getAvailableChecks() {
    return this.registry.getAllIds().map(id => {
      const metadata = this.registry.get(id);
      return {
        id: metadata.id,
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        enabled: metadata.enabled,
        priority: metadata.priority
      };
    });
  }
}

/**
 * Global orchestrator instance for convenient access.
 * @type {HealthCheckOrchestrator}
 */
export const globalOrchestrator = new HealthCheckOrchestrator();

/**
 * Convenience function to run health checks using the global orchestrator.
 * 
 * @param {import('./providers.js').Provider} provider - The provider instance
 * @param {HealthCheckOptions} [options={}] - Execution options
 * @returns {Promise<import('./health-check-utils.js').HealthCheckReport>} The health check report
 */
export async function runHealthChecks(provider, options = {}) {
  return globalOrchestrator.runHealthChecks(provider, options);
}