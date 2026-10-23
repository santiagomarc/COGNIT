/**
 * Server-Sent Events over a POST, both ends: the routes write frames with
 * `formatSseFrame`, the browser reads them back with `takeCompleteFrames` and
 * `parseFrame`. Deck chat (`/api/chat`) and PDF generation (`/api/generate`)
 * share it. Hand-rolled rather than EventSource, which cannot POST a body.
 */

/** One frame: `event: <name>`, one `data:` line of JSON, and the blank-line separator. */
export function formatSseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Splits an SSE buffer into complete frames, returning whatever trailing
 * partial frame is left over.
 *
 * A network chunk can end anywhere — including mid-frame, or between the two
 * newlines of a frame separator — so the leftover MUST be carried into the next
 * read. Exported for tests; this is the piece most likely to break subtly.
 */
export function takeCompleteFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;

  let boundary = rest.indexOf('\n\n');
  while (boundary !== -1) {
    frames.push(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf('\n\n');
  }

  return { frames, rest };
}

/** Parses one SSE frame into {event, data}. */
export function parseFrame(frame: string): { event: string; data: string } {
  let event = 'message';
  let data = '';

  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  }

  return { event, data };
}

/**
 * Reads an SSE response body to the end, calling `onFrame` with each frame's
 * event name and parsed JSON payload. Frames whose data is missing or not JSON
 * are skipped.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  onFrame: (event: string, payload: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    const { frames, rest } = takeCompleteFrames(buffer + value);
    buffer = rest;
    for (const frame of frames) {
      const { event, data } = parseFrame(frame);
      if (!data) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }
      onFrame(event, payload);
    }
  }
}
