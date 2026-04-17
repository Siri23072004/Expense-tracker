const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection - SIMPLE VERSION (no old options)
mongoose.connect('mongodb://localhost:27017/expense-tracker')
    .then(() => {
        console.log('✅ MongoDB Connected Successfully!');
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err.message);
    });

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    text: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Budget Schema
const budgetSchema = new mongoose.Schema({
    category: { type: String, required: true },
    limit: { type: Number, required: true },
    month: { type: String, default: () => new Date().toISOString().slice(0,7) }
});

const Budget = mongoose.model('Budget', budgetSchema);

// Recurring Schema
const recurringSchema = new mongoose.Schema({
    text: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    frequency: { type: String, enum: ['weekly', 'monthly'], required: true },
    active: { type: Boolean, default: true }
});

const Recurring = mongoose.model('Recurring', recurringSchema);

// ========== API ROUTES ==========

// Get all transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const { search, period, category } = req.query;
        let query = {};
        
        if (search) {
            query.text = { $regex: search, $options: 'i' };
        }
        if (category && category !== 'all') {
            query.category = category;
        }
        
        const transactions = await Transaction.find(query).sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add transaction
app.post('/api/transactions', async (req, res) => {
    try {
        const transaction = new Transaction(req.body);
        await transaction.save();
        
        // Check budget warning
        let warning = null;
        if (transaction.type === 'expense') {
            const month = transaction.date.slice(0,7);
            const budget = await Budget.findOne({ 
                category: transaction.category, 
                month: month 
            });
            
            if (budget) {
                const expenses = await Transaction.find({
                    category: transaction.category,
                    type: 'expense',
                    date: { $regex: `^${month}` }
                });
                const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                
                if (totalSpent > budget.limit) {
                    warning = `⚠️ Budget exceeded for ${transaction.category}! Limit: ₹${budget.limit}`;
                }
            }
        }
        
        res.status(201).json({ transaction, warning });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update transaction
app.put('/api/transactions/:id', async (req, res) => {
    try {
        const transaction = await Transaction.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(transaction);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete transaction
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Category summary
app.get('/api/category-summary', async (req, res) => {
    try {
        const currentMonth = new Date().toISOString().slice(0,7);
        const summary = await Transaction.aggregate([
            {
                $match: {
                    type: 'expense',
                    date: { $regex: `^${currentMonth}` }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: { $abs: '$amount' } }
                }
            }
        ]);
        res.json(summary);
    } catch (error) {
        res.json([]);
    }
});

// Set budget
app.post('/api/budgets', async (req, res) => {
    try {
        const { category, limit } = req.body;
        const month = new Date().toISOString().slice(0,7);
        const budget = await Budget.findOneAndUpdate(
            { category, month },
            { limit, month },
            { upsert: true, new: true }
        );
        res.json(budget);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Add recurring transaction
app.post('/api/recurring', async (req, res) => {
    try {
        const recurring = new Recurring(req.body);
        await recurring.save();
        res.status(201).json(recurring);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🐻 Expense Tracker Server running on port ${PORT}`);
    console.log(`📍 API available at http://localhost:${PORT}/api/transactions`);
});
