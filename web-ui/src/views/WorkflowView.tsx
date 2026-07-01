import { useMemo } from 'react';
import { useWorkflowHarness, useWorkflowPlanDetails, useWorkflowPlans, useWorkflowStatus } from '../hooks/useApi';
import { EmptyNote, ErrorNote, LoadingNote, StatusPill, ToolBadge } from '../components/common';
import type { PrevcPhase } from '../types/api';

const PHASE_ORDER: PrevcPhase[] = ['P', 'R', 'E', 'V', 'C'];
const PHASE_LABELS: Record<PrevcPhase, string> = {
  P: 'Planning',
  R: 'Review',
  E: 'Execution',
  V: 'Validation',
  C: 'Confirmation',
};

function PhaseTracker({ currentPhase, phases }: { currentPhase: PrevcPhase | null; phases: Record<PrevcPhase, { status: string }> | null }) {
  return (
    <div className="phase-tracker">
      {PHASE_ORDER.map((phase, index) => {
        const phaseStatus = phases?.[phase]?.status ?? 'pending';
        const isCurrent = phase === currentPhase;
        return (
          <div key={phase} className={`phase-step phase-step--${phaseStatus}${isCurrent ? ' phase-step--current' : ''}`}>
            <div className="phase-step-marker">{phase}</div>
            <div className="phase-step-label">{PHASE_LABELS[phase]}</div>
            <div className="phase-step-status">{phaseStatus.replace('_', ' ')}</div>
            {index < PHASE_ORDER.length - 1 && <div className="phase-step-connector" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowView() {
  const { data: statusResult, loading: statusLoading, error: statusError } = useWorkflowStatus();
  const { data: harness, loading: harnessLoading, error: harnessError } = useWorkflowHarness();
  const { data: plansResult } = useWorkflowPlans();

  const planSlug = useMemo(() => {
    if (!plansResult?.plans) return null;
    return plansResult.plans.primary ?? plansResult.plans.active[0]?.slug ?? null;
  }, [plansResult]);

  const { data: planDetails, loading: planLoading, error: planError } = useWorkflowPlanDetails(planSlug);

  const summary = statusResult?.summary ?? null;
  const status = statusResult?.status ?? null;

  return (
    <div className="workflow-view">
      <section>
        <h1>Workflow</h1>
        {statusLoading && <LoadingNote />}
        {statusError && <ErrorNote message={statusError} />}
        {!statusLoading && !statusError && !summary && <EmptyNote label="No active PREVC workflow." />}
        {summary && (
          <>
            <p className="muted">
              {summary.name} — scale: {summary.scale} — {summary.progress.completed}/{summary.progress.total} phases (
              {summary.progress.percentage}%) {summary.isComplete ? '— complete' : ''}
            </p>
            <PhaseTracker currentPhase={summary.currentPhase} phases={status?.phases ?? null} />
          </>
        )}
      </section>

      <section>
        <h2>Harness session &amp; gates</h2>
        {harnessLoading && <LoadingNote />}
        {harnessError && <ErrorNote message={harnessError} />}
        {!harnessLoading && !harnessError && !harness && <EmptyNote label="No harness session bound to this workflow." />}
        {harness && (
          <>
            <dl className="kv-grid">
              <dt>Session</dt>
              <dd>
                {harness.session.name} <StatusPill status={harness.session.status} />
              </dd>
              <dt>Tool</dt>
              <dd>
                <ToolBadge
                  host={
                    typeof harness.session.metadata?.host === 'string' ? (harness.session.metadata.host as string) : undefined
                  }
                />
              </dd>
              <dt>Gate status</dt>
              <dd>
                <StatusPill status={harness.completionCheck.blocked ? 'blocked' : 'clear'} />
                {harness.completionCheck.reasons.length > 0 && (
                  <ul className="plain-list">
                    {harness.completionCheck.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </dd>
              <dt>Sensor runs</dt>
              <dd>{harness.sensorRuns.length}</dd>
              <dt>Task contracts</dt>
              <dd>{harness.taskContracts.length}</dd>
              <dt>Handoffs</dt>
              <dd>{harness.handoffs.length}</dd>
            </dl>

            {harness.sensorRuns.length > 0 && (
              <ul className="plain-list">
                {harness.sensorRuns.map((run) => (
                  <li key={run.id}>
                    <StatusPill status={run.status} /> <strong>{run.sensorId}</strong>
                    <span className="muted"> — {run.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Agents &amp; tools</h2>
        {!planSlug && <EmptyNote label="No plan linked -- nothing to attribute yet." />}
        {planSlug && planLoading && <LoadingNote />}
        {planSlug && planDetails?.plan && planDetails.plan.agentLineup.length === 0 && (
          <EmptyNote label="This plan does not record an agent lineup." />
        )}
        {planDetails?.plan && planDetails.plan.agentLineup.length > 0 && (
          <div className="lineup-grid">
            {planDetails.plan.agentLineup.map((entry, index) => (
              <div className="lineup-card" key={`${entry.type}-${index}`}>
                <div className="lineup-card-type">{entry.type}</div>
                {entry.role && <div className="lineup-card-role">{entry.role}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Linked plan</h2>
        {!planSlug && <EmptyNote label="No plan linked to the active workflow." />}
        {planSlug && planLoading && <LoadingNote />}
        {planSlug && planError && <ErrorNote message={planError} />}
        {planSlug && planDetails?.success === false && <ErrorNote message={planDetails.error || 'Plan not found'} />}
        {planDetails?.plan && (
          <>
            <h3>
              {planDetails.plan.ref.title} <span className="muted small">({planDetails.plan.ref.slug})</span>
            </h3>
            <p className="muted">Progress: {planDetails.plan.progress}%</p>
            <ul className="plan-phase-list">
              {planDetails.plan.phases.map((phase) => (
                <li key={phase.id} className={`plan-phase plan-phase--${phase.status}`}>
                  <div className="plan-phase-header">
                    <strong>{phase.name}</strong> <StatusPill status={phase.status} />
                    <span className="muted small"> PREVC: {phase.prevcPhaseName ?? phase.prevcPhase}</span>
                  </div>
                  {phase.steps.length > 0 && (
                    <ul className="plain-list">
                      {phase.steps.map((step) => (
                        <li key={step.order}>
                          <StatusPill status={step.status} /> {step.description}
                          {step.assignee && <span className="tag">{step.assignee}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
