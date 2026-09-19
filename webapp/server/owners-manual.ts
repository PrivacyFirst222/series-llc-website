import { createHash } from 'node:crypto';
import ownersManualMd from '../../docs/owners-manual.md';
import { getDb } from './db';
import { deleteFile, putFile } from './storage';

type Publication = { published: boolean; pages?: number; edition?: string; pinned?: boolean };
type Current = { storage_key: string; meta: { hash?: string; pinned?: boolean } | string | null };
let automatic: Promise<Publication> | undefined;

/** An uploaded replacement is pinned. Automatic publication never replaces it. */
export async function ensureOwnersManual(): Promise<Publication> {
  const db = await getDb();
  const current = await db.query("SELECT key FROM library_documents WHERE key = 'owners-manual'");
  return current.length ? { published: false } : refreshOwnersManual();
}
export function refreshOwnersManual(force = false): Promise<Publication> {
  if (force) return publish(true);
  if (!automatic) automatic = publish(false).finally(() => { automatic = undefined; });
  return automatic;
}
async function publish(force: boolean): Promise<Publication> {
  const db = await getDb();
  const [current] = await db.query<Current>("SELECT storage_key, meta FROM library_documents WHERE key = 'owners-manual'");
  const meta = typeof current?.meta === 'string' ? JSON.parse(current.meta) as Exclude<Current['meta'], string> : current?.meta;
  if (!force && meta?.pinned) return { published: false, pinned: true };
  const { renderManualPdf, MANUAL_RENDERER_VERSION } = await import('./manual-pdf');
  const hash = createHash('sha256').update(ownersManualMd).update(`renderer:${MANUAL_RENDERER_VERSION}`).digest('hex').slice(0, 16);
  if (!force && meta?.hash === hash) return { published: false };
  const { pdf, pages, edition } = await renderManualPdf(ownersManualMd);
  const stored = await putFile('owners-manual.pdf', pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, 'application/pdf');
  let published = false;
  try {
    // A concurrent upload wins over this render. Keep the previous document
    // until publication commits and compare the copy read before rendering.
    const values = ["Series LLC Owner's Manual", edition, stored.storageKey, stored.sizeBytes, JSON.stringify({ hash, pages })];
    const changed = current
      ? await db.query(`UPDATE library_documents SET title=$1, edition=$2, storage_key=$3, content_type='application/pdf', size_bytes=$4, meta=$5, updated_at=now()
          WHERE key='owners-manual' AND storage_key=$6 RETURNING key`, [...values, current.storage_key])
      : await db.query(`INSERT INTO library_documents(key,title,edition,storage_key,content_type,size_bytes,meta,updated_at)
          VALUES('owners-manual',$1,$2,$3,'application/pdf',$4,$5,now()) ON CONFLICT(key) DO NOTHING RETURNING key`, values);
    published = changed.length > 0;
    if (!published && force) throw new Error('The manual changed during generation. Review the current copy and try again.');
  } finally {
    if (!published) await deleteFile(stored.storageKey);
  }
  // An already-started download may still be reading the previous copy.
  return { published, ...(published ? { pages, edition } : {}) };
}
