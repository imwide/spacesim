import cors from 'cors';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

type Mode = 'space' | 'interior' | 'pilot';
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type AdminItemTab = 'drone' | 'ship' | 'misc';

interface ItemThumbnailData {
  icon: AdminItemTab;
  accent: string;
  background: string;
  label: string;
}

interface AdminItemDefinition {
  id: string;
  name: string;
  tab: AdminItemTab;
  description: string;
  thumbnail: ItemThumbnailData;
}

interface InventoryItemData {
  instanceId: string;
  itemId: string;
  itemName: string;
  tab: AdminItemTab;
  quantity: number;
  thumbnail: ItemThumbnailData;
}

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

interface ShipState {
  position: Vec3;
  velocity: Vec3;
  rotation: Quat;
}

interface PlayerState {
  socketId: string;
  id: string;
  username: string;
  frameSystemId: string;
  frameOrigin: Vec3;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat;
  mode: Mode;
  insideShip: boolean;
  ship: ShipState;
  inventory: InventoryItemData[];
}

type PublicPlayerState = Omit<PlayerState, 'inventory'>;

interface AuthToken extends JwtPayload {
  userId: string;
  username: string;
}

const PORT = Number(process.env.PORT ?? 3001);
const JWT_SECRET = process.env.JWT_SECRET ?? 'spacesim-dev-secret';
const development_mode = String(process.env.DEVELOPMENT_MODE ?? 'false').toLowerCase() === 'true';
const HOME_SYSTEM_ID = 'system-1';
const PLAYER_SPAWN_SPREAD_METERS = 120;
const PLAYER_SPAWN_VERTICAL_SPREAD_METERS = 40;
const SHIP_SPAWN_OFFSET_METERS = 18;
const INVENTORY_SLOT_COUNT = 3;
const ADMIN_ITEM_CATALOG: AdminItemDefinition[] = [];
const dataDir = path.resolve(process.cwd(), 'data');
const usersFilePath = path.resolve(dataDir, 'users.json');
const serverRoot = path.resolve(__dirname, '..');
const clientDistPath = path.resolve(serverRoot, '..', 'client', 'dist');
const hasClientBuild = existsSync(clientDistPath);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

if (!existsSync(usersFilePath)) {
  writeFileSync(usersFilePath, '[]\n', 'utf8');
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const players = new Map<string, PlayerState>();

app.use(cors());
app.use(express.json());

function readUsers(): UserRecord[] {
  try {
    const raw = readFileSync(usersFilePath, 'utf8');
    const parsed = JSON.parse(raw) as UserRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: UserRecord[]): void {
  writeFileSync(usersFilePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

function createToken(user: UserRecord): string {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry));
}

function isQuat(value: unknown): value is Quat {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => Number.isFinite(entry));
}

function sanitizeVec3(value: unknown, fallback: Vec3): Vec3 {
  return isVec3(value) ? [value[0], value[1], value[2]] : fallback;
}

function sanitizeQuat(value: unknown, fallback: Quat): Quat {
  return isQuat(value) ? [value[0], value[1], value[2], value[3]] : fallback;
}

function toPublicPlayerState(player: PlayerState): PublicPlayerState {
  return {
    socketId: player.socketId,
    id: player.id,
    username: player.username,
    frameSystemId: player.frameSystemId,
    frameOrigin: player.frameOrigin,
    position: player.position,
    velocity: player.velocity,
    rotation: player.rotation,
    mode: player.mode,
    insideShip: player.insideShip,
    ship: player.ship,
  };
}

function buildInventoryItem(definition: AdminItemDefinition): InventoryItemData {
  return {
    instanceId: randomUUID(),
    itemId: definition.id,
    itemName: definition.name,
    tab: definition.tab,
    quantity: 1,
    thumbnail: definition.thumbnail,
  };
}

function broadcastSnapshot(): void {
  io.emit('world:snapshot', Array.from(players.values(), toPublicPlayerState));
}

function buildSpawnState(socketId: string, userId: string, username: string): PlayerState {
  const baseX = (Math.random() - 0.5) * PLAYER_SPAWN_SPREAD_METERS;
  const baseY = (Math.random() - 0.5) * PLAYER_SPAWN_VERTICAL_SPREAD_METERS;
  const baseZ = (Math.random() - 0.5) * PLAYER_SPAWN_SPREAD_METERS;

  return {
    socketId,
    id: userId,
    username,
    frameSystemId: HOME_SYSTEM_ID,
    frameOrigin: [0, 0, 0],
    position: [baseX, baseY, baseZ],
    velocity: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    mode: 'space',
    insideShip: false,
    ship: {
      position: [baseX + SHIP_SPAWN_OFFSET_METERS, baseY, baseZ],
      velocity: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    inventory: [],
  };
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, players: players.size, development_mode });
});

if (hasClientBuild) {
  app.use(express.static(clientDistPath));
}

app.get('/', (_request, response) => {
  if (hasClientBuild) {
    response.sendFile(path.resolve(clientDistPath, 'index.html'));
    return;
  }

  response.status(200).send(
    [
      'SpaceSim backend is running.',
      'For local development, open http://localhost:5173 after running npm run dev.',
      'For production-style local testing, run npm run build and then refresh this page.',
    ].join('\n'),
  );
});

