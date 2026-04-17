const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/expense_tracker');

// Schemas
const transactionSchema = new mongoose.Schema({
    text: String,
    amount: Number,
    category: { type: String, default: 'Other' },
    date: { type: String, default: () => new Date().toISOString().slice(0,10) },
    type: { type: String, default: 'expense' }
});

const budgetSchema = new mongoose.Schema({
    category: String,
    limit: Number,
    month: String
});

const recurringSchema = new mongoose.Schema({
    text: String,
    amount: Number,
    category: String,
    frequency: String, // 'weekly' or 'monthly'
    lastAdded: String
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Budget = mongoose.model('Budget', budgetSchema);
const Recurring = mongoose.model('Recurring', recurringSchema);

// ============ TRANSACTIONS ============
app.get('/transactions', async (req, res) => {
    let query = {};
    
    if(req.query.search) {
        query.text = { $regex: req.query.search, $options: 'i' };
    }
    if(req.query.category && req.query.category !== 'all') {
        query.category = req.query.category;
    }
    if(req.query.period === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query.date = { $gte: weekAgo.toISOString().slice(0,10) };
    }
    if(req.query.period === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query.date = { $gte: monthAgo.toISOString().slice(0,10) };
    }
    
    const transactions = await Transaction.find(query).sort({ date: -1 });
    res.json(transactions);
});

app.post('/transactions', async (req, res) => {
    const transaction = new Transaction(req.body);
    await transaction.save();
    
    // Check budget warning
    if(req.body.type === 'expense') {
        const currentMonth = new Date().toISOString().slice(0,7);
        const budget = await Budget.findOne({ category: req.body.category, month: currentMonth });
        if(budget) {
            const spent = await Transaction.aggregate([
                { $match: { category: req.body.category, type: 'expense', date: { $regex: currentMonth } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const totalSpent = (spent[0]?.total || 0) + req.body.amount;
            if(totalSpent > budget.limit) {
                return res.json({ transaction, warning: `⚠️ ${req.body.category} budget exceeded! Limit: ₹${budget.limit}` });
            }
        }
    }
    res.json(transaction);
});

app.put('/transactions/:id', async (req, res) => {
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(transaction);
});

app.delete('/transactions/:id', async (req, res) => {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
});

// ============ BUDGET ============
app.get('/budgets', async (req, res) => {
    const budgets = await Budget.find();
    res.json(budgets);
});

app.post('/budgets', async (req, res) => {
    const month = new Date().toISOString().slice(0,7);
    const budget = await Budget.findOneAndUpdate(
        { category: req.body.category, month },
        { limit: req.body.limit },
        { upsert: true, new: true }
    );
    res.json(budget);
});

app.get('/category-summary', async (req, res) => {
    const currentMonth = new Date().toISOString().slice(0,7);
    const summary = await Transaction.aggregate([
        { $match: { type: 'expense', date: { $regex: currentMonth } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
    ]);
    res.json(summary);
});

// ============ RECURRING ============
app.get('/recurring', async (req, res) => {
    const recurring = await Recurring.find();
    res.json(recurring);
});

app.post('/recurring', async (req, res) => {
    const recurring = new Recurring(req.body);
    await recurring.save();
    res.json(recurring);
});

app.delete('/recurring/:id', async (req, res) => {
    await Recurring.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
});

// Auto recurring
async function processRecurring() {
    const rules = await Recurring.find();
    const today = new Date().toISOString().slice(0,10);
    
    for(const rule of rules) {
        let shouldAdd = false;
        if(!rule.lastAdded) shouldAdd = true;
        else {
            const last = new Date(rule.lastAdded);
            if(rule.frequency === 'weekly') {
                const next = new Date(last);
                next.setDate(last.getDate() + 7);
                if(new Date(today) >= next) shouldAdd = true;
            } else if(rule.frequency === 'monthly') {
                const next = new Date(last);
                next.setMonth(last.getMonth() + 1);
                if(new Date(today) >= next) shouldAdd = true;
            }
        }
        
        if(shouldAdd) {
            await Transaction.create({
                text: rule.text,
                amount: -Math.abs(rule.amount),
                category: rule.category,
                type: 'expense',
                date: today
            });
            rule.lastAdded = today;
            await rule.save();
        }
    }
}
setInterval(processRecurring, 3600000);
processRecurring();

app.listen(5000, () => console.log('Server running on port 5000'));