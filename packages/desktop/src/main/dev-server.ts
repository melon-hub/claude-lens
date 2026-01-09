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
  ready: boolean;
  output: string[];
}

export class DevServerManager {
  private server: DevServerState | null = null;
  private onOutputCallback: ((data: string) => void) | null = null;
  private onReadyCallback: (() => void) | null = null;
  private onExitCallback: ((code: number) => void) | null = null;

  /**
   * Start a dev server in the given project directory
   */
  async start(projectPath: string, command: string, port: number): Promise<void> {
    // Stop any existing server
    if (this.server) {
      await this.stop();
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
      ready: false,
      output: [],
    };

    // Handle output
    ptyProcess.onData((data) => {
      if (this.server) {
        this.server.output.push(data);
        // Keep only last 1000 lines
        if (this.server.output.length > 1000) {
          this.server.output.shift();
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
   * Wait for a port to become available
   */
  private async waitForPort(port: number, timeout: number): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await this.isPortOpen(port)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(`Server did not start on port ${port} within ${timeout}ms`);
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
   * Check if server is running and ready
   */
  isRunning(): boolean {
    return this.server !== null && this.server.ready;
  }

  /**
   * Get the server port
   */
  getPort(): number | null {
    return this.server?.port ?? null;
  }

  /**
   * Get recent server output
   */
  getOutput(): string[] {
    return this.server?.output ?? [];
  }
}
