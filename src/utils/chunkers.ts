export interface ChunkOptions {
    chunkSize: number;
    chunkOverlap: number;
    splitBy: "character" | "sentence" | "paragraph";
}

export interface Chunk {
    id: string;
    text: string;
    startIndex: number;
    endIndex: number;
}

export function chunkText(text: string, options: ChunkOptions): Chunk[] {
  const { chunkSize = 400, chunkOverlap = 50, splitBy = "sentence" } = options;
  if (!text || !text.trim()) return [];

  const chunks: Chunk[] = [];

  if (splitBy === "paragraph") {
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = "";
    let chunkIdx = 0;
    let currentStart = 0;

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > chunkSize && currentChunk.length > 0) {
        const trimmed = currentChunk.trim();
        chunks.push({
          id: `chunk-${chunkIdx++}`,
          text: trimmed,
          startIndex: currentStart,
          endIndex: currentStart + trimmed.length,
        });
        currentStart += currentChunk.length - chunkOverlap;
        currentChunk = currentChunk.slice(-chunkOverlap) + " " + paragraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }
    if (currentChunk.trim()) {
      const trimmed = currentChunk.trim();
      chunks.push({
        id: `chunk-${chunkIdx}`,
        text: trimmed,
        startIndex: currentStart,
        endIndex: currentStart + trimmed.length,
      });
    }
    return chunks;
  }

  let start = 0;
  let chunkIdx = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    if (splitBy === "sentence" && end < text.length) {
      const nearestPeriod = text.indexOf(".", end - 20);
      if (nearestPeriod !== -1 && nearestPeriod < end + 30) {
        end = nearestPeriod + 1;
      }
    }

    const chunkContent = text.slice(start, end).trim();
    if (chunkContent) {
      chunks.push({
        id: `chunk-${chunkIdx++}`,
        text: chunkContent,
        startIndex: start,
        endIndex: end,
      });
    }

    start += chunkSize - chunkOverlap;
  }

  return chunks;
}