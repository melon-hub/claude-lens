/**
 * Browser launcher with WSL support
 *
 * Handles launching Chrome with CDP debugging enabled
 * across Windows, WSL, macOS, and Linux.
 */

import { spawn, ChildProcess, execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export type ExecutionContext = 'windows' | 'wsl' | 'mac' | 'linux';

/**
 * Detect current execution environment
 */
export function getExecutionContext(): ExecutionContext {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';

  // Linux - check if WSL
  try {
    const release = readFileSync('/proc/version', 'utf8');
    if (release.toLowerCase().includes('microsoft')) return 'wsl';
  } catch {
    // Not WSL
  }

  return 'linux';
}

/**
 * Find Chrome executable path based on context
 */
export function getChromePath(context: ExecutionContext): string {
  switch (context) {
    case 'windows': {
      const paths = [
        `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of paths) {
        if (p && existsSync(p)) return p;
      }
      throw new Error('Chrome not found on Windows');
    }

    case 'wsl': {
      // Check Windows paths from WSL
      const windowsPaths = [
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ];

      // Try to get user's local app data using cmd.exe
      try {
        const winUser = execFileSync('cmd.exe', ['/c', 'echo', '%USERNAME%'], { encoding: 'utf8' }).trim();
        windowsPaths.push(`/mnt/c/Users/${winUser}/AppData/Local/Google/Chrome/Application/chrome.exe`);
      } catch {
        // Ignore
      }

      for (const p of windowsPaths) {
        if (existsSync(p)) return p;
      }
      throw new Error('Chrome not found. Please install Google Chrome on Windows.');
    }

    case 'mac': {
      const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (existsSync(macPath)) return macPath;
      throw new Error('Chrome not found on macOS');
    }

    case 'linux': {
      const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
      for (const p of linuxPaths) {
        if (existsSync(p)) return p;
      }
      throw new Error('Chrome or Chromium not found on Linux');
    }
  }
}

export interface LaunchOptions {
  port?: number;
  headless?: boolean;
  userDataDir?: string;
}

export interface LaunchResult {
  process: ChildProcess;
  port: number;
  context: ExecutionContext;
}

/**
 * Launch Chrome with CDP debugging enabled
 */
export async function launchChrome(options: LaunchOptions = {}): Promise<LaunchResult> {
  const port = options.port ?? 9222;
  const context = getExecutionContext();

  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  if (options.headless) {
    args.push('--headless=new');
  }

  if (options.userDataDir) {
    args.push(`--user-data-dir=${options.userDataDir}`);
  }

  let chromeProcess: ChildProcess;

  if (context === 'wsl') {
    // Launch Windows Chrome from WSL using powershell.exe
    const chromePath = getChromePath(context);
    // Convert WSL path to Windows path
    const winPath = chromePath.replace(/^\/mnt\/([a-z])/, (_, drive: string) => `${drive.toUpperCase()}:`).replace(/\//g, '\\');

    // Use array args with powershell.exe to avoid shell injection
    chromeProcess = spawn('powershell.exe', ['-Command', `& '${winPath}'`, ...args], {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    const chromePath = getChromePath(context);
    chromeProcess = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
  }

  // Wait for Chrome to start and CDP port to be available
  await waitForPort(port);

  return {
    process: chromeProcess,
    port,
    context,
  };
}

/**
 * Check if Chrome is already running with CDP
 */
export async function isChromeRunning(port: number = 9222): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for CDP port to become available
 */
async function waitForPort(port: number, timeout: number = 10000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await isChromeRunning(port)) {
      return;
    }
    await sleep(200);
  }

  throw new Error(`Chrome did not start within ${timeout}ms. Try launching Chrome manually with: --remote-debugging-port=${port}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get manual launch instructions for the user
 */
export function getManualLaunchInstructions(context: ExecutionContext, port: number = 9222): string {
  switch (context) {
    case 'windows':
      return `Run in Command Prompt or PowerShell:
chrome.exe --remote-debugging-port=${port} --no-first-run`;

    case 'wsl':
      return `Run in PowerShell (Windows):
& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --remote-debugging-port=${port} --no-first-run

Or from WSL:
powershell.exe -Command "& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --remote-debugging-port=${port}"`;

    case 'mac':
      return `Run in Terminal:
/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port} --no-first-run`;

    case 'linux':
      return `Run in Terminal:
google-chrome --remote-debugging-port=${port} --no-first-run`;
  }
}
