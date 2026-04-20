function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function levenshteinDistanceRaw(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 0; i < left.length; i += 1) {
    let previous = i;
    previousRow[0] = i + 1;

    for (let j = 0; j < right.length; j += 1) {
      const insertCost = previousRow[j + 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previous + (left[i] === right[j] ? 0 : 1);
      previous = previousRow[j + 1];
      previousRow[j + 1] = Math.min(insertCost, deleteCost, replaceCost);
    }
  }

  return previousRow[right.length];
}

export function levenshteinDistance(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  return levenshteinDistanceRaw(left, right);
}

export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  const longest = Math.max(left.length, right.length);

  if (longest === 0) {
    return 1;
  }

  return 1 - levenshteinDistanceRaw(left, right) / longest;
}