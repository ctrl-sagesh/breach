// Encodings used by the decode command and by mission data. Browser-safe (TextEncoder, atob/btoa).

export function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Throws if the input is not valid base64. */
export function fromBase64(input: string): string {
  const binary = atob(input.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function toHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Throws if the input is not an even-length hex string. */
export function fromHex(input: string): string {
  const clean = input.replace(/\s+/g, '');
  if (!/^([0-9a-f]{2})+$/i.test(clean)) throw new Error('invalid hex');
  const bytes = Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16));
  return new TextDecoder().decode(bytes);
}
