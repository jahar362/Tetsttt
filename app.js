require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to your .env file / Vercel project settings.');
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file / Vercel project settings.');
}

const app = express();
const COOKIE_NAME = 'token';
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 1 day

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function setAuthCookie(res, email) {
  const token = jwt.sign({ email }, process.env.SESSION_SECRET, { expiresIn: '1d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE_MS
  });
}

function getAuthedEmail(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.SESSION_SECRET).email;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const email = getAuthedEmail(req);
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  req.userEmail = email;
  next();
}

// ---------- Page routes ----------
app.get('/', (req, res) => {
  res.redirect(getAuthedEmail(req) ? '/dashboard' : '/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!getAuthedEmail(req)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ---------- Auth API ----------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  setAuthCookie(res, email);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.userEmail });
});

module.exports = app;
