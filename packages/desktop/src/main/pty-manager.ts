/**
 * PTY Manager - Spawns Claude Code in a pseudo-terminal
 *
 * This is the key to seamless integration: we spawn Claude Code
 * in a pty we control, so we can write to its stdin directly.
 */

import * as pty from 'node-pty';
import * as os from 'os';

export class PtyManager {
  private ptyProcess: pty.IPty | null = null;
  // Use single callback pattern to prevent accumulation on restart
  private dataCallback: ((data: string) => void) | null = null;
  private exitCallback: ((code: number) => void) | null = null;

  /**
   * Start Claude Code in a pty
   */
  async start(options: { cwd?: string; sessionId?: string } = {}): Promise<void> {
    if (this.ptyProcess) {
      throw new Error('PTY already running');
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const cwd = options.cwd || process.cwd();

    // Spawn a shell first, then run claude inside it
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    // Set up data forwarding (single callback pattern prevents accumulation)
    this.ptyProcess.onData((data) => {
      this.dataCallback?.(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.exitCallback?.(exitCode);
      this.ptyProcess = null;
    });

    // Start Claude Code after a brief delay to let shell initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Build claude command with optional session
    let claudeCmd = 'claude';
    if (options.sessionId) {
      claudeCmd += ` --session-id ${options.sessionId} --resume`;
    }

    // Send the command to start claude
    // Use 'exec' to replace shell with claude, so when claude exits, the PTY exits
    this.write(`exec ${claudeCmd}\n`);
  }

  /**
   * Write data to Claude's stdin - THIS IS THE MAGIC
   */
  write(data: string): void {
    if (!this.ptyProcess) {
      throw new Error('PTY not running');
    }
    this.ptyProcess.write(data);
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Register callback for data output
   * Note: Replaces any existing callback (single callback pattern)
   */
  onData(callback: (data: string) => void): void {
    this.dataCallback = callback;
  }

  /**
   * Register callback for process exit
   * Note: Replaces any existing callback (single callback pattern)
   */
  onExit(callback: (code: number) => void): void {
    this.exitCallback = callback;
  }

  /**
   * Send interrupt (Ctrl+C)
   */
  interrupt(): void {
    if (this.ptyProcess) {
      this.ptyProcess.write('\x03');
    }
  }

  /**
   * Clean up
   */
  dispose(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this.dataCallback = null;
    this.exitCallback = null;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.ptyProcess !== null;
  }
}
