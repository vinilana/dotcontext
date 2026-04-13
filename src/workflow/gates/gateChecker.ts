/**
 * PREVC Workflow Gate Checker
 *
 * Enforces plan creation and approval gates during phase transitions.
 */

import {
  PrevcStatus,
  PrevcPhase,
  WorkflowSettings,
  ProjectScale,
  GateType,
} from '../types';
import { WorkflowGateError } from '../errors';

/**
 * Status of an individual gate
 */
export interface GateStatus {
  /** Whether the gate check passed */
  passed: boolean;
  /** Whether the gate is required for this transition */
  required: boolean;
}

/**
 * Result of a gate check
 */
export interface GateCheckResult {
  /** Whether the workflow can advance */
  canAdvance: boolean;
  /** Gate statuses */
  gates: Record<GateType, GateStatus>;
  /** Reason if advancement is blocked */
  blockingReason?: string;
  /** Hint for resolving the blocking gate */
  hint?: string;
  /** The blocking gate type */
  blockingGate?: GateType;
}

/**
 * Get default workflow settings based on project scale
 */
export function getDefaultSettings(scale: ProjectScale | string): WorkflowSettings {
  const scaleNum = typeof scale === 'number' ? scale : ProjectScale[scale as keyof typeof ProjectScale];

  switch (scaleNum) {
    case ProjectScale.QUICK:
      return {
        autonomous_mode: true,
        require_plan: false,
        require_approval: false,
      };
    case ProjectScale.SMALL:
      return {
        autonomous_mode: false,
        require_plan: true,
        require_approval: false,
      };
    case ProjectScale.MEDIUM:
    case ProjectScale.LARGE:
    default:
      return {
        autonomous_mode: false,
        require_plan: true,
        require_approval: true,
      };
  }
}

/**
 * PREVC Workflow Gate Checker
 *
 * Validates workflow gates before phase transitions.
 */
export class WorkflowGateChecker {
  /**
   * Check all gates for the current phase transition
   */
  /**
   * Check all gates for the current phase transition.
   *
   * Design note: `nextPhase` is retained as an override so callers can
   * ask "what would gates say if we jumped to X?" — useful for UI
   * previews. We refuse overrides that target a phase the workflow has
   * explicitly marked `skipped`, because forcing a gate decision onto
   * a skipped phase would contradict the scale-based progression.
   * Transitions to non-skipped phases out of normal order are still
   * allowed (force flows stay possible).
   */
  checkGates(
    status: PrevcStatus,
    nextPhase?: PrevcPhase
  ): GateCheckResult {
    const currentPhase = status.project.current_phase;

    if (nextPhase) {
      const targetEntry = status.phases?.[nextPhase];
      if (targetEntry?.status === 'skipped') {
        throw new Error(
          `checkGates: refusing to evaluate transition to phase "${nextPhase}" ` +
            `because it is marked as skipped. Omit nextPhase to use the next ` +
            `active phase in sequence.`
        );
      }
    }

    const targetPhase = nextPhase || this.getNextPhase(currentPhase);

    // Get effective settings (use defaults if not set)
    const settings = this.getEffectiveSettings(status);

    // If autonomous mode is enabled, all gates pass
    if (settings.autonomous_mode) {
      return {
        canAdvance: true,
        gates: {
          plan_required: { passed: true, required: false },
          approval_required: { passed: true, required: false },
        },
      };
    }

    const result: GateCheckResult = {
      canAdvance: true,
      gates: {
        plan_required: { passed: true, required: false },
        approval_required: { passed: true, required: false },
      },
    };

    // Check P → R transition: requires linked plan
    if (currentPhase === 'P' && targetPhase === 'R') {
      if (settings.require_plan) {
        result.gates.plan_required.required = true;
        const hasPlan = this.hasLinkedPlan(status);
        result.gates.plan_required.passed = hasPlan;

        if (!hasPlan) {
          result.canAdvance = false;
          result.blockingGate = 'plan_required';
          result.blockingReason = 'A plan must be linked before advancing from Planning to Review phase.';
          result.hint = 'Use scaffoldPlan and linkPlan to create and link a plan, or enable autonomous mode.';
        }
      }
    }

    // Check R → E transition: requires plan approval
    if (currentPhase === 'R' && targetPhase === 'E') {
      if (settings.require_approval) {
        result.gates.approval_required.required = true;
        const isApproved = this.isPlanApproved(status);
        result.gates.approval_required.passed = isApproved;

        if (!isApproved) {
          result.canAdvance = false;
          result.blockingGate = 'approval_required';
          result.blockingReason = 'The plan must be approved before advancing from Review to Execution phase.';
          result.hint = 'Use workflowApprovePlan to approve the plan, or enable autonomous mode.';
        }
      }
    }

    return result;
  }

