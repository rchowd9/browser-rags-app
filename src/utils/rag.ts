import MiniSearch from 'minisearch';

export interface DocumentChunk {
  id: string;
  text: string;
  embedding?: number[];
  similarityScore?: number;
  keywordScore?: number;
  hybridScore?: number;
  score?: number;
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

function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildKeywordScores(queryText: string, chunks: DocumentChunk[]): Map<string, number> {
  const scores = new Map<string, number>();
  const queryTerms = tokenizeText(queryText);

  if (queryTerms.length === 0) {
    chunks.forEach((chunk) => scores.set(chunk.id, 0));
    return scores;
  }

  const search = new MiniSearch({ fields: ['text'], storeFields: ['id'] });
  search.addAll(
    chunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text
    }))
  );

  const results = search.search(queryText, { prefix: true, fuzzy: 0 });
  const rankedScores = new Map<string, number>();

  chunks.forEach((chunk) => rankedScores.set(chunk.id, 0));
  results.forEach((result, index) => {
    rankedScores.set(result.id as string, 1 / (index + 1));
  });

  return rankedScores;
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
    score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0,
    similarityScore: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Uses reciprocal rank fusion to combine vector and keyword scores.
 */
export function hybridRetrieveContext(
  queryEmbedding: number[],
  chunks: DocumentChunk[],
  queryText: string,
  topK = 3
): DocumentChunk[] {
  const normalizedQuery = queryText.trim();
  const queryTerms = tokenizeText(normalizedQuery);

  if (queryTerms.length === 0) {
    return retrieveContext(queryEmbedding, chunks, topK);
  }

  const vectorRanked = chunks
    .map((chunk) => ({
      chunk,
      score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
    }))
    .sort((a, b) => b.score - a.score);

  const keywordScores = buildKeywordScores(normalizedQuery, chunks);
  const keywordRanked = chunks
    .map((chunk) => ({
      chunk,
      score: keywordScores.get(chunk.id) ?? 0
    }))
    .sort((a, b) => b.score - a.score);

  const vectorRanks = new Map<string, number>();
  const keywordRanks = new Map<string, number>();

  vectorRanked.forEach((item, index) => {
    vectorRanks.set(item.chunk.id, index + 1);
  });

  keywordRanked.forEach((item, index) => {
    keywordRanks.set(item.chunk.id, index + 1);
  });

  const merged = chunks.map((chunk) => {
    const vectorRank = vectorRanks.get(chunk.id) ?? chunks.length + 1;
    const keywordRank = keywordRanks.get(chunk.id) ?? chunks.length + 1;
    const similarityScore = chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0;
    const keywordScore = keywordScores.get(chunk.id) ?? 0;
    const hybridScore = 1 / (60 + vectorRank) + 1 / (60 + keywordRank);

    return {
      ...chunk,
      similarityScore,
      keywordScore,
      hybridScore,
      score: similarityScore
    } satisfies DocumentChunk;
  });

  return merged
    .sort((a, b) => (b.hybridScore ?? 0) - (a.hybridScore ?? 0))
    .slice(0, topK);
}

function magnitude(values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalize(values: number[]): number[] {
  const norm = magnitude(values);
  if (norm === 0) return values;
  return values.map((value) => value / norm);
}

function computePrincipalComponents(matrix: number[][], components = 2): number[][] {
  if (matrix.length === 0 || matrix[0].length === 0) return [];

  const rows = matrix.length;
  const cols = matrix[0].length;
  const covariance = Array.from({ length: cols }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let row = 0; row < rows; row += 1) {
        sum += matrix[row][i] * matrix[row][j];
      }
      covariance[i][j] = sum / Math.max(1, rows - 1);
    }
  }

  const principalComponents: number[][] = [];
  let vector: number[] = Array.from({ length: cols }, (_, index) => (index === 0 ? 1 : 0));

  for (let componentIndex = 0; componentIndex < components; componentIndex += 1) {
    for (let iteration = 0; iteration < 30; iteration += 1) {
      const transformed = Array.from({ length: cols }, (_, index) => {
        let sum = 0;
        for (let otherIndex = 0; otherIndex < cols; otherIndex += 1) {
          sum += covariance[index][otherIndex] * vector[otherIndex];
        }
        return sum;
      });

      vector = normalize(transformed);
    }

    for (const previous of principalComponents) {
      const projection = dotProduct(vector, previous);
      vector = vector.map((value, index) => value - projection * previous[index]);
    }

    const normalized = normalize(vector);
    if (magnitude(normalized) === 0) break;
    principalComponents.push(normalized);
    vector = normalized;
  }

  return principalComponents;
}

export function projectChunksTo2D(chunks: DocumentChunk[]) {
  const embeddedChunks = chunks.filter((chunk): chunk is DocumentChunk & { embedding: number[] } => Boolean(chunk.embedding?.length));

  if (embeddedChunks.length < 2) {
    return chunks.map((chunk, index) => ({
      id: `${chunk.id}-projection`,
      x: 80 + index * 30,
      y: 80 + (index % 3) * 40,
      chunk
    }));
  }

  const embeddings = embeddedChunks.map((chunk) => chunk.embedding as number[]);
  const components = computePrincipalComponents(
    embeddings.map((embedding) => embedding.map((value) => value))
  );

  const projected = embeddedChunks.map((chunk, index) => {
    const embedding = chunk.embedding as number[];
    const x = components[0] ? dotProduct(embedding, components[0]) : 0;
    const y = components[1] ? dotProduct(embedding, components[1]) : 0;
    return { id: `${chunk.id}-projection`, x, y, chunk };
  });

  const xValues = projected.map((point) => point.x);
  const yValues = projected.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);

  return projected.map((point) => ({
    ...point,
    x: 40 + ((point.x - minX) / xRange) * 240,
    y: 40 + ((point.y - minY) / yRange) * 140
  }));
}