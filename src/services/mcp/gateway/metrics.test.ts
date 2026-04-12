import {
  getMetricsSummary,
  recordFileRead,
  resetMetrics,
} from './metrics';

describe('metrics recommendations', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
  });

  it('prioritizes semantic context and snapshots over Q&A generation for broad file reads', () => {
    for (let index = 0; index < 25; index += 1) {
      recordFileRead();
    }

    const summary = getMetricsSummary();

    expect(summary.recommendations).toContain(
      'Use buildSemantic or getMap to reduce broad file reads'
    );
    expect(summary.recommendations).toContain(
      'Treat generateQA/searchQA as optional helpers; start with semantic context and snapshots'
    );
  });

  it('does not suggest searchQA before the session has enough file-read pressure', () => {
    for (let index = 0; index < 5; index += 1) {
      recordFileRead();
    }

    const summary = getMetricsSummary();

    expect(summary.recommendations).not.toContain(
      'Use getMap or buildSemantic to inspect the codebase before reading many files'
    );
  });
});
