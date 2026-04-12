import { GitService } from '../../utils/gitService';
import { LinkedPlan } from './types';

export class PlanCommitService {
  constructor(
    private readonly repoPath: string,
    private readonly getLinkedPlan: (planSlug: string) => Promise<LinkedPlan | null>,
    private readonly recordPhaseCommit: (
      planSlug: string,
      phaseId: string,
      commitInfo: { hash: string; shortHash: string; committedBy?: string }
    ) => Promise<boolean>
  ) {}

  async autoCommitPhase(planSlug: string, phaseId: string): Promise<boolean> {
    try {
      const plan = await this.getLinkedPlan(planSlug);
      if (!plan) {
        console.warn(`[AutoCommit] Plan not found: ${planSlug}`);
        return false;
      }

      const phase = plan.phases.find(p => p.id === phaseId);
      if (!phase) {
        console.warn(`[AutoCommit] Phase not found: ${phaseId} in plan ${planSlug}`);
        return false;
      }

      const gitService = new GitService(this.repoPath);

      if (!gitService.isGitRepository()) {
        console.warn('[AutoCommit] Not a git repository - skipping auto-commit');
        return false;
      }

      const commitMessage = phase.commitCheckpoint ||
        `chore(plan): complete ${phase.name} for ${planSlug}`;

      const stagePatterns = ['.context/**'];

      try {
        const stagedFiles = gitService.stageFiles(stagePatterns);

        if (stagedFiles.length === 0) {
          console.info('[AutoCommit] No files to commit - skipping');
          return false;
        }

        const coAuthor = 'AI Context Agent';
        const commitResult = gitService.commit(commitMessage, coAuthor);

        await this.recordPhaseCommit(planSlug, phaseId, {
          hash: commitResult.hash,
          shortHash: commitResult.shortHash,
          committedBy: coAuthor,
        });

        console.info(`[AutoCommit] Created commit ${commitResult.shortHash} for phase ${phaseId}`);
        return true;
      } catch (error) {
        console.warn(`[AutoCommit] Failed to create commit for phase ${phaseId}:`, error);
        return false;
      }
    } catch (error) {
      console.error('[AutoCommit] Unexpected error in autoCommitPhase:', error);
      return false;
    }
  }
}
