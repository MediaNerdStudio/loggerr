import net from 'node:net';

export function createTcpTriggerServer({ port, host = '0.0.0.0', handle }) {
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const command = JSON.parse(line);
          const result = handle(command);
          socket.write(`${JSON.stringify({ ok: true, ...result })}\n`);
        } catch (error) { socket.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); }
      }
    });
  });
  server.listen(port, host, () => console.log(`Loggerr TCP triggers listening on ${host}:${port}`));
  return server;
}
