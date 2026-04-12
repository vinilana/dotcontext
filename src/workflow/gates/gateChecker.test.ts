import {
  WorkflowGateChecker,
  getDefaultSettings,
  GateCheckResult,
} from './gateChecker';
import { PrevcStatus, ProjectScale, WorkflowSettings } from '../types';

// Helper to create a minimal valid PrevcStatus
function createMockStatus(overrides: Partial<PrevcStatus> = {}): PrevcStatus {
  const defaultStatus: PrevcStatus = {
    project: {
      name: 'test-project',
      scale: ProjectScale.MEDIUM,
      started: new Date().toISOString(),
      current_phase: 'P',
    },
    phases: {
      P: { status: 'in_progress' },
      R: { status: 'pending' },
      E: { status: 'pending' },
      V: { status: 'pending' },
      C: { status: 'pending' },
    },
    agents: {},
    roles: {},
  };

  return {
    ...defaultStatus,
    ...overrides,
    project: { ...defaultStatus.project, ...overrides.project },
    phases: { ...defaultStatus.phases, ...overrides.phases },
    agents: { ...defaultStatus.agents, ...overrides.agents },
    roles: { ...defaultStatus.roles, ...overrides.roles },
  } as PrevcStatus;
}

describe('WorkflowGateChecker', () => {
  let checker: WorkflowGateChecker;

  beforeEach(() => {
    checker = new WorkflowGateChecker();
  });

  describe('getDefaultSettings', () => {
    it('should return autonomous mode for QUICK scale', () => {
      const settings = getDefaultSettings(ProjectScale.QUICK);
      expect(settings.autonomous_mode).toBe(true);
      expect(settings.require_plan).toBe(false);
      expect(settings.require_approval).toBe(false);
    });

    it('should require plan but not approval for SMALL scale', () => {
      const settings = getDefaultSettings(ProjectScale.SMALL);
      expect(settings.autonomous_mode).toBe(false);
      expect(settings.require_plan).toBe(true);
      expect(settings.require_approval).toBe(false);
    });

    it('should require both plan and approval for MEDIUM scale', () => {
      const settings = getDefaultSettings(ProjectScale.MEDIUM);
      expect(settings.autonomous_mode).toBe(false);
      expect(settings.require_plan).toBe(true);
      expect(settings.require_approval).toBe(true);
    });

    it('should require both plan and approval for LARGE scale', () => {
      const settings = getDefaultSettings(ProjectScale.LARGE);
      expect(settings.autonomous_mode).toBe(false);
      expect(settings.require_plan).toBe(true);
      expect(settings.require_approval).toBe(true);
    });

    it('should require both plan and approval for LARGE scale', () => {
      const settings = getDefaultSettings(ProjectScale.LARGE);
      expect(settings.autonomous_mode).toBe(false);
      expect(settings.require_plan).toBe(true);
      expect(settings.require_approval).toBe(true);
    });

    it('should map legacy ENTERPRISE string to LARGE scale', () => {
      const settings = getDefaultSettings('ENTERPRISE');
      expect(settings.autonomous_mode).toBe(false);
      expect(settings.require_plan).toBe(true);
      expect(settings.require_approval).toBe(true);
    });
  });

  describe('checkGates', () => {
    describe('autonomous mode', () => {
      it('should pass all gates when autonomous mode is enabled', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'P',
            settings: {
              autonomous_mode: true,
              require_plan: true,
              require_approval: true,
            },
          },
        });

        const result = checker.checkGates(status);
        expect(result.canAdvance).toBe(true);
        expect(result.gates.plan_required.required).toBe(false);
        expect(result.gates.approval_required.required).toBe(false);
      });
    });

    describe('P → R transition', () => {
      it('should block P → R when no plan is linked', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'P',
          },
        });

        const result = checker.checkGates(status, 'R');
        expect(result.canAdvance).toBe(false);
        expect(result.gates.plan_required.required).toBe(true);
        expect(result.gates.plan_required.passed).toBe(false);
        expect(result.blockingGate).toBe('plan_required');
        expect(result.hint).toContain('plan({ action: "link"');
      });

      it('should allow P → R when plan is linked via project.plan', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'P',
            plan: 'my-plan',
          },
        });

        const result = checker.checkGates(status, 'R');
        expect(result.canAdvance).toBe(true);
        expect(result.gates.plan_required.passed).toBe(true);
      });

      it('should allow P → R when approval.plan_created is true', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'P',
          },
          approval: {
            plan_created: true,
            plan_approved: false,
          },
        });

        const result = checker.checkGates(status, 'R');
        expect(result.canAdvance).toBe(true);
        expect(result.gates.plan_required.passed).toBe(true);
      });

      it('should skip plan gate for QUICK scale', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.QUICK,
            started: new Date().toISOString(),
            current_phase: 'P',
          },
        });

        const result = checker.checkGates(status, 'R');
        expect(result.canAdvance).toBe(true);
        expect(result.gates.plan_required.required).toBe(false);
      });
    });

    describe('R → E transition', () => {
      it('should block R → E when plan is not approved', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'R',
          },
          approval: {
            plan_created: true,
            plan_approved: false,
          },
        });

        const result = checker.checkGates(status, 'E');
        expect(result.canAdvance).toBe(false);
        expect(result.gates.approval_required.required).toBe(true);
        expect(result.gates.approval_required.passed).toBe(false);
        expect(result.blockingGate).toBe('approval_required');
        expect(result.hint).toContain('workflow-manage({ action: "approvePlan"');
      });

      it('should allow R → E when plan is approved', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'R',
          },
          approval: {
            plan_created: true,
            plan_approved: true,
          },
        });

        const result = checker.checkGates(status, 'E');
        expect(result.canAdvance).toBe(true);
        expect(result.gates.approval_required.passed).toBe(true);
      });

      it('should skip approval gate for SMALL scale', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.SMALL,
            started: new Date().toISOString(),
            current_phase: 'R',
          },
        });

        const result = checker.checkGates(status, 'E');
        expect(result.canAdvance).toBe(true);
        expect(result.gates.approval_required.required).toBe(false);
      });
    });

    describe('other transitions', () => {
      it('should skip the plan gate when the next executable phase skips review', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.SMALL,
            started: new Date().toISOString(),
            current_phase: 'P',
          },
          phases: {
            P: { status: 'in_progress' },
            R: { status: 'skipped' },
            E: { status: 'pending' },
            V: { status: 'pending' },
            C: { status: 'pending' },
          },
        });

        const result = checker.checkGates(status);
        expect(result.canAdvance).toBe(true);
        expect(result.gates.plan_required.required).toBe(false);
      });

      it('should allow E → V without any gates', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'E',
          },
        });

        const result = checker.checkGates(status, 'V');
        expect(result.canAdvance).toBe(true);
      });

      it('should allow V → C without any gates', () => {
        const status = createMockStatus({
          project: {
            name: 'test',
            scale: ProjectScale.MEDIUM,
            started: new Date().toISOString(),
            current_phase: 'V',
          },
        });

        const result = checker.checkGates(status, 'C');
        expect(result.canAdvance).toBe(true);
      });
    });
  });

  describe('enforceGates', () => {
    it('should not throw when gates pass', () => {
      const status = createMockStatus({
        project: {
          name: 'test',
          scale: ProjectScale.MEDIUM,
          started: new Date().toISOString(),
          current_phase: 'P',
          plan: 'my-plan',
        },
      });

      expect(() => {
        checker.enforceGates(status, { nextPhase: 'R' });
      }).not.toThrow();
    });

    it('should throw WorkflowGateError when gates fail', () => {
      const status = createMockStatus({
        project: {
          name: 'test',
          scale: ProjectScale.MEDIUM,
          started: new Date().toISOString(),
          current_phase: 'P',
        },
      });

      expect(() => {
        checker.enforceGates(status, { nextPhase: 'R' });
      }).toThrow();
    });

    it('should not throw when force is true', () => {
      const status = createMockStatus({
        project: {
          name: 'test',
          scale: ProjectScale.MEDIUM,
          started: new Date().toISOString(),
          current_phase: 'P',
        },
      });

      expect(() => {
        checker.enforceGates(status, { force: true, nextPhase: 'R' });
      }).not.toThrow();
    });
  });
});
