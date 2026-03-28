export function isMissingTableError(message: string, tableName: string) {
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

export function isMissingColumnError(message: string, columnName: string) {
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