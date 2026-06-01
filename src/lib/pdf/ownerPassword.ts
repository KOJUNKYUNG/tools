// Generates a strong, random owner password for qpdf encryption.
//
// WHY THIS EXISTS (security-critical): per the PDF spec, opening a document
// with the OWNER password grants full permissions and ignores the restriction
// bits (print/copy/modify). If we set owner == user, then the user's open
// password also authenticates as owner, so every viewer silently ignores the
// permission toggles. Generating an independent random owner password the user
// never sees means the only password they can enter authenticates as USER, so
// viewers enforce the restrictions. (This is what iLovePDF / Acrobat do.)

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const LENGTH = 40;

/** Cryptographically-random owner password, URL-base64-ish alphabet. */
export function generateOwnerPassword(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
