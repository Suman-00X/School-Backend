import { z } from "zod";

/* Readable, predicate-style messages: "<field> is required", "<field> must be ..." */
const describe = iss => {
  switch (iss.code) {
    case "invalid_type":
      return iss.input === undefined || iss.input === null ? "is required" : `must be a ${iss.expected}`;
    case "too_small":
      if (iss.origin === "string") return iss.minimum === 1 ? "must not be empty" : `must be at least ${iss.minimum} characters`;
      if (iss.origin === "array") return `must contain at least ${iss.minimum} item(s)`;
      return `must be ${iss.inclusive ? "at least" : "greater than"} ${iss.minimum}`;
    case "too_big":
      if (iss.origin === "string") return `must be at most ${iss.maximum} characters`;
      if (iss.origin === "array") return `must contain at most ${iss.maximum} item(s)`;
      return `must be ${iss.inclusive ? "at most" : "less than"} ${iss.maximum}`;
    case "invalid_format":
      if (iss.format === "date") return "must be a valid date (YYYY-MM-DD)";
      if (iss.format === "uuid") return "must be a valid id";
      return `must be a valid ${iss.format}`;
    case "invalid_value":
      return `must be one of: ${iss.values.join(", ")}`;
    case "invalid_union":
      return "does not match any accepted shape";
    default:
      return undefined;
  }
};

z.config({ customError: describe });

export { z };
