const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/expense-tracker')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Expense Schema
const expenseSchema = new mongoose.Schema({
  text: String,
  amount: Number,
  category: String,
  date: String,
  type: String
});

const Expense = mongoose.model('Expense', expenseSchema);

// ========== ROUTES ==========

// GET all expenses (with filters)
app.get('/api/expenses', async (req, res) => {
  try {
    const { search, period, category } = req.query;
    let query = {};
    
    if (search) {
      query.text = { $regex: search, $options: 'i' };
    }
    if (category && category !== 'all') {
      query.category = category;
    }
    if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.date = { $gte: weekAgo.toISOString().slice(0,10) };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      query.date = { $gte: monthAgo.toISOString().slice(0,10) };
    }
    
    const expenses = await Expense.find(query).sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new expense
app.post('/api/expenses', async (req, res) => {
  try {
    const expense = new Expense(req.body);
    await expense.save();
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update expense
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
