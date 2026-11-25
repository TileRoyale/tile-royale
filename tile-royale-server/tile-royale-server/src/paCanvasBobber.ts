// Angler's Canvas Bobber short share codes (owner 2026-11-18).
//
// The full ACB1 design code is too long for Discord. The server keeps AT MOST ONE published Canvas
// design per player (table pa_canvas_bobbers, owner_uid PRIMARY KEY) and hands out a short code such
// as ACB-K7M4-P9Q2. Publishing a different design overwrites that player's row with a NEW code, so
// the old code stops working and rows never accumulate. There is no gallery and no design history.
//
// Every database access goes through the injected `q` (the real db.query in index.ts, an in-memory
// fake in tests/pa-canvas-bobber.test.ts), so the whole behaviour is testable without Postgres.
import crypto from 'node:crypto';

export type CanvasQuery = (sql: string, params?: any[]) => Promise<any[] | null>;

// Readable alphabet: upper-case letters and digits without the easily confused 0/O and 1/I.
export const ACB_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACB_MAX_DESIGN_CHARS = 70 * 1024;      // designData limit (70 KB)
export const ACB_PUBLISH_MIN_INTERVAL_MS = 10_000;  // a CHANGED design at most every 10 s per player
const ACB_CODE_RETRIES = 6;

export function generateCanvasShareCode(rand: (n: number) => Buffer = crypto.randomBytes): string {
  const bytes = rand(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ACB_CODE_ALPHABET[bytes[i] % ACB_CODE_ALPHABET.length];
  return 'ACB-' + s.slice(0, 4) + '-' + s.slice(4);
}

// trim + upper-case + any spaces/dashes removed, then the canonical ACB-XXXX-XXXX form, or null.
export function normalizeCanvasShareCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toUpperCase().replace(/[\s\-‐-―_]/g, '');
  const body = raw.startsWith('ACB') ? raw.slice(3) : raw;
  if (body.length !== 8) return null;
  for (const ch of body) if (!ACB_CODE_ALPHABET.includes(ch)) return null;
  return 'ACB-' + body.slice(0, 4) + '-' + body.slice(4);
}

// Only the current packed AC3 format: "AC3:" + strict base64 whose first byte is format version 1.
export function validateCanvasDesign(designData: unknown): { ok: boolean; error?: string } {
  if (typeof designData !== 'string' || !designData) return { ok: false, error: 'missing_design' };
  if (designData.length > ACB_MAX_DESIGN_CHARS) return { ok: false, error: 'design_too_large' };
  if (!designData.startsWith('AC3:')) return { ok: false, error: 'unsupported_format' };
  const b64 = designData.slice(4);
  if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: 'invalid_base64' };
  const bytes = Buffer.from(b64, 'base64');
  if (!bytes.length || bytes[0] !== 1) return { ok: false, error: 'invalid_design' };
  return { ok: true };
}

export function canvasDesignHash(designData: string): string {
  return crypto.createHash('sha256').update(designData).digest('hex');
}

export type PublishResult = { ok: boolean; shareCode?: string; unchanged?: boolean; status?: number; error?: string };

export async function publishCanvasBobber(q: CanvasQuery, uid: string, designData: unknown, opts: { now?: number; rand?: (n: number) => Buffer } = {}): Promise<PublishResult> {
  if (!uid || typeof uid !== 'string') return { ok: false, status: 401, error: 'missing_uid' };
  const v = validateCanvasDesign(designData);
  if (!v.ok) return { ok: false, status: v.error === 'design_too_large' ? 413 : 400, error: v.error || 'invalid_design' };
  const data = designData as string;
  const hash = canvasDesignHash(data);
  const now = opts.now ?? Date.now();

  const cur = await q('SELECT share_code, design_hash, updated_at FROM pa_canvas_bobbers WHERE owner_uid = $1', [uid]);
  if (cur === null) return { ok: false, status: 503, error: 'db_unavailable' };
  const row = cur[0];
  // Identical design: the existing code, no write at all.
  if (row && row.design_hash === hash) return { ok: true, shareCode: row.share_code, unchanged: true };
  // Rate limit only real changes (re-copying the same design is always free).
  if (row && row.updated_at && now - new Date(row.updated_at).getTime() < ACB_PUBLISH_MIN_INTERVAL_MS) {
    return { ok: false, status: 429, error: 'rate_limit' };
  }
  for (let attempt = 0; attempt < ACB_CODE_RETRIES; attempt++) {
    const code = generateCanvasShareCode(opts.rand);
    const taken = await q('SELECT 1 FROM pa_canvas_bobbers WHERE share_code = $1', [code]);
    if (taken === null) return { ok: false, status: 503, error: 'db_unavailable' };
    if (taken.length) continue; // astronomically rare collision: try another code
    // One row per player: the same uid always overwrites its own row with the new code and design.
    const saved = await q(
      `INSERT INTO pa_canvas_bobbers (owner_uid, share_code, design_data, design_hash, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (owner_uid) DO UPDATE
         SET share_code = EXCLUDED.share_code, design_data = EXCLUDED.design_data,
             design_hash = EXCLUDED.design_hash, updated_at = NOW()
       RETURNING share_code`,
      [uid, code, data, hash]
    );
    // null = the write failed (e.g. a share_code UNIQUE race between the check and the write):
    // retry with a fresh code. Nothing partial is ever stored by a failed statement.
    if (saved && saved[0] && saved[0].share_code === code) return { ok: true, shareCode: code, unchanged: false };
  }
  return { ok: false, status: 503, error: 'code_unavailable' };
}

export type LookupResult = { ok: boolean; designData?: string; status?: number; error?: string };

// Returns ONLY the design. Never the owner uid, name or any other account data.
export async function lookupCanvasBobber(q: CanvasQuery, shareCode: unknown): Promise<LookupResult> {
  const code = normalizeCanvasShareCode(shareCode);
  if (!code) return { ok: false, status: 400, error: 'invalid_code' };
  const rows = await q('SELECT design_data FROM pa_canvas_bobbers WHERE share_code = $1', [code]);
  if (rows === null) return { ok: false, status: 503, error: 'db_unavailable' };
  if (!rows.length) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, designData: rows[0].design_data };
}

// Light in-memory read limiter per uid (imports are rare; this only blocks scripted code guessing).
const _lookupHits = new Map<string, number[]>();
export function canvasLookupAllowed(uid: string, now = Date.now(), maxPerMinute = 30): boolean {
  const list = (_lookupHits.get(uid) || []).filter(t => now - t < 60_000);
  if (list.length >= maxPerMinute) { _lookupHits.set(uid, list); return false; }
  list.push(now);
  _lookupHits.set(uid, list);
  if (_lookupHits.size > 5000) _lookupHits.clear(); // bounded memory
  return true;
}
