const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/htmlCompiler";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Schema & Model ---
const CodeSchema = new mongoose.Schema({
  encrypted: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Code = mongoose.model('Code', CodeSchema);

// --- API: Save code ---
app.post('/api/save', async (req, res) => {
  const { encrypted } = req.body;
  if (!encrypted) {
    return res.status(400).json({ error: 'No encrypted code provided' });
  }

  try {
    const newCode = new Code({ encrypted });
    const savedCode = await newCode.save();
    res.json({ id: savedCode._id });
  } catch (err) {
    console.error('❌ Save Error:', err);
    res.status(500).json({ error: 'Save failed' });
  }
});

// --- API: Get code by ID ---
app.get('/api/get/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // MongoDB ID check (24 chars hex)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const data = await Code.findById(id);
    if (!data) {
      return res.status(404).json({ error: 'Code not found' });
    }

    res.json({ encrypted: data.encrypted });
  } catch (err) {
    console.error('❌ Fetch Error:', err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// --- Static Files & Frontend Routing ---
// 1. Pehle 'public' folder ki static files check karein
app.use(express.static(path.join(__dirname, 'public')));

// 2. Agar koi file nahi milti (jaise /a1b2c3), to index.html bhej dein
// Note: Isse PathError nahi aayega kyunki hum specific syntax avoid kar rahe hain
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});