import { createHash } from "node:crypto";

/* A short hash of each part of a solver's inputs: { periods: "3f2a…", lessons: "…" }.
   Applying a draft compares them with the inputs as they are now, to name what changed. */
export const fingerprintOf = parts =>
  Object.fromEntries(
    Object.entries(parts).map(([name, rows]) => [
      name,
      createHash("sha256")
        .update(JSON.stringify([...rows].map(row => JSON.stringify(row)).sort()))
        .digest("hex")
        .slice(0, 16)
    ])
  );

/* The parts whose hash differs */
export const changedParts = (saved, now) => Object.keys(now).filter(name => saved?.[name] !== now[name]);
