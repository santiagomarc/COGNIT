import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  embedContent: vi.fn(),
  env: {
    GEMINI_API_KEY: 'test',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_EMBEDDING_MODEL: 'embed-test',
    GEMINI_MODEL_MAX_TOKENS: 4096,
  } as Record<string, unknown>,
}));

vi.mock('@/lib/env-server', () => ({ getServerEnv: () => mocks.env }));
vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = {
      generateContent: mocks.generateContent,
      generateContentStream: mocks.generateContentStream,
      embedContent: mocks.embedContent,
    };
  },
}));

const { embedContents, generateJson, generateText, jsonGenerationConfig, modelFamily, streamText } = await import('./gemini');

beforeEach(() => {
  mocks.generateContent.mockReset().mockResolvedValue({ text: '{}' });
  mocks.generateContentStream.mockReset();
  mocks.embedContent.mockReset();
  delete mocks.env.GEMINI_MODEL_GENERATION;
});

describe('jsonGenerationConfig', () => {
  it('states temperature, the output cap and a zero thinking budget on the 2.5 family', () => {
    const config = jsonGenerationConfig({ model: 'gemini-2.5-flash', responseSchema: { type: 'OBJECT' } as never });
    expect(config).toMatchObject({
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT' },
      thinkingConfig: { thinkingBudget: 0 },
    });
  });

  it('lets a caller override temperature, cap and thinking effort on the 2.5 family', () => {
    const config = jsonGenerationConfig({ model: 'gemini-2.5-flash', temperature: 0.6, maxOutputTokens: 256, thinking: 'low' });
    expect(config).toMatchObject({ temperature: 0.6, maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 1024 } });
    expect(config).not.toHaveProperty('responseSchema');
  });

  it('never sends a thinking budget to a 3.x model, pins temperature to 1.0, and maps effort to thinkingLevel', () => {
    const plain = jsonGenerationConfig({ model: 'gemini-3.5-flash-lite', temperature: 0.1 });
    expect(plain.temperature).toBe(1.0);
    expect(plain).not.toHaveProperty('thinkingConfig');

    const low = jsonGenerationConfig({ model: 'gemini-3.5-flash-lite', thinking: 'low' });
    expect(low).toMatchObject({ thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(JSON.stringify(low)).not.toContain('thinkingBudget');
  });

  it('detects the family from the model name and honours an explicit override', () => {
    expect(modelFamily('gemini-3.5-flash-lite')).toBe('3');
    expect(modelFamily('gemini-3-pro-preview')).toBe('3');
    expect(modelFamily('gemini-2.5-flash')).toBe('2.5');
    expect(modelFamily('some-future-model', '3')).toBe('3');
  });
});

describe('generateJson', () => {
  const contents = [{ role: 'user', parts: [{ text: 'hi' }] }];

  it('routes generation to GEMINI_MODEL_GENERATION and derives the dialect from that model', async () => {
    mocks.env.GEMINI_MODEL_GENERATION = 'gemini-3.5-flash';
    await generateJson({ purpose: 'generation', systemInstruction: 'sys', contents, temperature: 0.6, thinking: 'low' });

    const request = mocks.generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.5-flash');
    expect(request.contents).toBe(contents);
    expect(request.config).toMatchObject({ systemInstruction: 'sys', temperature: 1.0, thinkingConfig: { thinkingLevel: 'LOW' } });
  });

  it('passes the deadline and the caller signal to the SDK, and leaves its own retry off', async () => {
    const abort = new AbortController();
    await generateJson({ systemInstruction: 'sys', contents, timeoutMs: 8_000, signal: abort.signal });

    const { model, config } = mocks.generateContent.mock.calls[0][0];
    expect(model).toBe('gemini-2.5-flash');
    expect(config.httpOptions).toEqual({ timeout: 8_000 });
    expect(config.abortSignal).toBe(abort.signal);
  });

  it('sends neither a deadline nor a signal when the caller gives none', async () => {
    await generateJson({ systemInstruction: 'sys', contents });
    const { config } = mocks.generateContent.mock.calls[0][0];
    expect(config).not.toHaveProperty('httpOptions');
    expect(config).not.toHaveProperty('abortSignal');
  });
});

describe('generateText', () => {
  it('runs plain text on GEMINI_MODEL at 0.5 with no JSON mode or thinking override', async () => {
    await generateText({ systemInstruction: 'sys', contents: [] });
    const { model, config } = mocks.generateContent.mock.calls[0][0];
    expect(model).toBe('gemini-2.5-flash');
    expect(config).toEqual({ systemInstruction: 'sys', temperature: 0.5, maxOutputTokens: 4096 });
  });
});

describe('streamText', () => {
  it('opens the stream when awaited, so a failed request lands inside the caller retry', async () => {
    mocks.generateContentStream.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }));
    await expect(streamText({ systemInstruction: 'sys', contents: [] })).rejects.toThrow('busy');
  });

  it('yields each chunk\'s text and skips empty chunks', async () => {
    mocks.generateContentStream.mockResolvedValueOnce((async function* chunks() {
      yield { text: 'Hel' };
      yield { text: undefined };
      yield { text: 'lo' };
    })());

    const stream = await streamText({ systemInstruction: 'sys', contents: [], temperature: 0.4 });
    const out: string[] = [];
    for await (const text of stream) out.push(text);

    expect(out).toEqual(['Hel', 'lo']);
    expect(mocks.generateContentStream.mock.calls[0][0].config.temperature).toBe(0.4);
  });
});

describe('embedContents', () => {
  it('sends each text as its own Content, with the task type and dimensions', async () => {
    mocks.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] });

    const vectors = await embedContents(['a', 'b'], { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 2 });

    expect(vectors).toEqual([[1, 2], [3, 4]]);
    expect(mocks.embedContent).toHaveBeenCalledWith({
      model: 'embed-test',
      contents: [{ role: 'user', parts: [{ text: 'a' }] }, { role: 'user', parts: [{ text: 'b' }] }],
      config: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 2 },
    });
  });
});
