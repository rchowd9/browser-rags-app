export interface DocumentChunk {
  id: string;
  text: string;
  embedding?: number[];
}

/**
 * Splits plain text into overlapping token/character chunks.
 */
export function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;

  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
    i += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Calculates Cosine Similarity between two vector arrays.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Finds top-K matching chunks for a query embedding.
 */
export function retrieveContext(
  queryEmbedding: number[],
  chunks: DocumentChunk[],
  topK = 3
): DocumentChunk[] {
  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}