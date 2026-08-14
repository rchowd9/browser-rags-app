// src/utils/promptUtils.ts

/**
 * Builds a structured RAG prompt given retrieved context passages and user question.
 */
export function buildRagPrompt(contextPassages: string[], question: string): string {
  const joinedContext = contextPassages.join('\n\n');
  return `Answer the user's question using only the provided context.

Context:
${joinedContext}

Question: ${question}
Answer:`;
}

/**
 * Strips out the initial system prompt template and injected context, 
 * returning only the final generated completion text.
 */
export function stripSystemPrompt(fullOutput: string, constructedPrompt: string): string {
  if (!fullOutput) return '';

  let cleaned = fullOutput;

  // 1. Remove the exact injected prompt if present at the beginning
  if (constructedPrompt && cleaned.startsWith(constructedPrompt)) {
    cleaned = cleaned.substring(constructedPrompt.length);
  }

  // 2. Fallback regex to split on 'Answer:' marker if prompt prefix matching fails
  if (cleaned.includes('Answer:')) {
    const parts = cleaned.split('Answer:');
    cleaned = parts[parts.length - 1];
  }

  // 3. Remove common internal instructions or trailing metadata tokens
  cleaned = cleaned
    .replace(/^Answer the user's question using only the provided context\./i, '')
    .trim();

  return cleaned;
}