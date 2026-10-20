/* Seeded randomness for the solvers: the same seed and inputs give the same timetable,
   so a draft can be reproduced and an agent's retry with a new seed gives a new one */

/* mulberry32: a small fast generator -> () => number in [0, 1) */
export const createRandom = seed => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /* integer in [0, n) */
    below: n => Math.floor(next() * n),
    /* a copy of the list in random order */
    shuffle: list => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
};

/* A fresh seed when the caller sends none */
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
