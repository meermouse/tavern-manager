import type { OpenAiImageConfig } from '../config.js';
import type { ImageReference } from './scene.js';

export interface GeneratedImage {
  data: Uint8Array;
  contentType: string;
}

/** Paints one picture from a prompt and reference images (character renders). */
export interface ImageGenerator {
  generate(input: { prompt: string; references: ImageReference[] }): Promise<GeneratedImage>;
}

type FetchLike = typeof fetch;

const OPENAI = 'https://api.openai.com/v1';
const REFERENCE_TYPES = /^image\/(png|jpe?g|webp)\b/i;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
/** Landscape suits group action shots; webp keeps stored pictures small. */
const SIZE = '1536x1024';

/** Download the reference renders the image API accepts (PNG, JPEG, WebP). Ones that fail are skipped. */
export async function downloadReferences(references: ImageReference[], fetchImpl: FetchLike = fetch) {
  const out: { blob: Blob; filename: string }[] = [];
  for (const [i, ref] of references.entries()) {
    if (!/^https:\/\//i.test(ref.url)) continue;
    try {
      const res = await fetchImpl(ref.url, { signal: AbortSignal.timeout(15_000) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !REFERENCE_TYPES.test(type)) {
        console.warn(`Reference image ${ref.url} skipped (${res.status} ${type})`);
        continue;
      }
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > MAX_REFERENCE_BYTES) continue;
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      out.push({ blob: new Blob([bytes], { type: type.split(';')[0] }), filename: `character-${i + 1}.${ext}` });
    } catch (err) {
      console.warn(`Reference image ${ref.url} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/**
 * OpenAI Images API. With character renders it uses the edits endpoint, which takes them as reference images;
 * without any, a plain generation.
 */
export function createOpenAiImageGenerator(config: OpenAiImageConfig, fetchImpl: FetchLike = fetch): ImageGenerator {
  return {
    async generate({ prompt, references }) {
      const refs = await downloadReferences(references, fetchImpl);
      const common = {
        model: config.model,
        prompt,
        size: SIZE,
        quality: config.quality,
        output_format: 'webp',
        output_compression: '85',
        n: '1',
      };
      let res: Response;
      if (refs.length) {
        const form = new FormData();
        for (const [k, v] of Object.entries(common)) form.append(k, v);
        if (config.inputFidelity) form.append('input_fidelity', config.inputFidelity);
        for (const r of refs) form.append('image[]', r.blob, r.filename);
        res = await fetchImpl(`${OPENAI}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: form,
        });
      } else {
        res = await fetchImpl(`${OPENAI}/images/generations`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...common, n: 1, output_compression: 85 }),
        });
      }
      const json = (await res.json().catch(() => null)) as {
        data?: { b64_json?: string }[];
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? `Image API error (${res.status})`);
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('The image API returned no picture');
      return { data: new Uint8Array(Buffer.from(b64, 'base64')), contentType: 'image/webp' };
    },
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Local development: a parchment "sketch" naming who would be in the picture, without calling any API. */
export function createMockImageGenerator(): ImageGenerator {
  return {
    async generate({ prompt, references }) {
      const setting = /^Setting: (?:inside the dungeon )?(.*?)(?: — |, a World| \(|\.?$)/m.exec(prompt)?.[1] ?? 'Azeroth';
      const cast = [...prompt.matchAll(/^\d+\. ([^,]+), a (.*?)\.(?: |$)/gm)].map((m) => `${m[1]} — ${m[2]}`);
      const rows = cast
        .slice(0, 8)
        .map((line, i) => `<text x="80" y="${330 + i * 52}" font-size="30">${esc(line)}</text>`)
        .join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" font-family="Georgia, serif">
        <defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#f3e2bd"/><stop offset="1" stop-color="#b98e55"/></radialGradient></defs>
        <rect width="1536" height="1024" fill="url(#g)"/>
        <rect x="24" y="24" width="1488" height="976" fill="none" stroke="#5a3a16" stroke-width="6" stroke-dasharray="18 10"/>
        <text x="80" y="140" font-size="56" font-weight="700" fill="#3b2410">${esc(setting.slice(0, 60))}</text>
        <text x="80" y="210" font-size="28" fill="#6b4a22">Placeholder sketch: set OPENAI_API_KEY to paint it for real · ${references.length} reference render(s)</text>
        <g fill="#2d1b0b">${rows}</g>
      </svg>`;
      return { data: new TextEncoder().encode(svg.replace(/\s+/g, ' ')), contentType: 'image/svg+xml' };
    },
  };
}
