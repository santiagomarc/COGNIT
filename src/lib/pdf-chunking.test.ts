import { describe, expect, it } from 'vitest';
import { assessPdfQuality, chunkDocumentText, describePdfQuality, MAX_CHUNKS } from './pdf-chunking';

describe('chunkDocumentText', () => {
  it('returns a single chunk for short documents', () => {
    expect(chunkDocumentText('short but real study text')).toHaveLength(1);
  });

  it('returns nothing for whitespace-only input', () => {
    expect(chunkDocumentText('   \n\n  ')).toHaveLength(0);
  });

  it('splits long documents into multiple chunks', () => {
    const text = Array.from({ length: 2_000 }, (_, i) => `Paragraph ${i} with several sentences of study content in it.`).join('\n\n');
    expect(chunkDocumentText(text).length).toBeGreaterThan(1);
  });

  it('overlaps consecutive chunks so a split definition survives', () => {
    const text = Array.from({ length: 2_000 }, (_, i) => `Paragraph ${i} with several sentences of study content in it.`).join('\n\n');
    const chunks = chunkDocumentText(text);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].charStart).toBeLessThan(chunks[i - 1].charEnd);
    }
  });

  it('caps chunk count so a huge PDF cannot run away with AI spend', () => {
    expect(chunkDocumentText('x'.repeat(5_000_000)).length).toBeLessThanOrEqual(MAX_CHUNKS);
  });

  it('prefers a paragraph boundary over a hard cut', () => {
    const text = `${'a'.repeat(20_000)}\n\n${'b'.repeat(20_000)}`;
    const [first] = chunkDocumentText(text);
    expect(first.text.endsWith('a')).toBe(true);
  });

  it('covers the whole document, not just the first 120k chars', () => {
    // The pre-chunking implementation truncated at 120,000 characters and said
    // nothing about it. The tail must now reach the model.
    const head = 'Alpha content. '.repeat(6_000);      // ~90k chars
    const tail = 'OmegaMarker content. ';
    const chunks = chunkDocumentText(head + tail.repeat(3_000));
    expect(chunks.some((chunk) => chunk.text.includes('OmegaMarker'))).toBe(true);
  });
});

describe('assessPdfQuality', () => {
  it('flags scanned PDFs by text-per-page ratio', () => {
    const quality = assessPdfQuality('  \n  ', '', 20);
    expect(quality.kind).toBe('likely_scanned');
    expect(describePdfQuality(quality)).toContain('OCR');
  });

  it('distinguishes a genuinely short document from a scan', () => {
    expect(assessPdfQuality('hello', 'hello', 1).kind).toBe('too_short');
  });

  it('flags a document that is mostly page furniture', () => {
    const raw = 'x'.repeat(10_000);
    expect(assessPdfQuality(raw, 'y'.repeat(300), 1).kind).toBe('too_noisy');
  });

  it('accepts a normal document', () => {
    const body = 'Mitochondria are the powerhouse of the cell. '.repeat(50);
    expect(assessPdfQuality(body, body, 3).kind).toBe('ok');
    expect(describePdfQuality({ kind: 'ok' })).toBeNull();
  });
});
