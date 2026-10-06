/** Bounds allocation while consuming chunked bodies, including absent/false Content-Length. */
export async function readLimitedRequestText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('Dane formularza są zbyt duże.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('Dane formularza są zbyt duże.'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}
