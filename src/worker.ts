import { pipeline, env } from '@huggingface/transformers';
import { retrieveContext } from './utils/rag';

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

async function streamAnswer(query: string, context: string[]) {
  const generator = await GenerationSingleton.getInstance((progress) => {
    self.postMessage({ type: 'PROGRESS', data: progress });
  });

  const prompt = `Answer the user's question using only the provided context.\n\nContext:\n${context.join('\n---\n')}\n\nQuestion: ${query}\nAnswer:`;
  await generator(prompt, {
    max_new_tokens: 160,
    temperature: 0.7,
    do_sample: true,
    streamer: {
      put: (token: string) => {
        self.postMessage({ type: 'ANSWER_STREAM', token });
      },
      end: () => {
        self.postMessage({ type: 'ANSWER_COMPLETE' });
      }
    }
  });
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
      const matches = retrieveContext(embedding, data.chunks ?? [], 3);

      self.postMessage({ type: 'QUERY_EMBEDDED', data: { embedding, query: data.query } });

      if (matches.length > 0) {
        const context = matches.map((match: any) => match.text);
        await streamAnswer(data.query, context);
      } else {
        self.postMessage({ type: 'ANSWER_COMPLETE' });
      }
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
});