/**
 * @fileoverview Cross-platform file opener utility
 * 
 * This module provides functionality to open files and URLs in the user's default
 * application across different operating systems. It handles platform-specific
 * commands and provides consistent error handling and feedback.
 * 
 * @author spec-up-t-healthcheck
 
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { existsSync } from 'fs';

/**
 * Opens a file or URL in the default application.
 * 
 * This function automatically detects the operating system and uses the appropriate
 * command to open files or URLs. It provides cross-platform compatibility for
 * opening HTML files in the default browser.
 * 
 * @param {string} target - The file path or URL to open
 * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
 * 
 * @example
 * ```javascript
 * // Open an HTML file
 * const success = await openFile('/path/to/report.html');
 * if (success) {
 *   console.log('Report opened in browser');
 * }
 * 
 * // Open a URL
 * await openFile('https://example.com');
 * ```
 */
export async function openFile(target) {
  return new Promise((resolve) => {
    // Validate file exists if it's a local path
    if (!target.startsWith('http') && !existsSync(target)) {
      console.error(`File does not exist: ${target}`);
      resolve(false);
      return;
    }

    const platformType = platform();
    const commands = {
      'darwin': ['open', target],
      'win32': ['cmd', '/c', 'start', '', target],
      'default': ['xdg-open', target]
    };
    
    const [command, ...args] = commands[platformType] || commands.default;

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    });

    // Simple error handling - resolve false on error, true on success
    child.on('error', () => resolve(false));
    child.on('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

/**
 * Opens an HTML file in the default browser.
 * 
 * This is a convenience wrapper around openFile specifically for HTML files.
 * It provides additional validation and more specific error messages for HTML content.
 * 
 * @param {string} htmlFilePath - Path to the HTML file to open
 * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
 * 
 * @example
 * ```javascript
 * const reportPath = '/tmp/health-report.html';
 * const opened = await openHtmlFile(reportPath);
 * if (!opened) {
 *   console.error('Failed to open HTML report');
 * }
 * ```
 */
export async function openHtmlFile(htmlFilePath) {
  if (!htmlFilePath.toLowerCase().endsWith('.html') && !htmlFilePath.toLowerCase().endsWith('.htm')) {
    console.warn('Warning: File does not appear to be an HTML file');
  }
  
  return await openFile(htmlFilePath);
}

/**
 * Gets the platform-specific command for opening files.
 * 
 * This utility function returns the command name that would be used to open files
 * on the current platform. This is useful for debugging or displaying information to users.
 * NOTE: This function only returns the command name as a string - it does NOT open files.
 * To actually open files, use openFile() or openHtmlFile() instead.
 * 
 * @returns {string} The platform-specific open command name
 * 
 * @example
 * ```javascript
 * const commandName = getOpenCommand();
 * console.log(`Using command: ${commandName}`); // e.g., "open" on macOS
 * 
 * // To actually open a file, use openFile() or openHtmlFile():
 * const success = await openFile('report.html');
 * const success2 = await openHtmlFile('report.html');
 * ```
 */
export function getOpenCommand() {
  const platformType = platform();
  
  switch (platformType) {
    case 'darwin':
      return 'open';
    case 'win32':
      return 'start';
    default:
      return 'xdg-open';
  }
}