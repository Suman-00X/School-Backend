/* Sensitive identifiers are returned with all but the last 4 characters hidden:
   "123456789012" -> "XXXXXXXX9012" */
export const maskTail = (value, visible = 4) => {
  if (!value) return value ?? null;
  const text = String(value);
  return text.length <= visible ? "X".repeat(text.length) : "X".repeat(text.length - visible) + text.slice(-visible);
};
