const playlistExtensions = new Set(['.m3u', '.pls']);

export function parsePlaylist(content, sourceUrl) {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const entry = lines.find(line => !line.startsWith('#') && !/^\[playlist\]$/i.test(line) && !/^(numberofentries|title\d+|length\d+|version)=/i.test(line));
  if (!entry) throw new Error('The stream playlist does not contain an audio URL');
  const value = entry.match(/^file\d+=(.+)$/i)?.[1]?.trim() || entry;
  try { return new URL(value, sourceUrl).href; }
  catch { throw new Error(`Invalid audio URL in stream playlist: ${value}`); }
}

export async function resolveStreamUrl(sourceUrl) {
  const extension = new URL(sourceUrl).pathname.toLowerCase().match(/\.[^.\/]+$/)?.[0];
  if (!playlistExtensions.has(extension)) return sourceUrl;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'audio/x-mpegurl, audio/x-scpls, text/plain, */*' } });
  if (!response.ok) throw new Error(`Could not load stream playlist (${response.status} ${response.statusText})`);
  return parsePlaylist(await response.text(), sourceUrl);
}
