/**
 * knowledgeMemory — typed agent knowledge categories with compaction policies.
 *
 * Re-exports the sub-modules:
 *   - knowledgeTypes:       type definitions (KnowledgeType, KnowledgeEntry, CompactionPolicy)
 *   - knowledgeClassifier:  classifyKnowledge() function
 *   - knowledgeCompaction:  compactKnowledgeByType(), COMPACTION_POLICIES
 *   - knowledgeMemoryAdapter: bridge to existing AgentMemoryFact system
 */

export type {
  KnowledgeType,
  KnowledgeEntry,
  CompactionPolicy,
} from './knowledgeTypes.js';

export {
  classifyKnowledge,
} from './knowledgeClassifier.js';

export {
  compactKnowledgeByType,
  COMPACTION_POLICIES,
} from './knowledgeCompaction.js';

export {
  toAgentMemoryFact,
  toAgentMemoryFacts,
  fromAgentMemoryFact,
  fromAgentMemoryFacts,
  compactAgentMemoryFacts,
} from './knowledgeMemoryAdapter.js';
