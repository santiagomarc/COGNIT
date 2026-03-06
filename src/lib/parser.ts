export type ParseFlagReason = 'no_delimiter' | 'empty_front' | 'empty_back';

export type ParsedCard = {
  front: string;
  back: string;
  lineNumber: number;
};

export type FlaggedLine = {
  text: string;
  lineNumber: number;
  reason: ParseFlagReason;
};

export type ParseResult = {
  cards: ParsedCard[];
  flagged: FlaggedLine[];
  totalLines: number;
};

export function parseDelimitedNotes(input: string, delimiter = ' - '): ParseResult {
  const safeDelimiter = delimiter.length > 0 ? delimiter : ' - ';
  const rawLines = input.split(/\r?\n/);
  const cards: ParsedCard[] = [];
  const flagged: FlaggedLine[] = [];

  rawLines.forEach((rawLine, index) => {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      return;
    }

    const delimiterIndex = trimmedLine.indexOf(safeDelimiter);
    if (delimiterIndex < 0) {
      flagged.push({
        text: trimmedLine,
        lineNumber: index + 1,
        reason: 'no_delimiter',
      });
      return;
    }

    const front = trimmedLine.slice(0, delimiterIndex).trim();
    const back = trimmedLine.slice(delimiterIndex + safeDelimiter.length).trim();

    if (!front) {
      flagged.push({
        text: trimmedLine,
        lineNumber: index + 1,
        reason: 'empty_front',
      });
      return;
    }

    if (!back) {
      flagged.push({
        text: trimmedLine,
        lineNumber: index + 1,
        reason: 'empty_back',
      });
      return;
    }

    cards.push({
      front,
      back,
      lineNumber: index + 1,
    });
  });

  return {
    cards,
    flagged,
    totalLines: rawLines.length,
  };
}