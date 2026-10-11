/**
 * Hashing of simulation state, for determinism checks (DESIGN.md section 0, principle 4).
 *
 * `hashState` walks plain data (numbers, strings, booleans, null, arrays,
 * typed arrays, plain objects, Maps) and returns a 32-bit FNV-1a hash of its
 * exact bits. Two runs with the same seed must produce the same hash.
 * Object keys are hashed in sorted order, Map entries in insertion order.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const scratch = new DataView(new ArrayBuffer(8));

class Hasher {
  h = FNV_OFFSET;

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 0xff), FNV_PRIME);
  }

  bytes(view: Uint8Array): void {
    for (let i = 0; i < view.length; i++) this.byte(view[i]!);
  }

  tag(t: number): void {
    this.byte(t);
  }

  f64(x: number): void {
    scratch.setFloat64(0, x, true);
    for (let i = 0; i < 8; i++) this.byte(scratch.getUint8(i));
  }

  u32(x: number): void {
    this.byte(x);
    this.byte(x >>> 8);
    this.byte(x >>> 16);
    this.byte(x >>> 24);
  }

  str(s: string): void {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c);
      this.byte(c >>> 8);
    }
  }
}

export function hashState(value: unknown): number {
  const h = new Hasher();
  walk(h, value);
  return h.h >>> 0;
}

function walk(h: Hasher, v: unknown): void {
  if (v === null) return h.tag(0);
  if (v === undefined) return h.tag(1);
  switch (typeof v) {
    case 'number':
      h.tag(2);
      return h.f64(v);
    case 'string':
      h.tag(3);
      return h.str(v);
    case 'boolean':
      return h.tag(v ? 4 : 5);
    case 'object':
      break;
    default:
      throw new Error(`hashState: ${typeof v} is not plain data`);
  }
  if (ArrayBuffer.isView(v)) {
    h.tag(6);
    h.str(v.constructor.name);
    h.u32(v.byteLength);
    return h.bytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  }
  if (Array.isArray(v)) {
    h.tag(7);
    h.u32(v.length);
    for (const item of v) walk(h, item);
    return;
  }
  if (v instanceof Map) {
    h.tag(8);
    h.u32(v.size);
    for (const [k, item] of v) {
      walk(h, k);
      walk(h, item);
    }
    return;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`hashState: ${proto?.constructor?.name ?? 'object'} instances are not plain data`);
  }
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  h.tag(9);
  h.u32(keys.length);
  for (const k of keys) {
    h.str(k);
    walk(h, obj[k]);
  }
}

/** Formats a hash the way the CLI and tests print it. */
export function hashHex(hash: number): string {
  return hash.toString(16).padStart(8, '0');
}
