/**
 * Static File Server for Claude Lens Desktop
 *
 * Built-in HTTP server for serving static HTML/CSS/JS projects
 * without requiring a separate dev server.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export class StaticServer {
  private server: http.Server | null = null;
  private projectPath: string = '';
  private entryFile: string = 'index.html';

  /**
   * Start the static file server
   * @param projectPath - Root directory to serve files from
   * @param port - Port to listen on
   * @param entryFile - HTML file to serve for root requests (default: index.html)
   */
  async start(projectPath: string, port: number, entryFile: string = 'index.html'): Promise<void> {
    this.projectPath = projectPath;
    this.entryFile = entryFile;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(port, '127.0.0.1', () => {
        console.log(`Static server started on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * Handle an incoming HTTP request
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Parse URL and get path
    const url = new URL(req.url || '/', `http://localhost`);
    let filePath = path.join(this.projectPath, decodeURIComponent(url.pathname));

    // Security: prevent path traversal
    if (!filePath.startsWith(this.projectPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if path is a directory - serve the entry file
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, this.entryFile);
      }
    } catch {
      // File doesn't exist, will be handled below
    }

    // Get content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Try to serve entry file for SPA routing
          const entryPath = path.join(this.projectPath, this.entryFile);
          fs.readFile(entryPath, (entryErr, entryData) => {
            if (entryErr) {
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.end('<h1>404 Not Found</h1>');
            } else {
              res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache',
              });
              res.end(entryData);
            }
          });
        } else {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>500 Server Error</h1>');
        }
      } else {
        // Serve the file
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}
