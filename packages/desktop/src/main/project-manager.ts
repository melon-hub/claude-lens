/**
 * Project Manager for Claude Lens Desktop
 *
 * Analyzes project folders to detect type, framework, and dev commands.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectInfo {
  path: string;
  name: string;
  type: 'node' | 'static' | 'unknown';
  packageJson?: {
    name: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  devCommand?: string;
  suggestedPort?: number;
  framework?: 'react' | 'vue' | 'svelte' | 'next' | 'vite' | 'angular' | 'unknown';
  entryFile?: string; // For static projects: the HTML file to serve (e.g., "index.html" or "app.html")
}

/**
 * Analyze a project folder and return information about it
 */
export async function analyzeProject(projectPath: string): Promise<ProjectInfo> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const indexHtmlPath = path.join(projectPath, 'index.html');
  const publicIndexPath = path.join(projectPath, 'public', 'index.html');

  const info: ProjectInfo = {
    path: projectPath,
    name: path.basename(projectPath),
    type: 'unknown',
  };

  // Check for package.json (Node project)
  if (fs.existsSync(packageJsonPath)) {
    try {
      info.type = 'node';
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      info.packageJson = packageJson;

      // Detect dev command from scripts
      // Note: We'll add port arguments below after detecting framework
      const scripts = packageJson.scripts || {};
      if (scripts.dev) {
        info.devCommand = 'npm run dev';
      } else if (scripts.start) {
        info.devCommand = 'npm start';
      } else if (scripts.serve) {
        info.devCommand = 'npm run serve';
      } else if (scripts.develop) {
        info.devCommand = 'npm run develop';
      }

      // Detect framework from dependencies
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Determine if this is a Vite project (for port handling)
      const isViteProject = !!deps['vite'];

      // Note: Avoid port 5173 as Claude Lens uses it during development
      // Use 5174 for Vite projects instead
      if (deps['next']) {
        info.framework = 'next';
        info.suggestedPort = 3000;
      } else if (deps['@angular/core']) {
        info.framework = 'angular';
        info.suggestedPort = 4200;
      } else if (deps['vue']) {
        info.framework = 'vue';
        info.suggestedPort = isViteProject ? 5174 : 8080;
      } else if (deps['svelte']) {
        info.framework = 'svelte';
        info.suggestedPort = isViteProject ? 5174 : 5000;
      } else if (deps['react']) {
        info.framework = 'react';
        // Check if using Vite or CRA (avoid 5173 - used by Claude Lens dev)
        info.suggestedPort = isViteProject ? 5174 : 3000;
      } else if (isViteProject) {
        info.framework = 'vite';
        info.suggestedPort = 5174;
      } else {
        info.suggestedPort = 3000;
      }

      // Note: We don't modify the dev command with port args because:
      // 1. Not all scripts forward arguments correctly
      // 2. The pre-flight port check in DevServerManager will catch conflicts
      // 3. Vite will auto-increment port if 5173 is busy (5174, 5175, etc.)
      // For production builds of Claude Lens, port 5173 won't be in use anyway
    } catch (err) {
      console.error('Failed to parse package.json:', err);
    }
  }
  // Check for HTML files (static site)
  else {
    // First check for standard index.html locations
    if (fs.existsSync(indexHtmlPath)) {
      info.type = 'static';
      info.entryFile = 'index.html';
      info.suggestedPort = 8080;
    } else if (fs.existsSync(publicIndexPath)) {
      info.type = 'static';
      info.entryFile = 'public/index.html';
      info.suggestedPort = 8080;
    } else {
      // Look for any HTML file in the root directory
      try {
        const files = fs.readdirSync(projectPath);
        const htmlFile = files.find(f => f.endsWith('.html') || f.endsWith('.htm'));
        if (htmlFile) {
          info.type = 'static';
          info.entryFile = htmlFile;
          info.suggestedPort = 8080;
        }
      } catch {
        // Directory read failed, leave as unknown
      }
    }
  }

  return info;
}

/**
 * Check if node_modules exists for a Node project
 */
export function hasNodeModules(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, 'node_modules'));
}

export interface DependencyHealth {
  status: 'healthy' | 'missing' | 'stale' | 'cross-platform';
  message: string;
  suggestion?: string;
}

/**
 * Check the health of node_modules - detect missing, stale, or cross-platform issues
 */
