import { DEFAULT_SHARE_STATE, normalizeFlags, type Flavor, type ShareState, type Tool } from './state';

/** Longest decoded payload we accept, as a guard against decompression bombs. */
const MAX_DECODED_BYTES = 2 * 1024 * 1024;

/** Hashes longer than this are still valid but tend to be rejected by chat apps and servers. */
export const COMFORTABLE_HASH_LENGTH = 8000;

const COMPRESSED = 'c1=';
const PLAIN = 'p1=';

interface Wire {
  p?: string;
  f?: string;
  v?: Flavor;
  x?: string;
  r?: string;
  l?: string;
  t?: Tool;
}

const TOOLS: readonly Tool[] = ['explain', 'details', 'list', 'replace'];

function toWire(state: ShareState): Wire {
  const d = DEFAULT_SHARE_STATE;
  const wire: Wire = {};
  if (state.pattern !== d.pattern) wire.p = state.pattern;
  if (state.flags !== d.flags) wire.f = state.flags;
  if (state.flavor !== d.flavor) wire.v = state.flavor;
  if (state.text !== d.text) wire.x = state.text;
  if (state.replacement !== d.replacement) wire.r = state.replacement;
  if (state.listTemplate !== d.listTemplate) wire.l = state.listTemplate;
  if (state.tool !== d.tool) wire.t = state.tool;
  return wire;
}

/** Reads untrusted JSON into a complete state, ignoring anything of the wrong type. */
function fromWire(raw: unknown): ShareState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const d = DEFAULT_SHARE_STATE;
  const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  return {
    pattern: str(w.p, d.pattern),
    flags: normalizeFlags(str(w.f, d.flags)),
    flavor: w.v === 're2' ? 're2' : 'js',
    text: str(w.x, d.text),
    replacement: str(w.r, d.replacement),
    listTemplate: str(w.l, d.listTemplate),
    tool: TOOLS.find((t) => t === w.t) ?? d.tool,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new Error('Shared state is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const compressionAvailable = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** Returns the hash fragment (without the leading `#`) that restores `state`. */
export async function encodeState(state: ShareState): Promise<string> {
  const plainBytes = new TextEncoder().encode(JSON.stringify(toWire(state)));
  const plain = PLAIN + toBase64Url(plainBytes);
  if (!compressionAvailable) return plain;
  const compressed = COMPRESSED + toBase64Url(await pipe(plainBytes, new CompressionStream('deflate-raw')));
  return compressed.length < plain.length ? compressed : plain;
}

/** Parses a hash fragment. Returns `null` when it is empty, from an unknown version, or damaged. */
export async function decodeState(hash: string): Promise<ShareState | null> {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    let bytes: Uint8Array;
    if (fragment.startsWith(COMPRESSED)) {
      if (!compressionAvailable) return null;
      bytes = await pipe(fromBase64Url(fragment.slice(COMPRESSED.length)), new DecompressionStream('deflate-raw'));
    } else if (fragment.startsWith(PLAIN)) {
      bytes = fromBase64Url(fragment.slice(PLAIN.length));
    } else {
      return null;
    }
    return fromWire(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
