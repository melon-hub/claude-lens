/**
 * Project Modal
 *
 * Dialog shown when a project is detected, allowing user to choose
 * how to start the dev server.
 */

import type { ProjectInfo } from '../types';
import { updateState } from '../state';
import { updateStatusBar } from '../ui-helpers';
import { setBrowserLoaded } from '../browser-helpers';

/**
 * Show project modal when a project is detected
 */
export function showProjectModal(project: ProjectInfo): void {
  // Remove existing modal if any
  const existing = document.querySelector('.project-modal');
  if (existing) existing.remove();

  // Hide BrowserView so modal appears on top (BrowserView is a native element that renders above HTML)
  window.claudeLens.browser.setVisible(false);

  const modal = document.createElement('div');
  modal.className = 'project-modal';

  const content = document.createElement('div');
  content.className = 'project-modal-content';

  const title = document.createElement('h2');
  title.textContent = `Open Project: ${project.name}`;
  content.appendChild(title);

  const info = document.createElement('div');
  info.className = 'project-info';

  const typeLabel = project.type === 'node' ? 'Node.js' : project.type === 'static' ? 'Static HTML' : 'Unknown';
  const typeP = document.createElement('p');
  const typeStrong = document.createElement('strong');
  typeStrong.textContent = 'Type: ';
  typeP.appendChild(typeStrong);
  typeP.appendChild(document.createTextNode(typeLabel));
  info.appendChild(typeP);

  if (project.framework && project.framework !== 'unknown') {
    const frameworkP = document.createElement('p');
    const frameworkStrong = document.createElement('strong');
    frameworkStrong.textContent = 'Framework: ';
    frameworkP.appendChild(frameworkStrong);
    const frameworkLabel = project.framework.charAt(0).toUpperCase() + project.framework.slice(1);
    frameworkP.appendChild(document.createTextNode(frameworkLabel));
    info.appendChild(frameworkP);
  }

  if (project.suggestedPort) {
    const portP = document.createElement('p');
    const portStrong = document.createElement('strong');
    portStrong.textContent = 'Port: ';
    portP.appendChild(portStrong);
    portP.appendChild(document.createTextNode(String(project.suggestedPort)));
    info.appendChild(portP);
  }

  const pathP = document.createElement('p');
  pathP.className = 'project-path';
  const pathStrong = document.createElement('strong');
  pathStrong.textContent = 'Path: ';
  pathP.appendChild(pathStrong);
  const pathCode = document.createElement('code');
  pathCode.textContent = project.path;
  pathP.appendChild(pathCode);
  info.appendChild(pathP);
  content.appendChild(info);

  const buttons = document.createElement('div');
  buttons.className = 'project-buttons';

  if (project.devCommand) {
    const devBtn = document.createElement('button');
    devBtn.className = 'btn btn-primary';
    devBtn.textContent = `Start with ${project.devCommand}`;
    devBtn.addEventListener('click', async () => {
      devBtn.disabled = true;
      devBtn.textContent = 'Starting...';
      // Update status bar state
      updateState({ currentProjectName: project.name, currentServerType: 'dev' });
      updateStatusBar();
      const result = await window.claudeLens.project.start({ useDevServer: true });
      modal.remove();
      // Restore BrowserView visibility
      window.claudeLens.browser.setVisible(true);
      if (result.success && result.url) {
        console.log('[Viewport] Browser loaded, updating bounds');
        setBrowserLoaded(result.url);
      } else {
        alert(`Failed to start dev server: ${result.error}`);
      }
    });
    buttons.appendChild(devBtn);
  }

  const staticBtn = document.createElement('button');
  staticBtn.className = project.devCommand ? 'btn btn-secondary' : 'btn btn-primary';
  staticBtn.textContent = 'Use Built-in Server';
  staticBtn.addEventListener('click', async () => {
    staticBtn.disabled = true;
    staticBtn.textContent = 'Starting...';
    // Update status bar state
    updateState({ currentProjectName: project.name, currentServerType: 'static' });
    updateStatusBar();
    const result = await window.claudeLens.project.start({ useDevServer: false });
    modal.remove();
    // Restore BrowserView visibility
    window.claudeLens.browser.setVisible(true);
    if (result.success && result.url) {
      setBrowserLoaded(result.url);
    } else {
      alert(`Failed to start server: ${result.error}`);
    }
  });
  buttons.appendChild(staticBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    modal.remove();
    // Restore BrowserView visibility
    window.claudeLens.browser.setVisible(true);
  });
  buttons.appendChild(cancelBtn);

  content.appendChild(buttons);
  modal.appendChild(content);
  document.body.appendChild(modal);
}
