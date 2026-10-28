import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import request from 'supertest';

// supertest's request(server) calls server.listen(0) per request, binding the wildcard `::`;
// on macOS that succeeds even if another process holds 127.0.0.1:<same port>, so the request can
// reach a foreign listener (IntelliJ's built-in server answers 404). Listen once, on loopback.
const urls = new WeakMap<INestApplication, string>();

export async function startApp(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  urls.set(app, url);
  return url;
}

export function http(app: INestApplication): ReturnType<typeof request> {
  const url = urls.get(app);
  if (!url) throw new Error('http(app): call startApp(app) first');
  return request(url);
}
