require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Trust proxy for Render
app.set('trust proxy', true);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  trustProxy: process.env.NODE_ENV === 'production',
  skip: (req) => {
    // Skip rate limiting for login to prevent blocking legitimate users
    return req.path === '/api/login';
  }
});
app.use('/api/', limiter);

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    country TEXT DEFAULT 'Worldwide',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blocker_id) REFERENCES users(id),
    FOREIGN KEY (blocked_id) REFERENCES users(id),
    UNIQUE(blocker_id, blocked_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    reported_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (reported_id) REFERENCES users(id)
  )`);
}

// Online users tracking
const onlineUsers = new Map();
const matchmakingQueue = new Map();
const activeRooms = new Map();

// Helper functions
function isBlocked(userId1, userId2) {
  return new Promise((resolve) => {
    db.get(
      `SELECT * FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      [userId1, userId2, userId2, userId1],
      (err, row) => {
        resolve(!!row);
      }
    );
  });
}

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id, username, country FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, country } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const validCountries = ['Worldwide', 'Thailand', 'USA', 'UK', 'Japan', 'Korea', 'China'];
    const userCountry = validCountries.includes(country) ? country : 'Worldwide';

    db.run(
      `INSERT INTO users (username, password, country) VALUES (?, ?, ?)`,
      [username, hashedPassword, userCountry],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, userId: this.lastID });
      }
    );
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('Login attempt:', { username, hasPassword: !!password });

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.country = user.country;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session save failed' });
      }
      
      console.log('Login successful for:', username);
      console.log('Session saved:', { userId: req.session.userId, username: req.session.username });

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          country: user.country
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  console.log('/api/me - Session:', { userId: req.session.userId, username: req.session.username });
  
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      country: req.session.country
    }
  });
});

app.post('/api/block', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { blockedId } = req.body;
  if (!blockedId) {
    return res.status(400).json({ error: 'Blocked user ID is required' });
  }

  db.run(
    `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)`,
    [req.session.userId, blockedId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true });
    }
  );
});

app.post('/api/report', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { reportedId, reason } = req.body;
  if (!reportedId || !reason) {
    return res.status(400).json({ error: 'Reported user ID and reason are required' });
  }

  db.run(
    `INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)`,
    [req.session.userId, reportedId, reason],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true });
    }
  );
});

app.get('/api/online-count', (req, res) => {
  res.json({ count: onlineUsers.size });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', async (data) => {
    const { userId, username, country } = data;
    
    if (userId && username) {
      onlineUsers.set(socket.id, {
        userId,
        username,
        country,
        socketId: socket.id
      });

      socket.userId = userId;
      socket.username = username;
      socket.country = country;

      io.emit('online-count', { count: onlineUsers.size });
      console.log(`User ${username} authenticated`);
    }
  });

  socket.on('find-match', async (data) => {
    const { country } = data;
    const user = onlineUsers.get(socket.id);

    if (!user) {
      socket.emit('match-error', { error: 'Not authenticated' });
      return;
    }

    // Check if already in queue
    if (matchmakingQueue.has(socket.id)) {
      return;
    }

    // Add to queue
    matchmakingQueue.set(socket.id, {
      userId: user.userId,
      username: user.username,
      country: country || user.country,
      socketId: socket.id,
      timestamp: Date.now()
    });

    socket.emit('searching');

    // Try to find a match
    await findMatch(socket, user, country);
  });

  socket.on('cancel-search', () => {
    matchmakingQueue.delete(socket.id);
    socket.emit('search-cancelled');
  });

  // WebRTC signaling
  socket.on('join-room', (data) => {
    const { roomId } = data;
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on('webrtc-offer', (data) => {
    const { roomId, offer } = data;
    console.log(`Received offer from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit('webrtc-offer', { offer, socketId: socket.id });
  });

  socket.on('webrtc-answer', (data) => {
    const { roomId, answer } = data;
    console.log(`Received answer from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit('webrtc-answer', { answer, socketId: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    console.log(`Received ICE candidate from ${socket.id} for room ${roomId}`);
    socket.to(roomId).emit('ice-candidate', { candidate, socketId: socket.id });
  });

  socket.on('skip', () => {
    const room = activeRooms.get(socket.id);
    if (room) {
      const partnerSocketId = room.partnerSocketId;
      socket.to(partnerSocketId).emit('partner-skipped');
      leaveRoom(socket);
    }
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    
    if (user) {
      matchmakingQueue.delete(socket.id);
      
      const room = activeRooms.get(socket.id);
      if (room) {
        const partnerSocketId = room.partnerSocketId;
        socket.to(partnerSocketId).emit('partner-disconnected');
        leaveRoom(socket);
      }

      onlineUsers.delete(socket.id);
      io.emit('online-count', { count: onlineUsers.size });
      console.log(`User ${user.username} disconnected`);
    }
  });
});

async function findMatch(socket, user, preferredCountry) {
  const queue = Array.from(matchmakingQueue.entries());
  
  for (const [queueSocketId, queueUser] of queue) {
    // Skip self
    if (queueSocketId === socket.id) continue;

    // Check country filter
    if (preferredCountry && preferredCountry !== 'Worldwide') {
      if (queueUser.country !== preferredCountry) continue;
    }

    // Check if blocked
    const blocked = await isBlocked(user.userId, queueUser.userId);
    if (blocked) continue;

    // Found a match!
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Remove both from queue
    matchmakingQueue.delete(socket.id);
    matchmakingQueue.delete(queueSocketId);

    // Store room info
    activeRooms.set(socket.id, {
      roomId,
      partnerSocketId: queueSocketId,
      partnerUserId: queueUser.userId,
      partnerUsername: queueUser.username,
      partnerCountry: queueUser.country
    });

    activeRooms.set(queueSocketId, {
      roomId,
      partnerSocketId: socket.id,
      partnerUserId: user.userId,
      partnerUsername: user.username,
      partnerCountry: user.country
    });

    // Join both users to the room
    socket.join(roomId);
    io.to(queueSocketId).emit('join-room', { roomId });

    // Send match info to both users
    socket.emit('match-found', {
      roomId,
      partner: {
        id: queueUser.userId,
        username: queueUser.username,
        country: queueUser.country
      }
    });

    io.to(queueSocketId).emit('match-found', {
      roomId,
      partner: {
        id: user.userId,
        username: user.username,
        country: user.country
      }
    });

    console.log(`Matched: ${user.username} with ${queueUser.username}`);
    return;
  }

  // No match found, user stays in queue
  // Will be matched when someone else searches
}

function leaveRoom(socket) {
  const room = activeRooms.get(socket.id);
  if (room) {
    socket.leave(room.roomId);
    activeRooms.delete(socket.id);
  }
}

// 404 handler for undefined routes
app.use((req, res) => {
  console.log(`404 - Method: ${req.method}, Path: ${req.path}`);
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
