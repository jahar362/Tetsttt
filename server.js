require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to your .env file.');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Seed the admin account from .env so it exists on first run without registering.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(process.env.ADMIN_EMAIL, hash);
    console.log(`Seeded admin account: ${process.env.ADMIN_EMAIL}`);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ---------- Page routes ----------
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ---------- Auth API ----------
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hash);

  req.session.userId = info.lastInsertRowid;
  req.session.email = email;
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  req.session.email = user.email;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ email: req.session.email });
});

// ---------- Expenses API ----------
app.get('/api/expenses', requireAuth, (req, res) => {
  const expenses = db.prepare(
    'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC'
  ).all(req.session.userId);
  res.json(expenses);
});

app.post('/api/expenses', requireAuth, (req, res) => {
  const { description, amount, category, date } = req.body;
  if (!description || amount === undefined || !category || !date) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const info = db.prepare(
    'INSERT INTO expenses (user_id, description, amount, category, date) VALUES (?, ?, ?, ?, ?)'
  ).run(req.session.userId, description, numAmount, category, date);

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.json(expense);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense || expense.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Expense Tracker running at http://localhost:${PORT}`);
});
