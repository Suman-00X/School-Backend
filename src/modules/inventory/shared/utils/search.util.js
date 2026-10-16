import { ilike, or } from "drizzle-orm";

/* ?q= across several columns, case-insensitive substring match.
   LIKE wildcards in the input are escaped, so "50%" matches literally. */
export const matchesText = (q, columns) => {
  if (!q) return undefined;
  const pattern = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  return or(...columns.map(column => ilike(column, pattern)));
};
