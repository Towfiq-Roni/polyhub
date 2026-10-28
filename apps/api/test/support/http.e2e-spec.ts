import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as nodeHttp from 'http';
import { AddressInfo } from 'net';
import { http, startApp } from './http';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return 'pong';
  }
}

async function newApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ controllers: [PingController] }).compile();
  return mod.createNestApplication();
}

const portOf = (app: INestApplication) => (app.getHttpServer().address() as AddressInfo).port;

describe('[F-27] [E2E-HARNESS] loopback-bound supertest helper', () => {
  const apps: INestApplication[] = [];
  let decoy: nodeHttp.Server;
  let decoyPort: number;
  let decoyHits = 0;

  beforeAll(async () => {
    decoy = nodeHttp.createServer((_req, res) => {
      decoyHits += 1;
      res.statusCode = 404;
      res.setHeader('x-decoy', '1');
      res.end('DECOY');
    });
    await new Promise<void>((resolve) => decoy.listen(0, '127.0.0.1', resolve));
    decoyPort = (decoy.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await new Promise<void>((resolve) => decoy.close(() => resolve()));
  });

  it('H1 binds IPv4 loopback only and serves requests', async () => {
    const app = await newApp();
    apps.push(app);
    const url = await startApp(app);
    expect((app.getHttpServer().address() as AddressInfo).address).toBe('127.0.0.1');
    expect(url).toBe(`http://127.0.0.1:${portOf(app)}`);
    const res = await http(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe('pong');
  });

  // H2 proves new behaviour only: apps get distinct loopback ports. The decoy
  // assertions are a sanity check (decoy is on a random port, so they cannot
  // fail). Old-pattern/wildcard capture is held only by H1 (bind address) and
  // the ESLint no-restricted-syntax rule (DEC-116).
  it('H2 apps get distinct loopback ports, none equal to a loopback decoy port', async () => {
    const first = await newApp();
    const second = await newApp();
    apps.push(first, second);
    const firstUrl = await startApp(first);
    await startApp(second);
    expect(portOf(first)).not.toBe(decoyPort);
    expect(portOf(second)).not.toBe(decoyPort);
    expect(portOf(second)).not.toBe(portOf(first));
    expect(new URL(firstUrl).hostname).toBe('127.0.0.1');
    const res = await http(first).get('/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe('pong');
    expect(res.headers['x-decoy']).toBeUndefined();
    expect((await http(second).get('/ping')).text).toBe('pong');
    expect(decoyHits).toBe(0);
  });

  it('H3 http() before startApp throws', async () => {
    const app = await newApp();
    expect(() => http(app)).toThrow(/startApp/);
  });
});
