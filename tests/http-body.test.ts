import { describe, expect, it } from 'vitest';
import { readLimitedRequestText } from '../src/domain/http-body';

describe('bounded HTTP body', () => {
  it('cancels a stream above the limit without Content-Length', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
    const request = new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readLimitedRequestText(request, 2048)).rejects.toThrow('zbyt duże');
    expect(cancelled).toBe(true);
  });
  it('counts UTF-8 bytes and accepts an ordinary small body', async () => {
    expect(await readLimitedRequestText(new Request('http://localhost', { method: 'POST', body: '{"x":"ą"}' }), 20)).toBe('{"x":"ą"}');
    await expect(readLimitedRequestText(new Request('http://localhost', { method: 'POST', body: 'ąąą' }), 5)).rejects.toThrow('zbyt duże');
  });
});
