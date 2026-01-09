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

      if (deps['next']) {
        info.framework = 'next';
        info.suggestedPort = 3000;
      } else if (deps['@angular/core']) {
        info.framework = 'angular';
        info.suggestedPort = 4200;
      } else if (deps['vue']) {
        info.framework = 'vue';
        info.suggestedPort = deps['vite'] ? 5173 : 8080;
      } else if (deps['svelte']) {
        info.framework = 'svelte';
        info.suggestedPort = deps['vite'] ? 5173 : 5000;
      } else if (deps['react']) {
        info.framework = 'react';
        // Check if using Vite or CRA
        info.suggestedPort = deps['vite'] ? 5173 : 3000;
      } else if (deps['vite']) {
        info.framework = 'vite';
        info.suggestedPort = 5173;
      } else {
        info.suggestedPort = 3000;
      }
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
