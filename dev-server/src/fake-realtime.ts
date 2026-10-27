import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';

// Short-lived credentials exist only in memory; neither audio nor transcript is persisted.
const grants = new Map<string, number>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function issueFakeRealtimeGrant(seconds = 600): { clientSecret: string; expiresAt: number } {
  const now = Date.now();
  for (const [key, expiry] of grants) if (expiry <= now) grants.delete(key);
  const clientSecret = randomBytes(32).toString('base64url');
  const expiresAt = Math.floor(now / 1000) + seconds;
  grants.set(hash(clientSecret), expiresAt * 1000);
  return { clientSecret, expiresAt };
}
/** A local transcription-only fake. It never connects to an external provider. */
export function attachFakeRealtime(server: Server, options: { path?: string; lines?: string[] } = {}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, handleProtocols: protocols => protocols.has('realtime') ? 'realtime' : false });
  const path = options.path || '/fake-realtime';
  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url || '/', 'http://localhost').pathname !== path) { socket.destroy(); return; }
    const protocols = String(request.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim());
    const token = protocols.find(value => value.startsWith('openai-insecure-api-key.'))?.slice('openai-insecure-api-key.'.length);
    const expiry = token ? grants.get(hash(token)) : undefined;
    if (!token || !expiry || expiry <= Date.now()) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', ws => {
    let turn = 0;
    let receivedAudio = false;
    const lines = options.lines?.length ? options.lines : ['I check the delivery queue each morning.', 'Priya owns the carrier credentials.'];
    ws.send(JSON.stringify({ type: 'session.created', session: { type: 'transcription' } }));
    ws.on('message', data => {
      try {
        const event: unknown = JSON.parse(data.toString());
        if (!event || typeof event !== 'object') return;
        const message = event as Record<string, unknown>;
        if (message.type === 'session.update') ws.send(JSON.stringify({ type: 'session.updated' }));
        if (message.type === 'input_audio_buffer.append' && typeof message.audio === 'string') receivedAudio = true;
        if (message.type === 'input_audio_buffer.commit' && receivedAudio) {
          receivedAudio = false;
          const item_id = `fake-item-${++turn}`;
          const transcript = lines[(turn - 1) % lines.length]!;
          ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id }));
          for (const word of transcript.split(' ')) ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id, delta: `${word} ` }));
          ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript }));
        }
      } catch { ws.send(JSON.stringify({ type: 'error', error: { code: 'INVALID_MESSAGE' } })); }
    });
  });
  return wss;
}
