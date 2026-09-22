import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createTcpTriggerServer } from '../server/tcp-trigger.js';

function listen(server) { return new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve)); }
function close(server) { return new Promise(resolve => server.close(resolve)); }

test('TCP trigger handles newline-delimited JSON and returns a result', async () => {
  const commands = [];
  const server = createTcpTriggerServer({ port: 0, host: '127.0.0.1', handle: command => { commands.push(command); return { state: 'recording' }; } });
  await listen(server);
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection(server.address().port, '127.0.0.1');
    socket.setEncoding('utf8'); socket.on('error', reject); socket.on('data', data => { resolve(JSON.parse(data)); socket.end(); });
    socket.on('connect', () => socket.write('{"recordingId":"abc","action":"start"}\n'));
  });
  await close(server);
  assert.deepEqual(commands, [{ recordingId: 'abc', action: 'start' }]);
  assert.deepEqual(response, { ok: true, state: 'recording' });
});

test('TCP trigger returns JSON errors for malformed commands', async () => {
  const server = createTcpTriggerServer({ port: 0, host: '127.0.0.1', handle: () => ({}) });
  await listen(server);
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection(server.address().port, '127.0.0.1');
    socket.setEncoding('utf8'); socket.on('error', reject); socket.on('data', data => { resolve(JSON.parse(data)); socket.end(); });
    socket.on('connect', () => socket.write('not-json\n'));
  });
  await close(server);
  assert.equal(response.ok, false);
  assert.match(response.error, /JSON/);
});
