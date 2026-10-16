import zlib from "node:zlib";

/* Text of a PDF made by pdfkit with embedded (subset) fonts: content streams draw glyph
   codes, and each font's ToUnicode map turns codes back into characters. Good enough for
   assertions; lines are separated by "\n". */

const objectsOf = latin => {
  const objects = new Map();
  for (const match of latin.matchAll(/(\d+) 0 obj\s*([\s\S]*?)\nendobj/g)) {
    const body = match[2];
    const streamAt = body.indexOf("stream\n");
    const dict = streamAt >= 0 ? body.slice(0, streamAt) : body;
    let data = null;
    if (streamAt >= 0) {
      const raw = Buffer.from(body.slice(streamAt + 7, body.lastIndexOf("\nendstream")), "latin1");
      data = /FlateDecode/.test(dict) ? zlib.inflateSync(raw).toString("latin1") : raw.toString("latin1");
    }
    objects.set(match[1], { dict, data });
  }
  return objects;
};

const utf16 = hex => Buffer.from(hex.replace(/\s/g, ""), "hex").swap16().toString("utf16le");

const cmapOf = text => {
  const map = new Map();
  for (const [, block] of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, value] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      map.set(parseInt(code, 16), utf16(value));
  }
  for (const [, block] of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, from, to, rest] of block.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g
    )) {
      const start = parseInt(from, 16);
      const end = parseInt(to, 16);
      if (rest.startsWith("[")) {
        /* Entries may hold several code units, e.g. a ligature: <0066 0066> */
        [...rest.matchAll(/<([0-9a-fA-F\s]+)>/g)].forEach(([, value], i) => map.set(start + i, utf16(value)));
      } else {
        const base = Buffer.from(rest.slice(1, -1), "hex");
        for (let code = start; code <= end; code++) {
          const value = Buffer.from(base);
          value.writeUInt16BE(base.readUInt16BE(base.length - 2) + (code - start), base.length - 2);
          map.set(code, value.swap16().toString("utf16le"));
        }
      }
    }
  }
  return map;
};

export const pdfText = buffer => {
  const objects = objectsOf(buffer.toString("latin1"));
  /* Resource name (/F1) -> ToUnicode map */
  const fonts = new Map();
  for (const { dict } of objects.values()) {
    for (const [, block] of dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
      for (const [, name, ref] of block.matchAll(/\/(\S+)\s+(\d+) 0 R/g)) {
        const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(objects.get(ref)?.dict ?? "");
        const cmap = toUnicode && objects.get(toUnicode[1])?.data;
        if (cmap) fonts.set(name, cmapOf(cmap));
      }
    }
  }
  const decode = (hex, cmap) => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) out += cmap?.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
    return out;
  };
  const lines = [];
  for (const { data } of objects.values()) {
    if (!data || !/ Tf\b/.test(data)) continue;
    let cmap = null;
    let line = "";
    for (const [token] of data.matchAll(
      /\/\S+\s+[\d.]+\s+Tf|\[[^\]]*\]\s*TJ|<[0-9a-fA-F]*>\s*Tj|\bET\b|\bTd\b|\bT\*/g
    )) {
      if (token.endsWith("Tf")) cmap = fonts.get(token.split(/\s+/)[0].slice(1));
      else if (token.endsWith("TJ") || token.endsWith("Tj")) {
        for (const [, hex] of token.matchAll(/<([0-9a-fA-F]*)>/g)) line += decode(hex, cmap);
      } else if (line) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
  }
  return lines.join("\n");
};
