/* Does the file content match its declared type? The browser-supplied type is
   only a claim; a file must also start with that format's signature. */

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .docx .xlsx .pptx
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc .xls .ppt

const SIGNATURES = {
  "image/jpeg": b => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": b => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": b => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  "application/pdf": b => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  "application/msword": b => startsWith(b, OLE),
  "application/vnd.ms-excel": b => startsWith(b, OLE),
  "application/vnd.ms-powerpoint": b => startsWith(b, OLE),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b => startsWith(b, ZIP),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b => startsWith(b, ZIP),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": b => startsWith(b, ZIP),
  /* Text: no NUL bytes in the first 8 KB */
  "text/plain": b => !b.subarray(0, 8192).includes(0),
  "text/csv": b => !b.subarray(0, 8192).includes(0)
};

export const matchesDeclaredType = (buffer, contentType) => SIGNATURES[contentType]?.(buffer) ?? false;
