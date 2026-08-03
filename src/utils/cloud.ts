export type CloudMode = 'local' | 'cloud';
export type CloudProvider = 'openai' | 'groq' | 'gemini';

export interface CloudSettings {
  mode: CloudMode;
  provider: CloudProvider;
  apiKey: string;
}

const CLOUD_SETTINGS_KEY = 'browser-rag-app-cloud-settings';

export function getStoredCloudSettings(): CloudSettings {
  const stored = localStorage.getItem(CLOUD_SETTINGS_KEY);
  if (!stored) {
    return { mode: 'local', provider: 'openai', apiKey: '' };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      mode: parsed.mode === 'cloud' ? 'cloud' : 'local',
      provider: parsed.provider === 'groq' || parsed.provider === 'gemini' ? parsed.provider : 'openai',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : ''
    };
  } catch {
    return { mode: 'local', provider: 'openai', apiKey: '' };
  }
}

export function saveCloudSettings(settings: CloudSettings) {
  localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(settings));
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unable to parse response from cloud provider: ${text}`);
  }
}

export async function callCloudLLM(query: string, context: string[], settings: CloudSettings): Promise<string> {
  const prompt = `Answer the user's question using only the provided context.\n\nContext:\n${context.join('\n---\n')}\n\nQuestion: ${query}\nAnswer:`;

  if (settings.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 256
      })
    });

    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      throw new Error(payload.error?.message ?? `OpenAI request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  }

  if (settings.provider === 'groq') {
    const response = await fetch('https://api.groq.com/v1/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: 'groq-1',
        prompt,
        max_tokens: 256,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      throw new Error(payload.error ?? `Groq request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload.completion?.trim() ?? payload.response?.trim() ?? '';
  }

  if (settings.provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate?key=${encodeURIComponent(settings.apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        maxOutputTokens: 256,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      throw new Error(payload.error?.message ?? `Gemini request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload.candidates?.[0]?.output?.trim() ?? payload.text?.trim() ?? '';
  }

  throw new Error('Unsupported cloud provider');
}
