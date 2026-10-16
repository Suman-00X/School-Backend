import path from "node:path";

/* Unicode fonts for every PDF: Noto Sans for Latin (and ₹), plus the Indian scripts and
   Arabic/Urdu. PDF's built-in Helvetica has none of these, so names like अनन्या or தமிழ்
   printed as blanks (D-37). Fonts live in assets/fonts (SIL Open Font License).

   useUnicodeFonts(doc) is applied by renderPdf to every document. Existing drawing code
   keeps calling doc.font("Helvetica" | "Helvetica-Bold") and doc.text(...): the font names
   map to Noto Sans, and each text call is split into runs by script, each drawn with the
   font that has its glyphs. */

const DIR = path.resolve(import.meta.dirname, "../../../assets/fonts");

/* Script -> font family file prefix. Characters common to all scripts (digits, spaces,
   punctuation) stay in the run they are in. */
export const SCRIPT_FONTS = {
  Devanagari: "NotoSansDevanagari",
  Bengali: "NotoSansBengali",
  Tamil: "NotoSansTamil",
  /* Hind Guntur and Mukta Mahee: the Noto Telugu/Gurmukhi fonts crash fontkit's mark positioning */
  Telugu: "HindGuntur",
  Kannada: "NotoSansKannada",
  Malayalam: "NotoSansMalayalam",
  Gujarati: "NotoSansGujarati",
  Gurmukhi: "MuktaMahee",
  Oriya: "NotoSansOriya",
  Arabic: "NotoSansArabic"
};

const SCRIPT_TESTS = Object.keys(SCRIPT_FONTS).map(script => [script, new RegExp(`\\p{Script=${script}}`, "u")]);
const NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;
const NON_LATIN = new RegExp(
  Object.keys(SCRIPT_FONTS)
    .map(s => `\\p{Script=${s}}`)
    .join("|"),
  "u"
);

export const fontFile = (family, bold) => path.join(DIR, `${family}-${bold ? "Bold" : "Regular"}.ttf`);

const scriptOf = char => SCRIPT_TESTS.find(([, test]) => test.test(char))?.[0] ?? null;

/* "Asha अनन्या Rao" -> [{ text: "Asha ", script: null }, { text: "अनन्या ", script: "Devanagari" }, …] */
export const scriptRuns = text => {
  const runs = [];
  for (const char of text) {
    const script = NEUTRAL.test(char) ? undefined : scriptOf(char);
    const last = runs.at(-1);
    if (last && (script === undefined || script === last.script)) last.text += char;
    /* undefined = neutral (joins the previous run's script), null = Latin or other */
    else runs.push({ text: char, script: script === undefined ? (last?.script ?? null) : script });
  }
  return runs;
};

const BOLD_NAMES = new Set(["Helvetica-Bold", "Body-Bold", "Times-Bold", "Courier-Bold"]);
const fontName = (script, bold) => `${script ? SCRIPT_FONTS[script] : "NotoSans"}${bold ? "-Bold" : ""}`;

const REGISTERED = new Set(["NotoSans", ...Object.values(SCRIPT_FONTS)].flatMap(family => [family, `${family}-Bold`]));

/* Draw one run; if a font's shaping tables trip the layout engine, draw it unshaped
   rather than failing the whole document */
const drawRun = (drawText, doc, args) => {
  try {
    return drawText(...args);
  } catch {
    const [text, ...rest] = args;
    const options = rest.find(arg => arg && typeof arg === "object") ?? {};
    const position = rest.filter(arg => typeof arg === "number");
    return drawText(text, ...position, { ...options, features: [] });
  }
};

export const useUnicodeFonts = doc => {
  doc.registerFont("NotoSans", fontFile("NotoSans", false));
  doc.registerFont("NotoSans-Bold", fontFile("NotoSans", true));
  for (const family of Object.values(SCRIPT_FONTS)) {
    doc.registerFont(family, fontFile(family, false));
    doc.registerFont(`${family}-Bold`, fontFile(family, true));
  }

  const setFont = doc.font.bind(doc);
  let bold = false;
  /* Standard names (what drawing code uses) map to Noto; registered names pass through */
  doc.font = (name, ...rest) => {
    if (typeof name === "string" && !REGISTERED.has(name)) {
      bold = BOLD_NAMES.has(name);
      return setFont(fontName(null, bold), ...rest);
    }
    return setFont(name, ...rest);
  };

  const drawText = doc.text.bind(doc);
  doc.text = (text, ...args) => {
    const value = text === null || text === undefined ? "" : String(text);
    if (!NON_LATIN.test(value)) return drawText(value, ...args);

    /* Split into script runs, drawn one after another on the same line */
    const optionsAt = args.findIndex(arg => arg && typeof arg === "object");
    const options = optionsAt >= 0 ? args[optionsAt] : {};
    const position = args.filter(arg => typeof arg === "number");
    const runs = scriptRuns(value);
    runs.forEach((run, index) => {
      const last = index === runs.length - 1;
      setFont(fontName(run.script, bold));
      const runOptions = last ? options : { ...options, continued: true };
      if (index === 0) drawRun(drawText, doc, [run.text, ...position, runOptions]);
      else drawRun(drawText, doc, [run.text, runOptions]);
    });
    return setFont(fontName(null, bold));
  };

  doc.font("Helvetica");
  return doc;
};
