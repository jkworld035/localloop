'use client';

import { useState } from 'react';
import { productPhotoUrl } from '@/lib/format';
import { supabaseBrowser } from '@/lib/supabase/browser';

const MAX = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SIDE = 1200;

/** Shrinks to at most 1200 px and re-encodes as JPEG so phones load it quickly. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Catalogue photos upload straight from the browser to storage (so large
 * photos don't pass through the server); the form then saves the list of paths.
 */
export function PhotoField({ templateId, existing }: { templateId: string; existing: string[] }) {
  const [paths, setPaths] = useState(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const added: string[] = [];
    const problems: string[] = [];
    for (const f of Array.from(files).slice(0, MAX - paths.length)) {
      if (!EXT[f.type]) {
        problems.push(`${f.name}: not a JPG, PNG or WebP`);
        continue;
      }
      const blob = await shrink(f);
      if (blob.size > MAX_BYTES) problems.push(`${f.name}: larger than 5 MB`);
      else {
        const type = blob.type || f.type;
        const path = `catalog/${templateId}/${crypto.randomUUID()}.${EXT[type] ?? 'jpg'}`;
        const { error: e } = await supabaseBrowser().storage.from('product-media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if (e) problems.push(`${f.name}: ${e.message}`);
        else added.push(path);
      }
    }
    if (files.length > MAX - paths.length) problems.push(`only ${MAX} photos per product`);
    setPaths((p) => [...p, ...added]);
    setError(problems.length ? problems.join('; ') : null);
    setBusy(false);
  };

  return (
    <fieldset className="md:col-span-2">
      <legend className="mb-2 text-ink-2">Photos — up to {MAX}, JPG/PNG/WebP under 5 MB. Square photos on a plain background look best; the first one is the cover.</legend>
      {paths.map((p) => (
        <input key={p} type="hidden" name="image_paths" value={p} />
      ))}
      <ul className="mb-3 flex flex-wrap gap-3">
        {paths.map((p, i) => (
          <li key={p} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productPhotoUrl(p) ?? ''} alt={`Photo ${i + 1}`} className="h-28 w-28 rounded-lg border border-line object-cover" />
            <div className="mt-1 flex gap-2 text-xs">
              {i > 0 && (
                <button type="button" className="text-forest hover:underline" onClick={() => setPaths((ps) => [p, ...ps.filter((x) => x !== p)])}>
                  Make cover
                </button>
              )}
              <button type="button" className="text-bad hover:underline" onClick={() => setPaths((ps) => ps.filter((x) => x !== p))}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {paths.length < MAX && (
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
          className="text-sm"
          aria-label="Add photos"
        />
      )}
      {busy && <p className="mt-2 text-ink-2" role="status">Uploading…</p>}
      {error && (
        <p className="mt-2 text-bad" role="alert">
          {error}
        </p>
      )}
      {paths.join() !== existing.join() && <p className="mt-2 text-warn">Photos changed — press Save to keep them.</p>}
    </fieldset>
  );
}
