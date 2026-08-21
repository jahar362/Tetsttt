require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to your .env file.');
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file.');
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

function requireAuth(req, res, next) {
  if (!req.session.loggedIn) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ---------- Page routes ----------
app.get('/', (req, res) => {
  res.redirect(req.session.loggedIn ? '/dashboard' : '/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.loggedIn) return res.redirect('/login');
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

  req.session.loggedIn = true;
  req.session.email = email;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.session.email });
});

// ---------- Expenses API ----------
app.get('/api/expenses', requireAuth, (req, res) => {
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all();
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
    'INSERT INTO expenses (description, amount, category, date) VALUES (?, ?, ?, ?)'
  ).run(description, numAmount, category, date);

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.json(expense);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Expense Tracker running at http://localhost:${PORT}`);
});
