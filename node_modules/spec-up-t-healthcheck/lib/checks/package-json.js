/**
 * @fileoverview Package.json health check module
 * 
 * This module validates the existence and structure of package.json files in
 * specification repositories. It ensures that essential package metadata is
 * present and properly formatted for Node.js compatibility.
 * 
 * It also validates spec-up-t specific requirements:
 * - Presence of spec-up-t dependency with correct version range
 * - Required npm scripts from configScriptsKeys
 * 
 * @author spec-up-t-healthcheck
 */

import { createHealthCheckResult, createErrorResult } from '../health-check-utils.js';

/**
 * The identifier for this health check, used in reports and registries.
 * @type {string}
 */
export const CHECK_ID = 'package-json';

/**
 * Human-readable name for this health check.
 * @type {string}
 */
export const CHECK_NAME = 'package.json';

/**
 * Description of what this health check validates.
 * @type {string}
 */
export const CHECK_DESCRIPTION = 'Validates the existence and structure of package.json file';

/**
 * Required fields that must be present in a valid package.json file.
 * These fields are essential for proper Node.js package identification.
 * @type {readonly string[]}
 */
const REQUIRED_FIELDS = Object.freeze(['name', 'version']);

/**
 * Recommended fields that should be present in a well-formed package.json.
 * Missing these fields will generate warnings rather than failures.
 * @type {readonly string[]}
 */
const RECOMMENDED_FIELDS = Object.freeze(['description', 'author', 'license']);

/**
 * GitHub URL for the starter pack repository that defines the reference configuration.
 * This is used to fetch the latest recommended spec-up-t version dynamically.
 * @type {string}
 */
const STARTER_PACK_PACKAGE_URL = 'https://raw.githubusercontent.com/trustoverip/spec-up-t-starter-pack/main/package.spec-up-t.json';

/**
 * GitHub URL for the config scripts keys that define required npm scripts.
 * This is used to fetch the latest required scripts dynamically.
 * @type {string}
 */
const CONFIG_SCRIPTS_URL = 'https://raw.githubusercontent.com/trustoverip/spec-up-t/master/src/install-from-boilerplate/config-scripts-keys.js';

/**
 * Cache duration for fetched external configuration (in milliseconds).
 * Set to 1 hour to avoid excessive network requests while keeping data reasonably fresh.
 * @type {number}
 */
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * In-memory cache for external configuration data.
 * @type {Object}
 * @private
 */
let configCache = {
  starterPackVersion: null,
  configScripts: null,
  lastFetch: 0
};

/**
 * Fetches the latest spec-up-t version from the starter pack repository.
 * 
 * This function retrieves the reference package.json from the spec-up-t-starter-pack
 * repository to determine the currently recommended spec-up-t version. Results are
 * cached to minimize network requests.
 * 
 * @returns {Promise<string|null>} The spec-up-t version string (e.g., "^1.3.0") or null if fetch fails
 * @private
 */
