const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/htmlCompiler";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Schema
const CodeSchema = new mongoose.Schema({
  encrypted: {
    type: String,
    required: true
  },
  sizeBytes: {
    type: Number,
    required: true
  },
  deviceInfo: {
    browser: String,
    platform: String,
    screen: String,
    ip: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '7d'
  }
});

const Code = mongoose.model('Code', CodeSchema);

// ────────────────────────────────────────────────
//                API ROUTES
// ────────────────────────────────────────────────

// Save new code
app.post('/api/save', async (req, res) => {
  const { encrypted, deviceInfo } = req.body;

  if (!encrypted || typeof encrypted !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing encrypted data' });
  }

  const sizeBytes = Buffer.byteLength(encrypted, 'utf8');

  if (sizeBytes > 1024 * 1024) {
    return res.status(400).json({ error: 'Project size exceeds 1 MB limit' });
  }

  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  try {
    const recentCount = await Code.countDocuments({
      'deviceInfo.ip': ip,
      createdAt: { $gte: twoHoursAgo }
    });

    if (recentCount >= 5) {
      return res.status(429).json({ error: 'Rate limit: Only 5 projects allowed per 2 hours' });
    }

    const newEntry = new Code({
      encrypted,
      sizeBytes,
      deviceInfo: {
        ...deviceInfo,
        ip
      }
    });

    const saved = await newEntry.save();
    res.json({ 
      id: saved._id.toString(),
      sizeBytes 
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// Get encrypted code by ID
app.get('/api/get/:id', async (req, res) => {
  try {
    const data = await Code.findById(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ encrypted: data.encrypted });
  } catch (err) {
    console.error('Get error:', err);
    res.status(400).json({ error: 'Invalid project ID' });
  }
});

// Cloud stats
app.get('/api/cloud-stats', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  try {
    const recentDocs = await Code.find({
      'deviceInfo.ip': ip,
      createdAt: { $gte: twoHoursAgo }
    }).select('sizeBytes');

    const count = recentDocs.length;
    const totalBytes = recentDocs.reduce((sum, doc) => sum + doc.sizeBytes, 0);

    res.json({
      recentCount: count,
      recentSizeBytes: totalBytes
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ===== VIEW ROUTE - PERFECT =====
app.get('/view/:id', async (req, res) => {
  try {
    const data = await Code.findById(req.params.id);
    if (!data) {
      return res.status(404).send('Project not found');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cloud Project</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
      </head>
      <body>
        <div id="content"></div>
        <script>
          const encrypted = ${JSON.stringify(data.encrypted)};
          const key = window.location.hash.replace('#key=', '');
          
          try {
            const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
            document.getElementById('content').innerHTML = decrypted;
          } catch(e) {
            document.getElementById('content').innerHTML = '<h2>Error: Wrong key</h2>';
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});