import { pipeline, env } from '@huggingface/transformers';
import { hybridRetrieveContext } from './utils/rag';

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
        device: 'webgpu'
      });
    }
    return this.instance;
  }
}

class GenerationSingleton {
  static generator: any = null;

  static async getInstance(progressCallback?: (data: any) => void) {
    if (!this.generator) {
      this.generator = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-135M-Instruct', {
        progress_callback: progressCallback,
        device: 'webgpu'
      });
    }
    return this.generator;
  }
}

async function streamAnswer(query: string, context: string[], requestId: number) {
  const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
  const webGpuSupported = typeof navigator !== 'undefined' && typeof navigatorWithGpu.gpu !== 'undefined';
  if (!webGpuSupported) {
    self.postMessage({
      type: 'ANSWER_FALLBACK',
      data: { text: 'WebGPU is not available in this browser, so local answer generation could not be started. Retrieval results are still shown.' },
      requestId
    });
    return;
  }

  const generator = await GenerationSingleton.getInstance((progress) => {
    self.postMessage({ type: 'PROGRESS', data: progress, requestId });
  });

  const prompt = `Answer the user's question using only the provided context.\n\nContext:\n${context.join('\n---\n')}\n\nQuestion: ${query}\nAnswer:`;
  const result = await generator(prompt, {
    max_new_tokens: 160,
    temperature: 0.7,
    do_sample: true
  });

  const answerText = Array.isArray(result)
    ? result
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') return (item.generated_text ?? item.text ?? JSON.stringify(item));
          return String(item);
        })
        .join('')
    : typeof result === 'string'
    ? result
    : JSON.stringify(result);

  self.postMessage({ type: 'ANSWER_STREAM', token: answerText, requestId });
  self.postMessage({ type: 'ANSWER_COMPLETE', requestId });
}

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'EMBED_CHUNKS') {
    try {
      const extractor = await PipelineSingleton.getInstance((progress) => {
        self.postMessage({ type: 'PROGRESS', data: progress, requestId: data.requestId });
      });

      const { chunks } = data;
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const output = await extractor(chunk.text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data) as number[];
        embeddedChunks.push({ ...chunk, embedding });
      }

      self.postMessage({ type: 'CHUNKS_EMBEDDED', data: embeddedChunks, requestId: data.requestId });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }

  if (type === 'EMBED_QUERY') {
    try {
      const extractor = await PipelineSingleton.getInstance();
      const output = await extractor(data.query, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data) as number[];
      const matches = hybridRetrieveContext(embedding, data.chunks ?? [], data.query, 4);

      self.postMessage({ type: 'QUERY_EMBEDDED', data: { embedding, query: data.query, matches, cloudMode: data.cloudMode ?? false }, requestId: data.requestId });

      if (!data.cloudMode) {
        if (matches.length > 0) {
          const context = matches.map((match: any) => match.text);
          await streamAnswer(data.query, context, data.requestId);
        } else {
          self.postMessage({ type: 'ANSWER_COMPLETE', requestId: data.requestId });
        }
      } else if (data.cloudMode && matches.length === 0) {
        self.postMessage({ type: 'ANSWER_COMPLETE', requestId: data.requestId });
      }
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
});