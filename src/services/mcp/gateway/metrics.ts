/**
 * Metrics Service
 *
 * Tracks context tool usage vs file reads to measure improvement.
 * Helps evaluate the effectiveness of pre-computed context.
 */

/**
 * Session metrics structure
 */
export interface SessionMetrics {
  sessionId: string;
  startTime: string;
  contextQueries: number;
  qaSearches: number;
  flowQueries: number;
  patternDetections: number;
  fileReads: number;
  tokensEstimate: number;
  lastUpdated: string;
}

/**
 * Metrics summary
 */
export interface MetricsSummary {
  contextQueries: number;
  fileReads: number;
  ratio: number;
  efficiency: 'high' | 'medium' | 'low';
  tokensSaved: number;
  recommendations: string[];
}

/**
 * In-memory metrics storage for the current session
 */
class MetricsStore {
  private metrics: SessionMetrics;

  constructor() {
    this.metrics = this.createNewSession();
  }

  private createNewSession(): SessionMetrics {
    return {
      sessionId: `session_${Date.now()}`,
      startTime: new Date().toISOString(),
      contextQueries: 0,
      qaSearches: 0,
      flowQueries: 0,
      patternDetections: 0,
      fileReads: 0,
      tokensEstimate: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  recordContextQuery(type: 'qa' | 'flow' | 'pattern' | 'other'): void {
    this.metrics.contextQueries++;
    this.metrics.lastUpdated = new Date().toISOString();

    switch (type) {
      case 'qa':
        this.metrics.qaSearches++;
        break;
      case 'flow':
        this.metrics.flowQueries++;
        break;
      case 'pattern':
        this.metrics.patternDetections++;
        break;
    }
  }

  recordFileRead(estimatedTokens: number = 1000): void {
    this.metrics.fileReads++;
    this.metrics.tokensEstimate += estimatedTokens;
    this.metrics.lastUpdated = new Date().toISOString();
  }

  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  getSummary(): MetricsSummary {
    const { contextQueries, fileReads, tokensEstimate } = this.metrics;

    // Calculate ratio (higher is better - more context queries, fewer file reads)
    const ratio = fileReads > 0 ? contextQueries / fileReads : contextQueries > 0 ? Infinity : 0;

    // Estimate tokens saved (average Q&A response ~500 tokens vs file read ~1000 tokens)
    const tokensSaved = contextQueries * 500;

    // Determine efficiency level
    let efficiency: 'high' | 'medium' | 'low';
    if (ratio >= 2 || (contextQueries > 5 && fileReads < 10)) {
      efficiency = 'high';
    } else if (ratio >= 0.5 || contextQueries > 0) {
      efficiency = 'medium';
    } else {
      efficiency = 'low';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (fileReads > 20 && contextQueries < 5) {
      recommendations.push('Use buildSemantic or getMap to reduce broad file reads');
    } else if (this.metrics.qaSearches === 0 && fileReads > 8) {
      recommendations.push('Use getMap or buildSemantic to inspect the codebase before reading many files');
    }

    if (efficiency === 'low') {
      recommendations.push('Treat generateQA/searchQA as optional helpers; start with semantic context and snapshots');
    }

    if (this.metrics.flowQueries === 0 && fileReads > 5) {
      recommendations.push('Use getFlow to understand execution paths instead of tracing through files');
    }

    if (this.metrics.patternDetections === 0 && fileReads > 10) {
      recommendations.push('Use detectPatterns to understand codebase capabilities');
    }

    return {
      contextQueries,
      fileReads,
      ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : -1,
      efficiency,
      tokensSaved,
      recommendations: recommendations.slice(0, 3),
    };
  }

  reset(): void {
    this.metrics = this.createNewSession();
  }
}

// Singleton instance
const metricsStore = new MetricsStore();

/**
 * Record a context query (Q&A search, flow query, pattern detection)
 */
export function recordContextQuery(type: 'qa' | 'flow' | 'pattern' | 'other'): void {
  metricsStore.recordContextQuery(type);
}

/**
 * Record a file read operation
 */
export function recordFileRead(estimatedTokens?: number): void {
  metricsStore.recordFileRead(estimatedTokens);
}

/**
 * Get current session metrics
 */
export function getMetrics(): SessionMetrics {
  return metricsStore.getMetrics();
}

/**
 * Get metrics summary with recommendations
 */
export function getMetricsSummary(): MetricsSummary {
  return metricsStore.getSummary();
}

/**
 * Reset metrics for a new session
 */
export function resetMetrics(): void {
  metricsStore.reset();
}

/**
 * Handle metrics gateway action
 */
export function handleMetricsAction(action: 'get' | 'summary' | 'reset'): object {
  switch (action) {
    case 'get':
      return getMetrics();
    case 'summary':
      return getMetricsSummary();
    case 'reset':
      resetMetrics();
      return { success: true, message: 'Metrics reset' };
    default:
      return { error: `Unknown metrics action: ${action}` };
  }
}