  /**
   * Enforce gates for the current phase transition.
   *
   * Validates that all required gates pass before allowing phase advancement.
   * If a gate check fails and `force` is not set, throws a `WorkflowGateError`.
   *
   * @param status - Current workflow status
   * @param options - Enforcement options
   * @param options.force - If true, skips gate enforcement entirely
   * @param options.nextPhase - Override the target phase (defaults to next in sequence)
   *
   * @throws {WorkflowGateError} When a gate blocks the transition and force is false.
   *   The error includes:
   *   - `gate`: Which gate blocked ('plan_required' | 'approval_required')
   *   - `transition`: The blocked phase transition { from, to }
   *   - `hint`: Actionable suggestion for resolving the block
   *
   * @example
   * ```ts
   * // Normal enforcement - may throw
   * gateChecker.enforceGates(status);
   *
   * // Force bypass - never throws
   * gateChecker.enforceGates(status, { force: true });
   * ```
   */
  enforceGates(
    status: PrevcStatus,
    options: { force?: boolean; nextPhase?: PrevcPhase } = {}
  ): void {
    if (options.force) {
      return;
    }

    const result = this.checkGates(status, options.nextPhase);

    if (!result.canAdvance && result.blockingGate) {
      const currentPhase = status.project.current_phase;
      const targetPhase = options.nextPhase || this.getNextPhase(currentPhase);

      throw new WorkflowGateError({
        message: result.blockingReason!,
        transition: { from: currentPhase, to: targetPhase! },
        gate: result.blockingGate,
        hint: result.hint!,
      });
    }
  }

  /**
   * Get effective settings (merge with scale defaults)
   */
  private getEffectiveSettings(status: PrevcStatus): WorkflowSettings {
    const defaults = getDefaultSettings(status.project.scale);
    const overrides = status.project.settings;

    if (!overrides) {
      return defaults;
    }

    return {
      autonomous_mode: overrides.autonomous_mode ?? defaults.autonomous_mode,
      require_plan: overrides.require_plan ?? defaults.require_plan,
      require_approval: overrides.require_approval ?? defaults.require_approval,
    };
  }

  /**
   * Check if a plan is linked to the workflow
   */
  private hasLinkedPlan(status: PrevcStatus): boolean {
    // Check approval tracking
    if (status.approval?.plan_created) {
      return true;
    }

    // Check project metadata
    if (status.project.plan) {
      return true;
    }

    // Check linked plans array
    if (status.project.plans && status.project.plans.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Check if the plan is approved
   */
  private isPlanApproved(status: PrevcStatus): boolean {
    return status.approval?.plan_approved === true;
  }

  /**
   * Get the next phase in the workflow sequence
   */
  private getNextPhase(current: PrevcPhase): PrevcPhase | null {
    const order: PrevcPhase[] = ['P', 'R', 'E', 'V', 'C'];
    const idx = order.indexOf(current);
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  }
}

// Export singleton factory
export function createGateChecker(): WorkflowGateChecker {
  return new WorkflowGateChecker();
}
