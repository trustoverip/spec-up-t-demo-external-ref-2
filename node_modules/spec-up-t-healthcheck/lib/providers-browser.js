/**
 * @fileoverview Browser-compatible providers module
 * 
 * This is a browser-safe version of providers.js that doesn't import Node.js modules.
 * It only exports the createProvider function interface without the Node.js-specific
 * LocalFileProvider.
 * 
 * In browser environments, providers must be created by the consuming application
 * (e.g., GitHubUi creates a GitHub API provider).
 * 
 * @author spec-up-t-healthcheck
 */

/**
 * @typedef {Object} FileEntry
 * @property {string} name - The name of the file or directory
 * @property {string} path - The relative path from the repository root
 * @property {boolean} isDirectory - Whether this entry is a directory
 * @property {boolean} isFile - Whether this entry is a file
 */

/**
 * @typedef {Object} Provider
 * @property {string} type - The type of provider ('local', 'remote', etc.)
 * @property {string} repoPath - The base path or URL for the repository
 * @property {function(string): Promise<string>} readFile - Read a file and return its content
 * @property {function(string): Promise<boolean>} fileExists - Check if a file exists
 * @property {function(string): Promise<FileEntry[]>} listFiles - List files in a directory
 */

/**
 * Creates a provider based on the given configuration.
 * 
 * In browser environments, only custom providers are supported.
 * You must pass a pre-configured provider object.
 * 
 * @param {Object|string} config - Provider configuration or custom provider
 * @returns {Provider} The configured provider
 * @throws {Error} If trying to create a local file provider in browser
 * 
 * @example
 * ```javascript
 * // Browser: Pass a custom provider (e.g., GitHub API provider)
 * const provider = createProvider({
 *   type: 'github',
 *   repoPath: 'owner/repo/branch',
 *   readFile: async (path) => { ... },
 *   fileExists: async (path) => { ... },
 *   listFiles: async (dir) => { ... }
 * });
 * ```
 */
export function createProvider(config) {
  // If config is already a provider object with required methods, return it
  if (typeof config === 'object' && 
      config.readFile && 
      config.fileExists) {
    return config;
  }
  
  // If config is a string (file path), this is not supported in browser
  if (typeof config === 'string') {
    throw new Error(
      'Local file system providers are not available in browser environments. ' +
      'Please provide a custom provider object with readFile, fileExists, and listFiles methods.'
    );
  }
  
  throw new Error(
    'Invalid provider configuration. In browser environments, you must provide a ' +
    'custom provider object with readFile, fileExists, and listFiles methods.'
  );
}
