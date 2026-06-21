/**
 * Q&A Service Module
 *
 * Exports Q&A generation and search functionality.
 */

export { QAService, type QAEntry, type QASearchResult, type QAGenerationResult } from './qaService';
export { TopicDetector, type QATopic, type TopicDetectionResult, type ProjectType } from './topicDetector';
export { PatternInferer } from './patternInferer';