async function fetchStarterPackVersion() {
  const now = Date.now();
  
  // Return cached version if still valid
  if (configCache.starterPackVersion && (now - configCache.lastFetch) < CACHE_DURATION) {
    return configCache.starterPackVersion;
  }

  try {
    const response = await fetch(STARTER_PACK_PACKAGE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const packageData = await response.json();
    const version = packageData?.dependencies?.[`spec-up-t`];
    
    if (version) {
      configCache.starterPackVersion = version;
      configCache.lastFetch = now;
      return version;
    }
    
    return null;
  } catch (error) {
    // Return cached version if available, even if expired
    return configCache.starterPackVersion || null;
  }
}

/**
 * Fetches the required npm scripts from the config-scripts-keys.js file.
 * 
 * This function retrieves the reference configScriptsKeys from the spec-up-t
 * repository to determine which npm scripts should be present. Results are
 * cached to minimize network requests.
 * 
 * @returns {Promise<Object|null>} The configScriptsKeys object or null if fetch fails
 * @private
 */
async function fetchConfigScriptsKeys() {
  const now = Date.now();
  
  // Return cached scripts if still valid
  if (configCache.configScripts && (now - configCache.lastFetch) < CACHE_DURATION) {
    return configCache.configScripts;
  }

  try {
    const response = await fetch(CONFIG_SCRIPTS_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const scriptContent = await response.text();
    
    // Extract configScriptsKeys using regex since we're parsing JS, not JSON
    const match = scriptContent.match(/const configScriptsKeys = ({[\s\S]*?});/);
    if (!match) {
      return null;
    }
    
    // Convert the JavaScript object literal to JSON
    // This is a simplified parser that handles the specific format used
    const scriptsObj = parseConfigScriptsObject(match[1]);
    
    if (scriptsObj) {
      configCache.configScripts = scriptsObj;
      configCache.lastFetch = now;
      return scriptsObj;
    }
    
    return null;
  } catch (error) {
    // Return cached scripts if available, even if expired
    return configCache.configScripts || null;
  }
}

/**
 * Parses a JavaScript object literal string into a proper object.
 * 
 * This function handles the specific format used in config-scripts-keys.js,
 * extracting key-value pairs from the object literal. It uses a simple
 * regex-based approach suitable for the expected format.
 * 
 * @param {string} objStr - The JavaScript object literal string
 * @returns {Object|null} The parsed object or null if parsing fails
 * @private
 */
function parseConfigScriptsObject(objStr) {
  try {
    // Extract all key-value pairs from the object literal
    // Handles escaped quotes within string values
    const pairs = objStr.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gm);
    const result = {};
    
    for (const match of pairs) {
      // Unescape the captured value to match JSON-parsed strings
      const unescapedValue = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      result[match[1]] = unescapedValue;
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    return null;
  }
}

/**
 * Validates that the spec-up-t dependency is present and has a compatible version.
 * 
 * This function checks if:
 * - The spec-up-t dependency exists in package.json
 * - The version range is compatible with the reference version from the starter pack
 * 
 * @param {Object} packageData - The parsed package.json data
 * @param {string|null} referenceVersion - The reference version from starter pack
 * @returns {Object} Validation result with status and details
 * @private
 */
function validateSpecUpTDependency(packageData, referenceVersion) {
  const dependencies = packageData.dependencies || {};
  const devDependencies = packageData.devDependencies || {};
  const allDeps = { ...dependencies, ...devDependencies };
  
  const specUpTVersion = allDeps['spec-up-t'];
  
  // Check if spec-up-t dependency exists
  if (!specUpTVersion) {
    return {
      isValid: false,
      severity: 'fail',
      message: 'spec-up-t dependency not found in dependencies or devDependencies',
      details: {
        expectedInDependencies: true,
        foundInDependencies: false
      }
    };
  }
  
  // If we couldn't fetch the reference version, just verify presence
  if (!referenceVersion) {
    return {
      isValid: true,
      severity: 'warn',
      message: 'spec-up-t dependency found, but could not verify version against starter pack (network issue)',
      details: {
        currentVersion: specUpTVersion,
        referenceVersionUnavailable: true
      }
    };
  }
  
  // Compare version ranges
  const versionMatch = specUpTVersion === referenceVersion;
  
  if (!versionMatch) {
    return {
      isValid: false,
      severity: 'warn',
      message: `spec-up-t version differs from starter pack recommendation`,
      details: {
        currentVersion: specUpTVersion,
        recommendedVersion: referenceVersion,
        starterPackUrl: STARTER_PACK_PACKAGE_URL
      }
    };
  }
  
  return {
    isValid: true,
    severity: 'pass',
    message: 'spec-up-t dependency is correctly configured',
    details: {
      currentVersion: specUpTVersion,
      matchesStarterPack: true
    }
  };
}

/**
 * Validates that required npm scripts are present in package.json.
 * 
 * This function checks if the required scripts from configScriptsKeys are
 * present in the package.json scripts section. It reports missing scripts
 * and scripts with different implementations.
 * 
 * @param {Object} packageData - The parsed package.json data
 * @param {Object|null} configScriptsKeys - The reference scripts from spec-up-t
 * @returns {Object} Validation result with status and details
 * @private
 */
function validateScripts(packageData, configScriptsKeys) {
  const packageScripts = packageData.scripts || {};
  
  // If we couldn't fetch the reference scripts, skip validation
  if (!configScriptsKeys) {
    return {
      isValid: true,
      severity: 'warn',
      message: 'Could not verify npm scripts against spec-up-t reference (network issue)',
      details: {
        referenceScriptsUnavailable: true,
        scriptCount: Object.keys(packageScripts).length
      }
    };
  }
  
  const missingScripts = [];
  const differentScripts = [];
  
  // Check each required script
  for (const [scriptName, expectedCommand] of Object.entries(configScriptsKeys)) {
    if (!packageScripts[scriptName]) {
      missingScripts.push(scriptName);
    } else if (packageScripts[scriptName] !== expectedCommand) {
      differentScripts.push({
        name: scriptName,
        current: packageScripts[scriptName],
        expected: expectedCommand
      });
    }
  }
  
  // Determine severity based on what's missing or different
  if (missingScripts.length > 0) {
    return {
      isValid: false,
      severity: 'fail',
      message: `Missing required npm scripts: ${missingScripts.join(', ')}`,
      details: {
        missingScripts,
        differentScripts: differentScripts.length > 0 ? differentScripts : undefined,
        totalRequired: Object.keys(configScriptsKeys).length,
        configScriptsUrl: CONFIG_SCRIPTS_URL
      }
    };
  }
  
  if (differentScripts.length > 0) {
    return {
      isValid: false,
      severity: 'warn',
      message: `Some npm scripts differ from spec-up-t reference: ${differentScripts.map(s => s.name).join(', ')}`,
      details: {
        differentScripts,
        configScriptsUrl: CONFIG_SCRIPTS_URL
      }
    };
  }
  
  return {
    isValid: true,
    severity: 'pass',
    message: 'All required npm scripts are present and correct',
    details: {
      scriptCount: Object.keys(packageScripts).length,
      requiredScriptCount: Object.keys(configScriptsKeys).length,
      allScriptsMatch: true
    }
  };
}

/**
 * Validates the existence and structure of package.json in a repository.
 * 
 * This health check ensures that a valid package.json file exists at the repository root
 * and contains the required fields for a proper Node.js package. It checks for the
 * presence of essential metadata and validates JSON structure.
 * 
 * The check performs the following validations:
 * - File exists at repository root
 * - File contains valid JSON
 * - Required fields (name, version) are present
 * - Recommended fields are present (warnings if missing)
 * - spec-up-t dependency is present with correct version
 * - Required npm scripts from configScriptsKeys are present
 * 
 * @param {import('../providers.js').Provider} provider - The provider instance for file operations
 * @returns {Promise<import('../health-check-utils.js').HealthCheckResult>} The health check result with validation details
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/repo');
 * const result = await checkPackageJson(provider);
 * console.log(result.status); // 'pass', 'fail', or 'warn'
 * ```
 */
export async function checkPackageJson(provider) {
  try {
    // Check if package.json exists
    const exists = await provider.fileExists('package.json');
    if (!exists) {
      return createHealthCheckResult(
        CHECK_NAME, 
        'fail', 
        'package.json not found in repository root'
      );
    }

    // Read and parse the package.json file
    const content = await provider.readFile('package.json');
    let packageData;
    
    try {
      packageData = JSON.parse(content);
    } catch (parseError) {
      return createHealthCheckResult(
        CHECK_NAME,
        'fail',
        'package.json contains invalid JSON',
        { 
          parseError: parseError.message,
          fileContent: content.substring(0, 500) + (content.length > 500 ? '...' : '')
        }
      );
    }

    // Validate required fields
    const missingRequired = REQUIRED_FIELDS.filter(field => 
      !packageData[field] || (typeof packageData[field] === 'string' && packageData[field].trim() === '')
    );
    
    if (missingRequired.length > 0) {
      return createHealthCheckResult(
        CHECK_NAME, 
        'fail', 
        `Missing required fields: ${missingRequired.join(', ')}`,
        { 
          missingRequired,
          presentFields: Object.keys(packageData),
          packageSample: extractPackageSample(packageData)
        }
      );
    }

    // Fetch external reference data (with caching)
    const [referenceVersion, configScriptsKeys] = await Promise.all([
      fetchStarterPackVersion(),
      fetchConfigScriptsKeys()
    ]);

    // Validate spec-up-t dependency
    const depValidation = validateSpecUpTDependency(packageData, referenceVersion);
    
    // Validate npm scripts
    const scriptsValidation = validateScripts(packageData, configScriptsKeys);

    // Check for recommended fields (warnings)
    const missingRecommended = RECOMMENDED_FIELDS.filter(field => 
      !packageData[field] || (typeof packageData[field] === 'string' && packageData[field].trim() === '')
    );

    // Aggregate all validation results
    const details = {
      packageSample: extractPackageSample(packageData),
      hasAllRequired: true,
      missingRecommended,
      fieldCount: Object.keys(packageData).length,
      dependency: depValidation.details,
      scripts: scriptsValidation.details
    };

    // Determine overall status based on all validations
    const validations = [
      { severity: missingRecommended.length > 0 ? 'warn' : 'pass', message: missingRecommended.length > 0 ? `Missing recommended fields: ${missingRecommended.join(', ')}` : null },
      { severity: depValidation.severity, message: depValidation.message },
      { severity: scriptsValidation.severity, message: scriptsValidation.message }
    ];

    // Priority: fail > warn > pass
    const hasFail = validations.some(v => v.severity === 'fail');
    const hasWarn = validations.some(v => v.severity === 'warn');
    
    let overallStatus = 'pass';
    let messages = [];
    
    if (hasFail) {
      overallStatus = 'fail';
      messages = validations.filter(v => v.severity === 'fail').map(v => v.message);
    } else if (hasWarn) {
      overallStatus = 'warn';
      messages = validations.filter(v => v.severity === 'warn').map(v => v.message);
    } else {
      messages = ['package.json is valid and well-formed with correct spec-up-t configuration'];
    }

    return createHealthCheckResult(
      CHECK_NAME, 
      overallStatus, 
      messages.join('; '),
      details
    );

  } catch (error) {
    return createErrorResult(CHECK_NAME, error, {
      context: 'checking package.json file',
      provider: provider.type
    });
  }
}

/**
 * Extracts a safe sample of package.json data for reporting purposes.
 * 
 * This function creates a sanitized version of package data that can be safely
 * included in health check results without exposing sensitive information.
 * 
 * @param {Object} packageData - The parsed package.json data
 * @returns {Object} A sanitized sample of the package data
 * @private
 */
function extractPackageSample(packageData) {
  const safeFields = ['name', 'version', 'description', 'author', 'license'];
  const sample = {};
  
  for (const field of safeFields) {
    if (packageData[field]) {
      sample[field] = packageData[field];
    }
  }
  
  return sample;
}

// Export the health check function as default for easy registration
export default checkPackageJson;