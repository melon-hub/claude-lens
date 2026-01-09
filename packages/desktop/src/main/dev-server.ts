/**
 * Dev Server Manager for Claude Lens Desktop
 *
 * Manages development server processes (npm run dev, etc.)
 * using node-pty for full terminal emulation.
 */

import * as pty from 'node-pty';
import * as net from 'net';
import * as os from 'os';

export interface DevServerState {
  process: pty.IPty;
  port: number;
  actualPort: number | null; // The port detected from server output
  ready: boolean;
  output: string[];
  errors: DevServerError[];
}

export interface DevServerError {
  type: 'missing-module' | 'build-error' | 'permission' | 'port-conflict' | 'unknown';
  message: string;
  suggestion: string;
  raw: string;
}

export class DevServerManager {
  private server: DevServerState | null = null;
  private onOutputCallback: ((data: string) => void) | null = null;
  private onReadyCallback: (() => void) | null = null;
  private onExitCallback: ((code: number) => void) | null = null;
  private onErrorCallback: ((error: DevServerError) => void) | null = null;

  /**
   * Start a dev server in the given project directory
   */
  async start(projectPath: string, command: string, port: number): Promise<void> {
    // Stop any existing server
    if (this.server) {
      await this.stop();
    }

    // Check if port is already in use BEFORE starting
    // This prevents the race condition where we think our server started
    // but it's actually another process (like Claude Lens's own dev server)
    if (await this.isPortOpen(port)) {
      throw new Error(
        `Port ${port} is already in use. ` +
        `Another dev server or Claude Lens development instance may be running. ` +
        `Please close it or use a different port.`
      );
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectPath,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
      },
    });

    this.server = {
      process: ptyProcess,
      port,
      actualPort: null,
      ready: false,
      output: [],
      errors: [],
    };

    // Handle output
    ptyProcess.onData((data) => {
      if (this.server) {
        this.server.output.push(data);
        // Keep only last 1000 lines
        if (this.server.output.length > 1000) {
          this.server.output.shift();
        }

        // Try to detect actual port from output
        if (!this.server.actualPort) {
          const detectedPort = this.detectPortFromOutput(data);
          if (detectedPort) {
            this.server.actualPort = detectedPort;
            console.log('Detected dev server port from output:', detectedPort);
          }
        }

        // Detect errors and provide actionable suggestions
        const error = this.detectError(data);
        if (error) {
          this.server.errors.push(error);
          this.onErrorCallback?.(error);
        }
      }

      this.onOutputCallback?.(data);

      // Detect server ready
      if (this.server && !this.server.ready && this.detectServerReady(data)) {
        this.server.ready = true;
        this.onReadyCallback?.();
      }
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      this.onExitCallback?.(exitCode);
      this.server = null;
    });

    // Start the dev command
    ptyProcess.write(`${command}\r`);

    // Wait for port to be available (with timeout)
    await this.waitForPort(port, 60000);
  }

  /**
   * Detect if server output indicates it's ready
   */
  private detectServerReady(output: string): boolean {
    const readyPatterns = [
      /localhost:\d+/i,
      /127\.0\.0\.1:\d+/i,
      /ready in/i,
      /compiled successfully/i,
      /server running/i,
      /listening on/i,
      /started server/i,
      /serving!/i,
      /local:/i,
      /vite.*ready/i,
      /webpack.*compiled/i,
    ];
    return readyPatterns.some((p) => p.test(output));
  }

  /**
   * Detect the actual port from server output
   * Matches URL patterns like "http://localhost:5173", "Local: http://localhost:5174/"
   * Must be careful not to match timestamps or other numbers
   */
  private detectPortFromOutput(output: string): number | null {
    // Specific patterns for dev server URL announcements
    // These must be URL-like to avoid matching timestamps/error codes
    const patterns = [
      /https?:\/\/localhost:(\d+)/i,           // http://localhost:3000
      /https?:\/\/127\.0\.0\.1:(\d+)/i,        // http://127.0.0.1:5173
      /https?:\/\/0\.0\.0\.0:(\d+)/i,          // http://0.0.0.0:3000
      /Local:\s+https?:\/\/[^:]+:(\d+)/i,      // Local:   http://localhost:5173
      /listening\s+(?:on\s+)?(?:port\s+)?(\d+)/i, // listening on port 3000
      /server\s+(?:running|started)\s+(?:on|at)\s+(?:port\s+)?(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        // Sanity check: port should be in common dev server range
        if (port >= 3000 && port <= 9999) {
          return port;
        }
      }
    }

    return null;
  }

  /**
   * Detect errors in server output and provide actionable suggestions
   */
  private detectError(output: string): DevServerError | null {
    // Missing module (common cross-platform issue)
    const missingModuleMatch = output.match(/Cannot find module ['"]([^'"]+)['"]/);
    if (missingModuleMatch) {
      const moduleName = missingModuleMatch[1];
      const isNative = moduleName.includes('@rollup/') || moduleName.includes('@esbuild/');

      return {
        type: 'missing-module',
        message: `Cannot find module: ${moduleName}`,
        suggestion: isNative
          ? 'Native module missing. Run: rm -rf node_modules package-lock.json && npm install'
          : `Module not installed. Run: npm install ${moduleName}`,
        raw: output,
      };
    }

    // ENOENT errors (file/command not found)
    const enoentMatch = output.match(/ENOENT[:\s]+.*?['"]([^'"]+)['"]/);
    if (enoentMatch) {
      return {
        type: 'missing-module',
        message: `File or directory not found: ${enoentMatch[1]}`,
        suggestion: 'Check if the file exists or run npm install',
        raw: output,
      };
    }

    // Port already in use
    if (output.includes('EADDRINUSE') || output.includes('address already in use')) {
      const portMatch = output.match(/port\s*(\d+)/i) || output.match(/:(\d+)/);
      const port = portMatch ? portMatch[1] : 'unknown';

      return {
        type: 'port-conflict',
        message: `Port ${port} is already in use`,
        suggestion: 'Close the other application using this port or use a different port',
        raw: output,
      };
    }

    // Permission denied
    if (output.includes('EACCES') || output.includes('permission denied')) {
      return {
        type: 'permission',
        message: 'Permission denied',
        suggestion: 'Check file permissions or try running with appropriate privileges',
        raw: output,
      };
    }

    // TypeScript/Build errors
    if (output.includes('error TS') || output.match(/error:.*TypeScript/i)) {
      return {
        type: 'build-error',
        message: 'TypeScript compilation error',
        suggestion: 'Fix the TypeScript errors in your code',
        raw: output,
      };
    }

    // ESLint/Linting errors that block build
    if (output.includes('ESLint') && output.includes('error')) {
      return {
        type: 'build-error',
        message: 'ESLint errors found',
        suggestion: 'Fix the linting errors or configure ESLint to warn instead of error',
        raw: output,
      };
    }

    // npm ERR!
    if (output.includes('npm ERR!')) {
      return {
        type: 'unknown',
        message: 'npm error occurred',
        suggestion: 'Check the error message above. Try: rm -rf node_modules && npm install',
        raw: output,
      };
    }

    return null;
  }

  /**
   * Wait for the server to become available
   * First tries to detect the actual port from output, then checks if it's open
   */
  private async waitForPort(suggestedPort: number, timeout: number): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      // Check if we detected the actual port from output
      const portToCheck = this.server?.actualPort || suggestedPort;

      if (await this.isPortOpen(portToCheck)) {
        // Update actualPort if we found it via connection
        if (this.server && !this.server.actualPort) {
          this.server.actualPort = portToCheck;
        }
        return;
      }

      // If we detected a port from output but it's not the suggested one,
      // try that port directly
      if (this.server?.actualPort && this.server.actualPort !== suggestedPort) {
        if (await this.isPortOpen(this.server.actualPort)) {
          return;
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const portTried = this.server?.actualPort || suggestedPort;
    throw new Error(`Server did not start on port ${portTried} within ${timeout}ms`);
  }

  /**
   * Check if a port is open (server is listening)
   */
  private isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.process.kill();
      this.server = null;
    }
  }

  /**
   * Write to the server's stdin
   */
  write(data: string): void {
    if (this.server) {
      this.server.process.write(data);
    }
  }

  /**
   * Set callback for server output
   */
  setOnOutput(callback: (data: string) => void): void {
    this.onOutputCallback = callback;
  }

  /**
   * Set callback for when server is ready
   */
  setOnReady(callback: () => void): void {
    this.onReadyCallback = callback;
  }

  /**
   * Set callback for when server exits
   */
  setOnExit(callback: (code: number) => void): void {
    this.onExitCallback = callback;
  }

  /**
   * Set callback for when an error is detected
   */
  setOnError(callback: (error: DevServerError) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Check if server is running and ready
   */
  isRunning(): boolean {
    return this.server !== null && this.server.ready;
  }

  /**
   * Get the suggested server port
   */
  getPort(): number | null {
    return this.server?.port ?? null;
  }

  /**
   * Get the actual port the server is running on (detected from output)
   */
  getActualPort(): number | null {
    return this.server?.actualPort ?? this.server?.port ?? null;
  }

  /**
   * Get recent server output
   */
  getOutput(): string[] {
    return this.server?.output ?? [];
  }

  /**
   * Get detected errors
   */
  getErrors(): DevServerError[] {
    return this.server?.errors ?? [];
  }

  /**
   * Check if any errors were detected
   */
  hasErrors(): boolean {
    return (this.server?.errors.length ?? 0) > 0;
  }
}
