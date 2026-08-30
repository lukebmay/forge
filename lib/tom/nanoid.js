// @ts-check
/**
 * Tiny URL-safe id — Node + GJS (no npm nanoid import).
 */

export const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

const DEFAULT_SIZE = 21;

/** @returns {(size: number) => Uint8Array} */
function makeFill() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    return (size) => {
      const bytes = new Uint8Array(size);
      c.getRandomValues(bytes);
      return bytes;
    };
  }
  // WM-scale ids; GJS may lack Web Crypto
  return (size) => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (Math.random() * 256) | 0;
    return bytes;
  };
}

const fill = makeFill();

/**
 * @param {number} [size]
 * @returns {string}
 */
export function nanoid(size = DEFAULT_SIZE) {
  const n = size | 0;
  if (n <= 0) return "";
  const bytes = fill(n);
  let id = "";
  for (let i = 0; i < n; i++) id += URL_ALPHABET[bytes[i] & 63];
  return id;
}
