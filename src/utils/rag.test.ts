import { describe, expect, it } from 'vitest';
import { hybridRetrieveContext } from './rag';

describe('hybridRetrieveContext', () => {
  it('fuses vector similarity and keyword matching into a ranked list', () => {
    const chunks = [
      { id: 'chunk-1', text: 'Alpha release notes for the new onboarding flow', embedding: [1, 0, 0] },
      { id: 'chunk-2', text: 'The beta rollout focuses on analytics dashboards', embedding: [0.6, 0.8, 0] },
      { id: 'chunk-3', text: 'Customer support handles refund requests', embedding: [0, 0, 1] }
    ];

    const queryEmbedding = [1, 0, 0];
    const results = hybridRetrieveContext(queryEmbedding, chunks, 'alpha onboarding', 3);

    expect(results[0].id).toBe('chunk-1');
    expect(results[0].similarityScore).toBeGreaterThan(0);
    expect(results[0].keywordScore).toBeGreaterThan(0);
  });
});