app.post('/api/auth/register', async (request, response) => {
  const username = String(request.body?.username ?? '').trim().toLowerCase();
  const password = String(request.body?.password ?? '');

  if (username.length < 3 || password.length < 6) {
    response.status(400).json({ message: 'Username must be at least 3 chars and password at least 6 chars.' });
    return;
  }

  const users = readUsers();
  const existing = users.find((entry) => entry.username === username);

  if (existing) {
    response.status(409).json({ message: 'That username is already taken.' });
    return;
  }

  const user: UserRecord = {
    id: randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeUsers(users);

  response.status(201).json({
    token: createToken(user),
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

app.post('/api/auth/login', async (request, response) => {
  const username = String(request.body?.username ?? '').trim().toLowerCase();
  const password = String(request.body?.password ?? '');
  const users = readUsers();
  const user = users.find((entry) => entry.username === username);

  if (!user) {
    response.status(401).json({ message: 'Invalid username or password.' });
    return;
  }

  const matches = await bcrypt.compare(password, user.passwordHash);

  if (!matches) {
    response.status(401).json({ message: 'Invalid username or password.' });
    return;
  }

  response.json({
    token: createToken(user),
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  // In development mode allow unauthenticated / expired-token connections.
  if (development_mode && typeof token !== 'string') {
    socket.data.user = { userId: 'dev-guest-' + randomUUID(), username: 'DevGuest' } as AuthToken;
    next();
    return;
  }

  if (typeof token !== 'string') {
    next(new Error('Authentication required.'));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken | string;

    if (typeof decoded === 'string' || !decoded.userId || !decoded.username) {
      next(new Error('Invalid token.'));
      return;
    }

    socket.data.user = decoded;
    next();
  } catch {
    if (development_mode) {
      // Expired / invalid token in dev mode — allow anyway with a guest identity.
      socket.data.user = { userId: 'dev-guest-' + randomUUID(), username: 'DevGuest' } as AuthToken;
      next();
    } else {
      next(new Error('Invalid token.'));
    }
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user as AuthToken;
  const player = buildSpawnState(socket.id, user.userId, user.username);
  players.set(socket.id, player);

  socket.emit('world:bootstrap', {
    selfId: socket.id,
    players: Array.from(players.values(), toPublicPlayerState),
    inventory: player.inventory,
    inventorySlotCount: INVENTORY_SLOT_COUNT,
    developmentMode: development_mode,
    isAdmin: development_mode,
    adminItemCatalog: ADMIN_ITEM_CATALOG,
  });

  broadcastSnapshot();

  socket.on('state:update', (payload: Partial<PlayerState>) => {
    const current = players.get(socket.id);

    if (!current || !payload || typeof payload !== 'object') {
      return;
    }

    const nextMode = payload.mode;
    current.mode = nextMode === 'space' || nextMode === 'interior' || nextMode === 'pilot' ? nextMode : current.mode;
    current.frameSystemId = typeof payload.frameSystemId === 'string' && payload.frameSystemId ? payload.frameSystemId : current.frameSystemId;
    current.frameOrigin = sanitizeVec3(payload.frameOrigin, current.frameOrigin);
    current.insideShip = Boolean(payload.insideShip);
    current.position = sanitizeVec3(payload.position, current.position);
    current.velocity = sanitizeVec3(payload.velocity, current.velocity);
    current.rotation = sanitizeQuat(payload.rotation, current.rotation);

    if (payload.ship && typeof payload.ship === 'object') {
      current.ship = {
        position: sanitizeVec3(payload.ship.position, current.ship.position),
        velocity: sanitizeVec3(payload.ship.velocity, current.ship.velocity),
        rotation: sanitizeQuat(payload.ship.rotation, current.ship.rotation),
      };
    }

    players.set(socket.id, current);
    broadcastSnapshot();
  });

  socket.on('admin:item-grant', (payload: { itemId?: string }) => {
    const current = players.get(socket.id);

    if (!current) {
      return;
    }

    if (!development_mode) {
      socket.emit('admin:item-grant-result', {
        ok: false,
        message: 'Development mode is disabled on the server.',
      });
      return;
    }

    const itemId = typeof payload?.itemId === 'string' ? payload.itemId : '';
    const definition = ADMIN_ITEM_CATALOG.find((entry) => entry.id === itemId);

    if (!definition) {
      socket.emit('admin:item-grant-result', {
        ok: false,
        message: 'That item is not available in the admin catalog.',
      });
      return;
    }

    if (current.inventory.length >= INVENTORY_SLOT_COUNT) {
      socket.emit('admin:item-grant-result', {
        ok: false,
        message: 'Inventory full. Clear a slot before granting another item.',
      });
      return;
    }

    current.inventory = [...current.inventory, buildInventoryItem(definition)];
    players.set(socket.id, current);
    socket.emit('inventory:update', current.inventory);
    socket.emit('admin:item-grant-result', {
      ok: true,
      message: `${definition.name} added to inventory.`,
    });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    broadcastSnapshot();
  });
});

httpServer.listen(PORT, () => {
  console.log(`SpaceSim server running on http://localhost:${PORT}`);
});
