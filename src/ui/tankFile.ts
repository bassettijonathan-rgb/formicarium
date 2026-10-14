/**
 * A kept tank as a file (U2): the save as JSON, its typed arrays in base64,
 * gzipped. Saved from one browser it loads in another.
 */
import { isTable } from '../sim/colonies';
import type { Kept } from '../worker/store';

const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;

/** Writes the save to a gzipped file for the keeper to download. */
export async function tankFile(save: Kept): Promise<Blob> {
  const json = JSON.stringify(save, (_key, value: unknown) => {
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { $typed: value.constructor.name, data: toBase64(bytes) };
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
    return value;
  });
  const gzip = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(gzip).blob();
}

/** Reads a file written by `tankFile` (a table, or one tank from before tables), or returns null when it is not one. */
export async function readTankFile(file: Blob): Promise<Kept | null> {
  try {
    const text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const save = JSON.parse(text, (_key, value: unknown) => {
      if (value && typeof value === 'object' && '$typed' in value) {
        const { $typed, data } = value as { $typed: string; data: string };
        if (!($typed in TYPED)) throw new Error(`unknown array ${$typed}`);
        const bytes = fromBase64(data);
        const Kind = TYPED[$typed as TypedName];
        return new Kind(bytes.buffer, 0, bytes.byteLength / Kind.BYTES_PER_ELEMENT);
      }
      if (value && typeof value === 'object' && '$number' in value) return Number((value as { $number: string }).$number);
      return value;
    }) as Kept | null;
    if (!save || typeof save !== 'object') return null;
    if (isTable(save)) return save.colonies.length > 0 && save.colonies.every((c) => typeof c.seed === 'number' && c.world) ? save : null;
    return typeof save.seed === 'number' && save.world ? save : null;
  } catch {
    return null;
  }
}

/** Starts the download of `blob` as `name`. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  // A fresh buffer, so typed arrays of any element size start aligned.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
