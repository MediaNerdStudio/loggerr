import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylist } from '../server/stream-url.js';

test('parses a plain M3U stream URL', () => {
  assert.equal(parsePlaylist('#EXTM3U\nhttp://radio.example/live\n', 'https://radio.example/listen.m3u'), 'http://radio.example/live');
});

test('resolves relative M3U entries', () => {
  assert.equal(parsePlaylist('../live.mp3\n', 'https://radio.example/playlists/listen.m3u'), 'https://radio.example/live.mp3');
});

test('parses a PLS File entry', () => {
  const content = '[playlist]\nNumberOfEntries=1\nFile1=https://radio.example/live\nTitle1=Radio\nLength1=-1\nVersion=2';
  assert.equal(parsePlaylist(content, 'https://radio.example/listen.pls'), 'https://radio.example/live');
});

test('rejects an empty playlist', () => {
  assert.throws(() => parsePlaylist('#EXTM3U\n', 'https://radio.example/listen.m3u'), /does not contain/);
});
