import { createSignal } from "solid-js";

// Generates a random Base64 string of length 8, for 48 bits of randomness.
// This is easier on the eyes than a UUID for debugging, but still fairly random.
// Note that this algorithm could be much faster if it were written from scratch,
// rather than cobbling together browser APIs, and of course if we were in Rust,
// we'd simply use a random 64 bit number, but unfortunately Map<u64, T> is not
// a type well-supported by automerge, so we use Record<string, T> instead.
export function generateId(): string {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return bytes.join("");
}
