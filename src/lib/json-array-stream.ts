/**
 * Pulls whole objects out of a JSON document while it is still arriving
 * (performance plan AI-18). PDF generation streams the model's
 * `{"cards":[{…},{…}…]}` and shows each card the moment its object closes,
 * instead of waiting for the whole array.
 *
 * Only the elements of the first array that opens directly inside the
 * top-level object are returned, and only those that are objects. Strings are
 * tracked so a brace or bracket inside one never counts. Each element is
 * parsed on its own; one that fails to parse is skipped, not fatal.
 */
export function createJsonArrayStream() {
  let depth = 0;
  let inString = false;
  let escaped = false;
  // The depth just inside the target array, once it has opened.
  let arrayDepth: number | null = null;
  let arrayClosed = false;
  // The element being collected, from its opening brace.
  let element: string | null = null;

  return {
    /** Feeds the next piece of text; returns the objects it completed. */
    push(text: string): unknown[] {
      const completed: unknown[] = [];

      for (const char of text) {
        if (element !== null) element += char;

        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{' || char === '[') {
          if (arrayDepth === null && !arrayClosed && char === '[' && depth === 1) {
            arrayDepth = depth + 1;
          } else if (arrayDepth !== null && depth === arrayDepth && char === '{') {
            element = char;
          }
          depth += 1;
          continue;
        }

        if (char === '}' || char === ']') {
          depth -= 1;
          if (arrayDepth !== null && depth === arrayDepth && element !== null && char === '}') {
            try {
              completed.push(JSON.parse(element));
            } catch {
              // A malformed element loses only itself.
            }
            element = null;
          } else if (arrayDepth !== null && depth === arrayDepth - 1 && char === ']') {
            arrayDepth = null;
            arrayClosed = true;
          }
        }
      }

      return completed;
    },
  };
}
