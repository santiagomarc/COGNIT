/**
 * A chart's numbers as a real table, for assistive technology (plan §5.3).
 * The picture is `aria-hidden`; this is what a screen reader reads, and it
 * can be navigated cell by cell — which a `role="img"` label cannot.
 */
export function ChartDataTable({ caption, columns, rows }: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => <th key={column} scope="col">{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (cellIndex === 0 ? <th key={cellIndex} scope="row">{cell}</th> : <td key={cellIndex}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
