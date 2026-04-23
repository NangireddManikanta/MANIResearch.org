/**
 * MANI Research Organisation — Backend Server
 * Multidisciplinary Advanced Network for Innovation
 * =========================================================
 * Stack: Node.js + Express + MongoDB Atlas + Socket.io
 * Auth:  JWT + bcrypt + Google OAuth + Firebase Phone OTP
 * =========================================================
 */

const express       = require('express');
const mongoose      = require('mongoose');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const cookieParser  = require('cookie-parser');
const session       = require('express-session');
const passport      = require('passport');
const http          = require('http');
const { Server }    = require('socket.io');
const path          = require('path');
require('dotenv').config();

// ── Route imports ──────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const researchRoutes = require('./routes/research');
const patentRoutes   = require('./routes/patents');
const socialRoutes   = require('./routes/social');
const adminRoutes    = require('./routes/admin');

// ── Passport Google OAuth config ──────────────────────────
require('./config/passport')(passport);

const app    = express();
const server = http.createServer(app);

// ── Socket.io setup ────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Expose io to routes
app.set('io', io);

// ── Security middleware ────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,   // allow media embeds
  contentSecurityPolicy: false        // configure separately if needed
}));

// ── CORS ───────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']
}));

// ── Rate limiting ──────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { message: 'Too many requests. Please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts. Please try again in 15 minutes.' }
});
app.use(globalLimiter);

// ── Body parsers ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Session (for Google OAuth) ─────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'mani-session-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Serve uploads (if local storage) ──────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MANI Research Organisation API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/patents',  patentRoutes);
app.use('/api/social',   socialRoutes);
app.use('/api/admin',    adminRoutes);

// ── Public stats endpoint (no auth required) ───────────────
app.get('/api/stats', async (req, res) => {
  try {
    const User     = require('./models/User');
    const Research = require('./models/Research');
    const Patent   = require('./models/Patent');
    const [users, papers, patents] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Research.countDocuments({ status: 'accepted' }),
      Patent.countDocuments({ status: 'published' })
    ]);
    res.json({ users, papers, patents, collaborations: 0 });
  } catch (err) {
    res.json({ users: 0, papers: 0, patents: 0, collaborations: 0 });
  }
});

// ── Socket.io realtime events ──────────────────────────────
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a room (user-specific)
  socket.on('join_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  // Join a research post room for realtime comments
  socket.on('join_post', (postId) => {
    socket.join(`post_${postId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ── 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found', path: req.originalUrl });
});

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── Database connection + server start ─────────────────────
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB Atlas connected');
  server.listen(PORT, () => {
    console.log(`🚀 MANI API running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

module.exports = { app, io };
