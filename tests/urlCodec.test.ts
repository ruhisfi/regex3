import { describe, expect, it } from 'vitest';
import { decodeState, encodeState } from '../src/state/urlCodec';
import { DEFAULT_SHARE_STATE, normalizeFlags, SAMPLE_STATE, type ShareState } from '../src/state/state';

describe('urlCodec', () => {
  it('round-trips the sample state', async () => {
    expect(await decodeState(await encodeState(SAMPLE_STATE))).toEqual(SAMPLE_STATE);
  });

  it('round-trips awkward text: unicode, emoji, newlines, base64 look-alikes', async () => {
    const state: ShareState = {
      ...DEFAULT_SHARE_STATE,
      pattern: '[\\p{L}😀]+(?<n>\\d)\\/?',
      flags: 'iu',
      flavor: 're2',
      text: 'äö 日本語 😀 \n\r\n+/= ??? >>>',
      replacement: '$1-$<n>',
      listTemplate: '$`|$\'',
      tool: 'replace',
    };
    expect(await decodeState(await encodeState(state))).toEqual(state);
  });

  it('omits default values so a default state encodes small', async () => {
    const hash = await encodeState(DEFAULT_SHARE_STATE);
    expect(hash.length).toBeLessThan(12);
    expect(await decodeState(hash)).toEqual(DEFAULT_SHARE_STATE);
  });

  it('produces only URL-safe characters', async () => {
    const hash = await encodeState({ ...SAMPLE_STATE, text: '???>>>~~~'.repeat(20) });
    expect(hash).toMatch(/^[a-z0-9]+=[A-Za-z0-9_-]+$/);
  });

  it('compresses repetitive text', async () => {
    const text = 'the quick brown fox\n'.repeat(500);
    const hash = await encodeState({ ...DEFAULT_SHARE_STATE, text });
    expect(hash.startsWith('c1=')).toBe(true);
    expect(hash.length).toBeLessThan(text.length / 10);
  });

  it('accepts a leading #', async () => {
    const hash = await encodeState(SAMPLE_STATE);
    expect(await decodeState('#' + hash)).toEqual(SAMPLE_STATE);
  });

  it('rejects garbage, empty and unknown versions', async () => {
    expect(await decodeState('')).toBeNull();
    expect(await decodeState('c1=!!!not-base64!!!')).toBeNull();
    expect(await decodeState('c1=AAAA')).toBeNull();
    expect(await decodeState('z9=abcd')).toBeNull();
    expect(await decodeState('p1=' + btoa('[1,2]'))).toBeNull();
  });

  it('ignores wrongly typed fields and normalizes flags from untrusted input', async () => {
    const payload = btoa(JSON.stringify({ p: 5, f: 'ggzi', t: 'nope', v: 'js' }));
    const state = await decodeState('p1=' + payload);
    expect(state).toEqual({ ...DEFAULT_SHARE_STATE, flags: 'gi' });
  });

  it('refuses payloads that decompress beyond the size cap', async () => {
    const big = JSON.stringify({ x: 'a'.repeat(3 * 1024 * 1024) });
    const stream = new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(await decodeState('c1=' + b64)).toBeNull();
  });
});

describe('normalizeFlags', () => {
  it('dedupes, orders, and lets v replace u', () => {
    expect(normalizeFlags('yigg')).toBe('giy');
    expect(normalizeFlags('uv')).toBe('v');
    expect(normalizeFlags('xyz')).toBe('y');
  });
});
