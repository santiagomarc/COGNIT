import { describe, expect, it } from 'vitest';
import { parseFrame, takeCompleteFrames } from './use-deck-chat-stream';

describe('takeCompleteFrames', () => {
  it('returns whole frames and no leftover when the buffer ends cleanly', () => {
    const buffer = 'event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\n';
    const { frames, rest } = takeCompleteFrames(buffer);
    expect(frames).toHaveLength(2);
    expect(rest).toBe('');
  });

  it('carries a trailing partial frame over to the next read', () => {
    // A network chunk can end anywhere, including mid-frame. Dropping the
    // leftover here would silently lose a token.
    const { frames, rest } = takeCompleteFrames('event: delta\ndata: {"text":"a"}\n\nevent: del');
    expect(frames).toHaveLength(1);
    expect(rest).toBe('event: del');
  });

  it('handles a chunk that splits the frame separator itself', () => {
    const first = takeCompleteFrames('event: delta\ndata: {"text":"a"}\n');
    expect(first.frames).toHaveLength(0);

    const second = takeCompleteFrames(`${first.rest}\nevent: done\ndata: {}\n\n`);
    expect(second.frames).toHaveLength(2);
    expect(parseFrame(second.frames[0]).event).toBe('delta');
    expect(parseFrame(second.frames[1]).event).toBe('done');
  });

  it('reassembles a stream delivered one character at a time', () => {
    const wire = 'event: meta\ndata: {"grounded":true}\n\nevent: delta\ndata: {"text":"hi"}\n\n';
    const collected: string[] = [];
    let buffer = '';

    for (const char of wire) {
      const { frames, rest } = takeCompleteFrames(buffer + char);
      collected.push(...frames);
      buffer = rest;
    }

    expect(collected).toHaveLength(2);
    expect(parseFrame(collected[0]).event).toBe('meta');
    expect(JSON.parse(parseFrame(collected[1]).data)).toEqual({ text: 'hi' });
  });

  it('returns nothing for an empty buffer', () => {
    expect(takeCompleteFrames('')).toEqual({ frames: [], rest: '' });
  });
});

describe('parseFrame', () => {
  it('extracts the event name and data payload', () => {
    const { event, data } = parseFrame('event: delta\ndata: {"text":"hello"}');
    expect(event).toBe('delta');
    expect(JSON.parse(data)).toEqual({ text: 'hello' });
  });

  it('concatenates multi-line data fields per the SSE spec', () => {
    const { data } = parseFrame('event: delta\ndata: {"text":\ndata: "split"}');
    expect(JSON.parse(data)).toEqual({ text: 'split' });
  });

  it('defaults to the "message" event when none is given', () => {
    expect(parseFrame('data: {}').event).toBe('message');
  });

  it('preserves JSON containing a colon-space sequence', () => {
    const payload = { text: 'note: this matters' };
    const { data } = parseFrame(`event: delta\ndata: ${JSON.stringify(payload)}`);
    expect(JSON.parse(data)).toEqual(payload);
  });
});
