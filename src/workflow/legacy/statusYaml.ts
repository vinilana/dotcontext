import {
  PrevcStatus,
  PrevcPhase,
  PrevcRole,
  ProjectScale,
} from '../types';

function createEmptyStatus(now: string): PrevcStatus {
  return {
    project: {
      name: '',
      scale: ProjectScale.MEDIUM,
      started: now,
      current_phase: 'P',
    },
    phases: {
      P: { status: 'pending' },
      R: { status: 'pending' },
      E: { status: 'pending' },
      V: { status: 'pending' },
      C: { status: 'pending' },
    },
    agents: {},
    roles: {},
  };
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

/**
 * Parse the legacy workflow/status.yaml projection into the canonical PREVC shape.
 *
 * This intentionally supports the narrow status.yaml format historically emitted by
 * the workflow runtime instead of full YAML.
 */
export function parseLegacyStatusYaml(
  content: string,
  now: string = new Date().toISOString()
): PrevcStatus {
  const lines = content.split('\n');
  const result = createEmptyStatus(now);

  let currentSection = '';
  let currentPhase = '';
  let currentRole = '';
  let currentAgent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (line.startsWith('project:')) {
      currentSection = 'project';
    } else if (line.startsWith('phases:')) {
      currentSection = 'phases';
    } else if (line.startsWith('agents:')) {
      currentSection = 'agents';
    } else if (line.startsWith('roles:')) {
      currentSection = 'roles';
    } else if (line.startsWith('settings:')) {
      currentSection = 'settings';
    } else if (line.startsWith('approval:')) {
      currentSection = 'approval';
    } else if (line.startsWith('execution:')) {
      currentSection = 'execution';
    } else if (currentSection === 'project' && line.startsWith('  ')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = unquote(valueParts.join(':').trim());

      if (key === 'name') {
        result.project.name = value;
      }
      if (key === 'scale') {
        const scaleMap: Record<string, ProjectScale> = {
          QUICK: ProjectScale.QUICK,
          SMALL: ProjectScale.SMALL,
          MEDIUM: ProjectScale.MEDIUM,
          LARGE: ProjectScale.LARGE,
          ENTERPRISE: ProjectScale.LARGE,
        };
        result.project.scale = scaleMap[value] ?? ProjectScale.MEDIUM;
      }
      if (key === 'started') {
        result.project.started = value;
      }
      if (key === 'current_phase') {
        result.project.current_phase = value as PrevcPhase;
      }
    } else if (currentSection === 'phases') {
      if (line.match(/^  [PREVC]:/)) {
        currentPhase = trimmed.replace(':', '') as PrevcPhase;
      } else if (currentPhase && line.startsWith('    ')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = unquote(valueParts.join(':').trim());
        if (key === 'status') {
          result.phases[currentPhase as PrevcPhase].status = value as
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'skipped';
        }
        if (key === 'started_at') {
          result.phases[currentPhase as PrevcPhase].started_at = value;
        }
        if (key === 'completed_at') {
          result.phases[currentPhase as PrevcPhase].completed_at = value;
        }
        if (key === 'reason') {
          result.phases[currentPhase as PrevcPhase].reason = value;
        }
      }
    } else if (currentSection === 'agents') {
      if (line.match(/^  [a-z-]+:/)) {
        currentAgent = trimmed.replace(':', '');
        result.agents[currentAgent] = { status: 'pending' };
      } else if (currentAgent && line.startsWith('    ')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = unquote(valueParts.join(':').trim());
        const agentStatus = result.agents[currentAgent] || { status: 'pending' };

        if (key === 'status') {
          agentStatus.status = value as
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'skipped';
        }
        if (key === 'started_at') {
          agentStatus.started_at = value;
        }
        if (key === 'completed_at') {
          agentStatus.completed_at = value;
        }
        if (key === 'outputs') {
          const outputsMatch = value.match(/^\[(.*)\]$/);
          if (outputsMatch) {
            agentStatus.outputs = outputsMatch[1]
              .split(',')
              .map((entry) => unquote(entry.trim()))
              .filter(Boolean);
          }
        }

        result.agents[currentAgent] = agentStatus;
      }
    } else if (currentSection === 'roles') {
      if (line.match(/^  [a-z-]+:/)) {
        currentRole = trimmed.replace(':', '') as PrevcRole;
        result.roles[currentRole as PrevcRole] = {};
      } else if (currentRole && line.startsWith('    ')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = unquote(valueParts.join(':').trim());
        const roleStatus = result.roles[currentRole as PrevcRole] || {};

        if (key === 'status') {
          roleStatus.status = value as
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'skipped';
        }
        if (key === 'phase') {
          roleStatus.phase = value as PrevcPhase;
        }
        if (key === 'last_active') {
          roleStatus.last_active = value;
        }
        if (key === 'current_task') {
          roleStatus.current_task = value;
        }

        result.roles[currentRole as PrevcRole] = roleStatus;
      }
    } else if (currentSection === 'settings' && line.startsWith('  ')) {
      if (!result.project.settings) {
        result.project.settings = {
          autonomous_mode: false,
          require_plan: true,
          require_approval: true,
        };
      }

      const [key, ...valueParts] = trimmed.split(':');
      const value = unquote(valueParts.join(':').trim());

      if (key === 'autonomous_mode') {
        result.project.settings.autonomous_mode = value === 'true';
      }
      if (key === 'require_plan') {
        result.project.settings.require_plan = value === 'true';
      }
      if (key === 'require_approval') {
        result.project.settings.require_approval = value === 'true';
      }
    } else if (currentSection === 'approval' && line.startsWith('  ')) {
      if (!result.approval) {
        result.approval = {
          plan_created: false,
          plan_approved: false,
        };
      }

      const [key, ...valueParts] = trimmed.split(':');
      const value = unquote(valueParts.join(':').trim());

      if (key === 'plan_created') {
        result.approval.plan_created = value === 'true';
      }
      if (key === 'plan_approved') {
        result.approval.plan_approved = value === 'true';
      }
      if (key === 'approved_by') {
        result.approval.approved_by = value || undefined;
      }
      if (key === 'approved_at') {
        result.approval.approved_at = value || undefined;
      }
      if (key === 'approval_notes') {
        result.approval.approval_notes = value || undefined;
      }
    } else if (currentSection === 'execution' && line.startsWith('  ')) {
      if (!result.execution) {
        result.execution = {
          history: [],
          last_activity: '',
          resume_context: '',
        };
      }

      const [key, ...valueParts] = trimmed.split(':');
      const value = unquote(valueParts.join(':').trim());

      if (key === 'last_activity') {
        result.execution.last_activity = value;
      }
      if (key === 'resume_context') {
        result.execution.resume_context = value;
      }
    }
  }

  return result;
}
