const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/global-pick-trade', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Import Models
const Admin = require('./models/Admin');
const User = require('./models/User');
const Wallet = require('./models/Wallet');
const Transaction = require('./models/Transaction');
const Trade = require('./models/Trade');
const MiningOperation = require('./models/MiningOperation');

// Import Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const walletRoutes = require('./routes/wallets');
const tradingRoutes = require('./routes/trading');
const miningRoutes = require('./routes/mining');
const transactionRoutes = require('./routes/transactions');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/transactions', transactionRoutes);

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);
  
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`👥 Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Global function to emit updates
global.emitUpdate = (event, data, room = 'global') => {
  io.to(room).emit(event, data);
};

// Scheduled Tasks
cron.schedule('*/5 * * * *', async () => {
  // Update mining operations every 5 minutes
  await updateMiningOperations();
});

cron.schedule('*/1 * * * *', async () => {
  // Update trading prices and execute auto-trades
  await updateTradingPrices();
  await executeAutoTrades();
});

async function updateMiningOperations() {
  try {
    const activeMining = await MiningOperation.find({ status: 'active' });
    for (const mining of activeMining) {
      const minedAmount = calculateMiningReward(mining.coin, mining.hashrate);
      mining.minedAmount += minedAmount;
      await mining.save();
      
      // Update wallet balance
      const wallet = await Wallet.findOne({ userId: mining.userId, coin: mining.coin });
      if (wallet) {
        wallet.balance += minedAmount;
        await wallet.save();
        
        global.emitUpdate('mining-update', {
          miningId: mining._id,
          minedAmount: mining.minedAmount,
          walletBalance: wallet.balance
        }, `user-${mining.userId}`);
      }
    }
  } catch (error) {
    console.error('Mining update error:', error);
  }
}

async function updateTradingPrices() {
  try {
    const coins = ['BTC', 'ETH', 'LTC', 'XRP', 'DOGE'];
    const prices = {};
    
    for (const coin of coins) {
      prices[coin] = await fetchCryptoPrice(coin);
    }
    
    global.emitUpdate('price-update', prices);
  } catch (error) {
    console.error('Price update error:', error);
  }
}

async function executeAutoTrades() {
  try {
    const autoTrades = await Trade.find({ 
      status: 'active', 
      type: 'auto',
      'autoTrade.enabled': true 
    });
    
    for (const trade of autoTrades) {
      const currentPrice = await fetchCryptoPrice(trade.coin);
      const strategy = trade.autoTrade.strategy;
      
      let shouldTrade = false;
      let action = '';
      
      if (strategy === 'scalping') {
        shouldTrade = Math.random() > 0.7; // 30% chance to trade
        action = Math.random() > 0.5 ? 'buy' : 'sell';
      } else if (strategy === 'trend') {
        shouldTrade = currentPrice > trade.entryPrice * 1.02;
        action = 'buy';
      }
      
      if (shouldTrade) {
        await executeTrade(trade, currentPrice, action);
      }
    }
  } catch (error) {
    console.error('Auto-trade execution error:', error);
  }
}

function calculateMiningReward(coin, hashrate) {
  const baseRewards = {
    'BTC': 0.00000001,
    'ETH': 0.000001,
    'LTC': 0.0001,
    'XRP': 0.01,
    'DOGE': 1
  };
  return (baseRewards[coin] || 0.0001) * (hashrate / 100);
}

async function fetchCryptoPrice(coin) {
  // Simulated price data - replace with real API calls
  const basePrices = {
    'BTC': 45000 + Math.random() * 500,
    'ETH': 2500 + Math.random() * 100,
    'LTC': 70 + Math.random() * 5,
    'XRP': 0.5 + Math.random() * 0.1,
    'DOGE': 0.08 + Math.random() * 0.02
  };
  return basePrices[coin] || 0;
}

async function executeTrade(trade, price, action) {
  const amount = trade.amount * 0.1; // Trade 10% of position
  const profit = action === 'sell' ? (price - trade.entryPrice) * amount : 0;
  
  trade.currentPrice = price;
  trade.profit = profit;
  trade.lastTradeTime = new Date();
  await trade.save();
  
  global.emitUpdate('trade-executed', {
    tradeId: trade._id,
    action,
    price,
    profit,
    timestamp: new Date()
  }, `user-${trade.userId}`);
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(),
    owner: 'Olawale Abdul-ganiyu'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Global Pick Trade API Server',
    version: '1.0.0',
    owner: 'Olawale Abdul-ganiyu'
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Global Pick Trade Server running on port ${PORT}`);
  console.log(`👤 Owner: Olawale Abdul-ganiyu`);
});

module.exports = { app, server, io };