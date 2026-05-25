const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');
const MAX_LEADERBOARD = 10;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeKey(name) {
  return normalizeName(name).toLowerCase();
}

function readLeaderboard() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read leaderboard:', error);
    return [];
  }
}

function writeLeaderboard(entries) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function sortLeaderboard(entries) {
  return [...entries].sort((a, b) => b.score - a.score);
}

function formatLeaderboard(entries) {
  return sortLeaderboard(entries)
    .slice(0, MAX_LEADERBOARD)
    .map((entry) => ({
      name: entry.name,
      score: entry.score,
    }));
}

function upsertScore(name, score) {
  const cleanName = normalizeName(name);
  const safeScore = Math.max(1, Math.floor(Number(score) || 0));

  if (!cleanName || safeScore <= 0) {
    throw new Error('Invalid name or score');
  }

  const entries = readLeaderboard();
  const key = normalizeKey(cleanName);
  const existingIndex = entries.findIndex((entry) => normalizeKey(entry.name) === key);

  if (existingIndex >= 0) {
    if (safeScore <= entries[existingIndex].score) {
      return { updated: false, entries: formatLeaderboard(entries) };
    }

    entries[existingIndex] = {
      name: cleanName,
      score: safeScore,
      updatedAt: new Date().toISOString(),
    };
  } else {
    entries.push({
      name: cleanName,
      score: safeScore,
      updatedAt: new Date().toISOString(),
    });
  }

  const sortedEntries = sortLeaderboard(entries);
  writeLeaderboard(sortedEntries);

  return { updated: true, entries: formatLeaderboard(sortedEntries) };
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function isSafeFilePath(filePath) {
  const resolvedPath = path.resolve(filePath);
  return resolvedPath.startsWith(path.resolve(__dirname));
}

function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const entries = formatLeaderboard(readLeaderboard());
    sendJson(res, 200, { entries });
    return;
  }

  if (pathname === '/api/score' && req.method === 'POST') {
    parseJsonBody(req)
      .then((payload) => {
        try {
          const result = upsertScore(payload.name, payload.score);
          sendJson(res, 200, result);
        } catch (error) {
          sendJson(res, 400, { error: error.message });
        }
      })
      .catch(() => {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      });

    return;
  }

  if (pathname === '/') {
    serveStaticFile(res, path.join(__dirname, 'index.html'));
    return;
  }

  const requestedPath = path.join(__dirname, pathname);

  if (!isSafeFilePath(requestedPath)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    serveStaticFile(res, requestedPath);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`Simon Color backend running on http://localhost:${PORT}`);
});
