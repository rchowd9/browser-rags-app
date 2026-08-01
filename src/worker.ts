import { pipeline, env } from '@huggingface/transformers';

// Configure runtime
env.allowLocalModels = false;

class PipelineSingleton {
  static task = 'feature-extraction';
  static model = 'mixedbread-ai/mxbai-embed-xsmall-v1';
  static instance: any = null;

  static async getInstance(progressCallback?: (data: any) => void) {
    if (!this.instance) {
      this.instance = await pipeline(this.task as any, this.model, {
        progress_callback: progressCallback,
        device: 'webgpu' // Auto-falls back to WebAssembly if WebGPU isn't available
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'EMBED_CHUNKS') {
    try {
      const extractor = await PipelineSingleton.getInstance((progress) => {
        self.postMessage({ type: 'PROGRESS', data: progress });
      });

      const { chunks } = data;
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data) as number[];
        embeddedChunks.push({ ...chunk, embedding });
      }

      self.postMessage({ type: 'CHUNKS_EMBEDDED', data: embeddedChunks });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }

  if (type === 'EMBED_QUERY') {
    try {
      const extractor = await PipelineSingleton.getInstance();
      const output = await extractor(data.query, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data) as number[];

      self.postMessage({ type: 'QUERY_EMBEDDED', data: { embedding, query: data.query } });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
});