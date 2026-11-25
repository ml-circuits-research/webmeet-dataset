// A coordinator may retire an incorrect published wire only for an explicitly reviewed
// text, exact old wire and exact replacement evidence. Other losses still block review.
export function approvedRetirements(plan, files, rows) {
  if (!Array.isArray(plan)) throw new Error('migration must be an array');
  const allowed = new Map();
  for (const entry of plan) {
    if (!entry || typeof entry.file !== 'string') throw new Error('migration needs a file');
    if (!files.includes(entry.file)) continue;
    if (typeof entry.text !== 'string' || !entry.text ||
        !Array.isArray(entry.remove) || !entry.remove.length ||
        !Array.isArray(entry.require) || !entry.require.length ||
        [...entry.remove, ...entry.require].some(line => typeof line !== 'string' || !line || /[\r\n]/.test(line))) {
      throw new Error('migration needs text, exact removed wires and required replacement wires');
    }
    if (entry.remove.some(line => !line.includes(' w.request.constraint '))) {
      throw new Error('only constraint retirements may be approved');
    }
    const matches = rows.filter(row => row.file === entry.file && row.text === entry.text &&
      row.old !== undefined && entry.remove.every(line => row.old.split('\n').includes(line)));
    if (matches.length !== 1) throw new Error(`migration source missing or ambiguous: ${entry.text}`);
    const row = matches[0], now = row.sop.split('\n');
    if (entry.remove.some(line => now.includes(line)) || !entry.require.every(line => now.includes(line))) {
      throw new Error(`migration replacement missing or old wire retained: ${entry.text}`);
    }
    const lines = allowed.get(row) ?? new Set();
    for (const line of entry.remove) {
      if (lines.has(line)) throw new Error(`duplicate retirement: ${entry.text}`);
      lines.add(line);
    }
    allowed.set(row, lines);
  }
  if (!allowed.size) throw new Error('migration approves no rows in the selected files');
  return allowed;
}
