/**
 * Project Handlers
 *
 * Project dropdown and project-related event handling.
 */

import { state } from '../state';
import { projectDropdown } from '../setup';

/**
 * Update project dropdown with recent projects
 */
export async function updateProjectDropdown(): Promise<void> {
  const recentProjects = await window.claudeLens.project.getRecent();

  // Clear existing options except first
  while (projectDropdown.options.length > 1) {
    projectDropdown.remove(1);
  }

  // Add recent projects
  for (const project of recentProjects) {
    const option = document.createElement('option');
    option.value = project.path;
    option.textContent = project.name;
    option.title = project.path;
    projectDropdown.appendChild(option);
  }

  // Select current project if open
  if (state.currentProjectName) {
    const currentOption = Array.from(projectDropdown.options).find(
      opt => opt.textContent === state.currentProjectName
    );
    if (currentOption) {
      projectDropdown.value = currentOption.value;
    }
  }
}
