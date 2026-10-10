// yoink! server: static client, REST auth, authenticated Socket.IO realtime.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { Server } from 'socket.io';
import { openDb, flush } from './db.js';
import db from './db.js';
import { mountAuthRoutes, userFromToken, selfProfile } from './auth.js';
import { Hub } from './hub.js';
import { createServices } from './services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export async function startServer(opts = {}) {
  const port = opts.port ?? (+process.env.PORT || 3000);
  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const dbFile = opts.dbFile ?? process.env.YOINK_DB ?? path.join(ROOT, 'data', 'yoink.db');
  await openDb(dbFile);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1');
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 64 * 1024,
    cors: opts.cors ? { origin: opts.cors } : undefined,
  });
  const hub = new Hub(io);
  const services = createServices({ io, hub, db, opts });

  mountAuthRoutes(app, {
    onLogout: (userId, token) => {
      const c = hub.get(userId);
      if (c && c.token === token) {
        c.socket.emit('auth:logout', { reason: 'Logged out.' });
        c.socket.disconnect(true);
      }
    },
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, online: hub.clients.size, matches: services.matchmaking.matches.size }));

  // Static files
  const staticOpts = { maxAge: opts.dev ? 0 : '1h' };
  app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three'), staticOpts));
  app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
  app.use('/', express.static(path.join(ROOT, 'client'), { maxAge: 0 }));

  // Socket authentication: the client sends its session token in the handshake.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const user = userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    socket.data.username = user.username;
    socket.data.token = token;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) { socket.disconnect(true); return; }
    // Only one live connection per account: newest wins.
    const prev = hub.get(userId);
    if (prev) {
      prev.replaced = true;
      prev.socket.emit('auth:kicked', { reason: 'You logged in from another window or device.' });
      prev.socket.disconnect(true);
      services.onDisconnect(prev, true);
    }
    const client = {
      userId,
      username: user.username,
      token: socket.data.token,
      socket,
      partyId: null,
      matchId: null,
      queue: null,
      connectedAt: Date.now(),
    };
    hub.add(client);
    db.run('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), userId]);
    socket.emit('hello', { user: selfProfile(user), serverTime: Date.now() });
    services.onConnect(client);

    socket.on('time:ping', (t, ack) => { if (typeof ack === 'function') ack({ t, s: Date.now() }); });

    socket.on('disconnect', () => {
      if (client.replaced) return;
      hub.remove(client);
      db.run('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), userId]);
      services.onDisconnect(client, false);
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const actualPort = server.address().port;
  if (!opts.quiet) printBanner(actualPort);

  const shutdown = () => {
    try { flush(); } catch (e) { console.error(e); }
    process.exit(0);
  };
  if (!opts.noSignals) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  return {
    app, server, io, hub, services, port: actualPort,
    close: () => new Promise((resolve) => {
      services.shutdown();
      io.close();
      server.close(() => { try { flush(); } catch { /* ignore */ } resolve(); });
    }),
  };
}

function printBanner(port) {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
  console.log('\n  yoink! server is running');
  console.log(`  Local:   http://localhost:${port}`);
  for (const ip of lan) console.log(`  LAN:     http://${ip}:${port}`);
  console.log('  (Internet play needs port forwarding or a tunnel — see README.)\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer({ dev: process.env.NODE_ENV !== 'production' }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
