/**
 * @fileoverview Providers module for spec-up-t-healthcheck
 * 
 * This module contains provider implementations for accessing specification files
 * from different sources (local filesystem, remote repositories, etc.).
 * Providers offer a unified interface for file operations regardless of the underlying source.
 * 
 * @author spec-up-t-healthcheck
 
 */

import fs from 'fs/promises';
import path from 'path';

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
 * Creates a local filesystem provider for accessing specification files.
 * 
 * The local provider enables reading files from a local directory structure,
 * providing async methods for file operations with proper error handling.
 * All file paths are resolved relative to the provided repository path.
 * 
 * @param {string} repoPath - The absolute or relative path to the local repository root
 * @returns {Provider} A provider object with methods for file operations
 * 
 * @example
 * ```javascript
 * const provider = createLocalProvider('/path/to/spec/repo');
 * const content = await provider.readFile('spec/example.md');
 * const exists = await provider.fileExists('package.json');
 * const files = await provider.listFiles('spec');
 * ```
 * 
 * @throws {Error} When file operations fail due to permissions or other filesystem errors
 */
export function createLocalProvider(repoPath) {
  const provider = {
    type: 'local',
    repoPath,
    
    /**
     * Returns the base path of the repository.
     * 
     * @returns {string} The base path of the repository
     */
    getBasePath() {
      return repoPath;
    },
    
    /**
     * Reads the content of a file from the local filesystem.
     * 
     * @param {string} filePath - The relative path to the file from the repository root
     * @returns {Promise<string>} The file content as a UTF-8 string
     * 
     * @throws {Error} When the file is not found (ENOENT)
     * @throws {Error} When there's a filesystem error reading the file
     * 
     * @example
     * ```javascript
     * const content = await provider.readFile('spec/introduction.md');
     * console.log(content); // File content as string
     * ```
     */
    async readFile(filePath) {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        return content;
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Error reading file ${filePath}: ${error.message}`);
      }
    },

    /**
     * Checks whether a file exists in the local filesystem.
     * 
     * @param {string} filePath - The relative path to the file from the repository root
     * @returns {Promise<boolean>} True if the file exists, false otherwise
     * 
     * @example
     * ```javascript
     * const exists = await provider.fileExists('package.json');
     * if (exists) {
     *   console.log('Package.json found');
     * }
     * ```
     */
    async fileExists(filePath) {
      const fullPath = path.join(repoPath, filePath);
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Checks whether a directory exists in the local filesystem.
     * 
     * @param {string} dirPath - The relative path to the directory from the repository root
     * @returns {Promise<boolean>} True if the directory exists, false otherwise
     * 
     * @example
     * ```javascript
     * const exists = await provider.directoryExists('spec');
     * if (exists) {
     *   console.log('Spec directory found');
     * }
     * ```
     */
    async directoryExists(dirPath) {
      const fullPath = path.join(repoPath, dirPath);
      try {
        const stats = await fs.stat(fullPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    },

    /**
     * Lists all files and directories in the specified directory.
     * 
     * @param {string} [dirPath=''] - The relative path to the directory from the repository root.
     *                                Defaults to the repository root if not specified.
     * @returns {Promise<FileEntry[]>} An array of file entries with metadata
     * 
     * @throws {Error} When the directory cannot be read or doesn't exist
     * 
     * @example
     * ```javascript
     * const entries = await provider.listFiles('spec');
     * entries.forEach(entry => {
     *   console.log(`${entry.name} - ${entry.isDirectory ? 'DIR' : 'FILE'}`);
     * });
     * ```
     */
    async listFiles(dirPath = '') {
      const fullPath = path.join(repoPath, dirPath);
      try {
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        return entries.map(entry => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        }));
      } catch (error) {
        throw new Error(`Error listing directory ${dirPath}: ${error.message}`);
      }
    }
  };
  
  return provider;
}

/**
 * Creates a provider based on the input type (local path or remote URL).
 * 
 * This factory function automatically determines the appropriate provider type
 * based on the input format. Currently supports local filesystem providers,
 * with remote providers planned for future implementation.
 * 
 * @param {string} input - The path or URL to the specification repository.
 *                        Local paths can be absolute or relative.
 *                        Remote URLs should start with http:// or https://
 * @returns {Provider} An appropriate provider instance for the input type
 * 
 * @throws {Error} When remote URLs are provided (not yet implemented)
 * 
 * @example
 * ```javascript
 * // Create a local provider
 * const localProvider = createProvider('/path/to/spec');
 * 
 * // Remote provider (throws error - not implemented)
 * const remoteProvider = createProvider('https://github.com/user/spec-repo');
 * ```
 * 
 * @since 1.0.0
 */
export function createProvider(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    throw new Error('Remote providers not yet implemented');
  }
  return createLocalProvider(input);
}
