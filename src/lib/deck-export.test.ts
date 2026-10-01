import { describe, expect, it } from 'vitest';
import {
  CSV_HEADER,
  CSV_HEADER_ALL,
  ankiHeader,
  ankiHeaderAll,
  csvCell,
  exportAllFilename,
  exportFilename,
  toAnkiField,
  toAnkiRow,
  toAnkiRowWithDeck,
  toAnkiTags,
  toCsvRow,
  toCsvRowWithDeck,
  type ExportCard,
} from '@/lib/deck-export';

const CARD: ExportCard = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  front: 'Mitochondrion',
  back: 'Which organelle produces most of the cell’s ATP?',
  explanation: null,
  topic_tags: ['cell biology', 'energy'],
  state: 'review',
  interval: 12,
  ease_factor: 2.5,
  next_review_at: '2026-10-01T00:00:00.000Z',
};

describe('deck export — CSV', () => {
  it('names columns for what they are: question is `back`, answer is `front`', () => {
    expect(CSV_HEADER.startsWith('question,answer,')).toBe(true);
    expect(toCsvRow(CARD).startsWith('Which organelle produces most of the cell’s ATP?,Mitochondrion,')).toBe(true);
  });

  it('neutralises a cell a spreadsheet would execute as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves a negative number alone: only text is neutralised', () => {
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes, newlines and edge whitespace (RFC 4180)', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded')).toBe('" padded"');
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('deck export — Anki', () => {
  it('converts math to MathJax and leaves prices as text', () => {
    expect(toAnkiField('Energy is $E = mc^2$.')).toBe('Energy is \\(E = mc^2\\).');
    expect(toAnkiField('$$a^2 + b^2$$')).toBe('\\[a^2 + b^2\\]');
    expect(toAnkiField('It costs $5 and $10.')).toBe('It costs $5 and $10.');
  });

  it('keeps every card on one line: tabs become spaces, newlines <br>', () => {
    const row = toAnkiRow({ ...CARD, back: 'line one\nline\ttwo' });
    expect(row.split('\n').length).toBe(2); // the row, then the trailing newline
    expect(row.split('\t')[0]).toBe('line one<br>line    two');
  });

  it('escapes HTML in text and code', () => {
    expect(toAnkiField('a < b & c')).toBe('a &lt; b &amp; c');
    expect(toAnkiField('`<div>`')).toBe('<code>&lt;div&gt;</code>');
  });

  it('makes tags space-free and nests them under cognit::', () => {
    expect(toAnkiTags(['cell biology', 'energy!', ''])).toBe('cognit::cell_biology cognit::energy');
    expect(toAnkiTags(null)).toBe('');
  });

  it('writes headers that import with no dialog choices, and a stable GUID', () => {
    const header = ankiHeader('Bio::Cells');
    expect(header).toContain('#separator:tab\n');
    expect(header).toContain('#notetype:Basic\n');
    expect(header).toContain('#deck:Cognit::Bio - Cells\n');
    expect(header).toContain('#guid column:4\n');
    const [prompt, answer, tags, guid] = toAnkiRow({ ...CARD, explanation: 'Site of oxidative phosphorylation.' }).trimEnd().split('\t');
    expect(prompt).toBe('Which organelle produces most of the cell’s ATP?');
    expect(answer).toBe('Mitochondrion<br><br><small>Site of oxidative phosphorylation.</small>');
    expect(tags).toBe('cognit::cell_biology cognit::energy');
    expect(guid).toBe(`cognit-${CARD.id}`);
  });
});

describe('deck export — file names', () => {
  it('produces an ASCII name safe inside Content-Disposition', () => {
    expect(exportFilename('Café "Biology" 101', 'csv')).toBe('cafe-biology-101.csv');
    expect(exportFilename('日本語', 'anki')).toBe('deck.anki.txt');
  });
});

describe('export all decks (sidebar plan §4.5)', () => {
  const card: ExportCard = {
    id: 'c1',
    front: 'Mitochondria',
    back: 'Site of the Krebs cycle?',
    explanation: null,
    topic_tags: ['cell'],
    state: 'review',
    interval: 4,
    ease_factor: 2.5,
    next_review_at: '2026-10-02T00:00:00Z',
  };

  it('prefixes the single-deck CSV row with a deck cell, escaped like any other', () => {
    expect(CSV_HEADER_ALL.startsWith('deck,question,answer')).toBe(true);
    expect(toCsvRowWithDeck('Bio, Ch. 4', card)).toBe(`"Bio, Ch. 4",${toCsvRow(card)}`);
    expect(toCsvRowWithDeck('=HYPERLINK()', card).startsWith("'=HYPERLINK()")).toBe(true);
  });

  it('adds a fifth Anki column naming the deck, with the header that points at it', () => {
    expect(ankiHeaderAll()).toContain('#deck column:5');
    expect(ankiHeaderAll()).not.toContain('#deck:');
    const row = toAnkiRowWithDeck('Cell Biology', card);
    expect(row.endsWith('\tCognit::Cell Biology\n')).toBe(true);
    expect(row.split('\t')).toHaveLength(5);
    expect(row.split('\t')[3]).toBe('cognit-c1');
  });

  it('dates the file name', () => {
    expect(exportAllFilename('csv', new Date('2026-10-01T12:00:00Z'))).toBe('cognit-decks-2026-10-01.csv');
    expect(exportAllFilename('anki', new Date('2026-10-01T12:00:00Z'))).toBe('cognit-decks-2026-10-01.anki.txt');
  });
});
