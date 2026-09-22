import crypto from 'node:crypto';
import { getDb, id, save } from './store.js';

function hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

export function createIngestToken(name, feedIds = []) {
  const token = `lgr_${crypto.randomBytes(32).toString('base64url')}`;
  const entry = { id: id(), name: String(name || '').trim() || 'Ingest client', tokenHash: hash(token), feedIds: Array.isArray(feedIds) ? feedIds.map(String) : [], createdAt: new Date().toISOString(), lastUsedAt: null };
  getDb().ingestTokens.push(entry); save();
  return { ...entry, tokenHash: undefined, token };
}

export function listIngestTokens() { return getDb().ingestTokens.map(({ tokenHash: _tokenHash, ...entry }) => entry); }
export function revokeIngestToken(tokenId) { const before = getDb().ingestTokens.length; getDb().ingestTokens = getDb().ingestTokens.filter(token => token.id !== tokenId); if (getDb().ingestTokens.length !== before) save(); return getDb().ingestTokens.length !== before; }
export function authenticateIngest(value, feedId) {
  const raw = String(value || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!raw) return null;
  const digest = hash(raw);
  const token = getDb().ingestTokens.find(entry => { const left = Buffer.from(entry.tokenHash, 'hex'); const right = Buffer.from(digest, 'hex'); return left.length === right.length && crypto.timingSafeEqual(left, right); });
  if (!token || feedId && token.feedIds.length && !token.feedIds.includes(feedId)) return null;
  const now = Date.now(); if (!token.lastUsedAt || now - new Date(token.lastUsedAt).getTime() > 60_000) { token.lastUsedAt = new Date(now).toISOString(); save(); }
  return token;
}
