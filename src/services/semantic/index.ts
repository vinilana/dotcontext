/**
 * Semantic Analysis Service
 *
 * Provides code analysis capabilities using Tree-sitter for fast syntactic
 * analysis and optional LSP integration for deeper semantic understanding.
 */

export { CodebaseAnalyzer } from './codebaseAnalyzer';
export { TreeSitterLayer } from './treeSitter';
export { LSPLayer } from './lsp';
export {
  SemanticContextBuilder,
  type ContextBuilderOptions,
  type ContextFormat
} from './contextBuilder';
export {
  SemanticSnapshotService,
  type SemanticSnapshotManifest,
  type SemanticSnapshotSection,
  type SemanticSnapshotWriteOptions,
  type SemanticSnapshotWriteResult,
  type SemanticSnapshotReadOptions,
  type SemanticSnapshotSectionResult,
} from './semanticSnapshotService';

export * from './types';