export async function checkDependencyHealth(projectPath: string): Promise<DependencyHealth> {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageLockPath = path.join(projectPath, 'package-lock.json');

  // Check if node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
    return {
      status: 'missing',
      message: 'node_modules folder not found',
      suggestion: 'Run npm install to install dependencies',
    };
  }

  // Check for cross-platform issues by looking at native modules
  const platformIssue = await detectCrossPlatformIssue(nodeModulesPath);
  if (platformIssue) {
    return {
      status: 'cross-platform',
      message: platformIssue,
      suggestion: 'Delete node_modules and package-lock.json, then run npm install',
    };
  }

  // Check if package-lock.json is newer than node_modules (stale)
  if (fs.existsSync(packageLockPath)) {
    try {
      const lockStat = fs.statSync(packageLockPath);
      const nmStat = fs.statSync(nodeModulesPath);
      if (lockStat.mtimeMs > nmStat.mtimeMs) {
        return {
          status: 'stale',
          message: 'package-lock.json is newer than node_modules',
          suggestion: 'Run npm install to update dependencies',
        };
      }
    } catch {
      // Stat failed, proceed anyway
    }
  }

  // Check if package.json is newer than node_modules
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkgStat = fs.statSync(packageJsonPath);
      const nmStat = fs.statSync(nodeModulesPath);
      if (pkgStat.mtimeMs > nmStat.mtimeMs) {
        return {
          status: 'stale',
          message: 'package.json is newer than node_modules',
          suggestion: 'Run npm install to update dependencies',
        };
      }
    } catch {
      // Stat failed, proceed anyway
    }
  }

  return { status: 'healthy', message: 'Dependencies look healthy' };
}

/**
 * Detect if node_modules was installed on a different platform
 * Common issue: installed on Windows but running in WSL/Linux
 */
async function detectCrossPlatformIssue(nodeModulesPath: string): Promise<string | null> {
  // Check for platform-specific modules that indicate wrong platform
  const nativeModuleDirs = [
    '@rollup',
    '@esbuild',
    'esbuild',
    'node-gyp-build',
    'fsevents', // macOS-only
  ];

  for (const dir of nativeModuleDirs) {
    const modulePath = path.join(nodeModulesPath, dir);
    if (fs.existsSync(modulePath)) {
      // Check for platform-specific binaries
      const platformCheck = await checkNativeModulePlatform(modulePath);
      if (platformCheck) {
        return platformCheck;
      }
    }
  }

  // Check for .bin directory with wrong shebang (Windows vs Unix)
  const binPath = path.join(nodeModulesPath, '.bin');
  if (fs.existsSync(binPath) && process.platform !== 'win32') {
    try {
      const binFiles = fs.readdirSync(binPath);
      for (const file of binFiles.slice(0, 5)) {
        // Check first few
        const filePath = path.join(binPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, 100);
          // Windows-style cmd shebang in Unix environment
          if (content.includes('@IF EXIST') || content.includes('@ECHO off')) {
            return 'node_modules appears to be installed for Windows but running on Linux/WSL';
          }
        }
      }
    } catch {
      // Read failed, proceed anyway
    }
  }

  return null;
}

/**
 * Check if a native module has the correct platform binaries
 */
async function checkNativeModulePlatform(modulePath: string): Promise<string | null> {
  const currentPlatform = process.platform;
  const currentArch = process.arch;

  // For @rollup, check for platform-specific directory
  if (modulePath.includes('@rollup')) {
    const expectedDir = `rollup-${currentPlatform}-${currentArch}`;
    const parentDir = path.dirname(modulePath);

    try {
      const dirs = fs.readdirSync(parentDir);
      const rollupDirs = dirs.filter((d) => d.startsWith('rollup-'));

      if (rollupDirs.length > 0 && !rollupDirs.includes(expectedDir)) {
        const foundPlatforms = rollupDirs.join(', ');
        return `Found ${foundPlatforms} but need ${expectedDir}`;
      }
    } catch {
      // Read failed
    }
  }

  // For @esbuild, similar check
  if (modulePath.includes('esbuild')) {
    const expectedDir = `@esbuild/${currentPlatform}-${currentArch}`;
    const parentDir = path.dirname(modulePath);

    try {
      const dirs = fs.readdirSync(parentDir);
      const esbuildDirs = dirs.filter((d) => d.startsWith('@esbuild'));

      if (esbuildDirs.length > 0) {
        const hasCorrect = fs.existsSync(path.join(parentDir, expectedDir));
        if (!hasCorrect) {
          return `esbuild binaries are for different platform (need ${currentPlatform}-${currentArch})`;
        }
      }
    } catch {
      // Read failed
    }
  }

  return null;
}

/**
 * Get the package manager used by a project
 */
export function detectPackageManager(projectPath: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

/**
 * Get the appropriate run command for a package manager
 */
export function getRunCommand(projectPath: string, script: string): string {
  const pm = detectPackageManager(projectPath);
  switch (pm) {
    case 'bun':
      return `bun run ${script}`;
    case 'pnpm':
      return `pnpm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    default:
      return `npm run ${script}`;
  }
}
