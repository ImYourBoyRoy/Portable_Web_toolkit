import http from 'node:http';

const port = Number.parseInt(process.env.PORT ?? '', 10);
if (!Number.isInteger(port) || port < 1) throw new Error('PORT must be a positive integer');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html lang="en"><title>Fixture</title><body><main>Ready</main></body></html>');
});

server.listen(port, '127.0.0.1');
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
