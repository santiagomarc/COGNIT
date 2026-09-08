export function isMissingTableError(message: string | null | undefined, tableName: string) {
  if (!message || typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  const normalizedTable = tableName.toLowerCase();
  const referencesTable =
    normalized.includes(normalizedTable) || normalized.includes(`public.${normalizedTable}`);
  const indicatesMissingTable =
    normalized.includes('does not exist') ||
    normalized.includes('could not find the table') ||
    normalized.includes('schema cache');

  return referencesTable && indicatesMissingTable;
}

export function isMissingColumnError(message: string | null | undefined, columnName: string) {
  if (!message || typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  const normalizedColumn = columnName.toLowerCase();
  const referencesColumn =
    normalized.includes(normalizedColumn) || normalized.includes(`public.${normalizedColumn}`);
  const indicatesMissingColumn =
    normalized.includes('does not exist') ||
    normalized.includes('could not find the column') ||
    (normalized.includes('could not find') && normalized.includes('column'));

  return referencesColumn && indicatesMissingColumn;
}

export function isMissingDatabaseFunctionError(message: string | null | undefined, functionName: string) {
  if (!message || typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  const referencesFunction = normalized.includes(functionName.toLowerCase());
  const indicatesMissingFunction =
    normalized.includes('does not exist') ||
    normalized.includes('could not find the function') ||
    (normalized.includes('could not find') && normalized.includes('function'));

  return referencesFunction && indicatesMissingFunction;
}