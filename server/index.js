import  express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createDeck, shuffleDeck, dealCards } from '../src/utils/cards.js';

// Models
import User from './models/User.js';
import Table from './models/Table.js';
import Game from './models/Game.js';
import Transaction from './models/Transaction.js';

// Routes
import authRoutes from './routes/auth.js';
import tableRoutes from './routes/tables.js';
import transactionRoutes from './routes/transactions.js';
import historyRoutes from './routes/history.js';

// Load environment variables
dotenv.config();

// Initialize express app and server
const app = express();
const server = http.createServer(app);

// Setup CORS for both REST and Socket.IO
app.use(cors());
app.use(express.json());

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// In-memory game state (would be stored in Redis in production)
const activeGames = {};

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  const userId = socket.handshake.auth.userId;
  if (userId) {
    // Store user's socket ID
    socket.userId = userId;
  }
  
  // Join a table
  socket.on('join_table', async ({ tableId, playerData }) => {
    try {
      console.log(`Player ${playerData.name} joining table ${tableId}`);
      
      // Get table from database
      let table = await Table.findById(tableId);
      
      if (!table) {
        console.error('Table not found:', tableId);
        socket.emit('error', { message: 'Table not found' });
        return;
      }
      
      // Check if player is already in the table
      const existingPlayer = table.players.find(p => p.userId.toString() === playerData.id);
      
      if (!existingPlayer && table.players.length < table.maxPlayers) {
        // Add player to table
        table.players.push({
          userId: playerData.id,
          name: playerData.name,
          avatar: playerData.avatar,
          socketId: socket.id
        });
        
        await table.save();
        
        // Join socket room for this table
        socket.join(tableId);
        
        // Notify others that player joined
        socket.to(tableId).emit('player_joined', playerData);
      }
      
      // Send updated table info to all players
      const updatedTable = {
        id: table._id,
        name: table.name,
        stakeAmount: table.stakeAmount,
        players: table.players.map(p => ({
          id: p.userId,
          name: p.name,
          avatar: p.avatar
        })),
        maxPlayers: table.maxPlayers,
        status: table.gameInProgress ? 'active' : table.players.length === table.maxPlayers ? 'full' : 'waiting'
      };
      
      io.to(tableId).emit('table_updated', updatedTable);
    } catch (error) {
      console.error('Join table error:', error);
      socket.emit('error', { message: 'Failed to join table' });
    }
  });
  
  // Leave a table
  socket.on('leave_table', async ({ tableId }) => {
    try {
      // Get table from database
      let table = await Table.findById(tableId);
      
      if (!table) return;
      
      // Remove player from table
      const playerIndex = table.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        const player = table.players[playerIndex];
        console.log(`Player ${player.name} leaving table ${tableId}`);
        
        table.players.splice(playerIndex, 1);
        await table.save();
        
        // Notify others that player left
        socket.to(tableId).emit('player_left', { playerId: player.userId });
        
        // Leave socket room
        socket.leave(tableId);
        
        // Send updated table info to remaining players
        if (table.players.length > 0) {
          const updatedTable = {
            id: table._id,
            name: table.name,
            stakeAmount: table.stakeAmount,
            players: table.players.map(p => ({
              id: p.userId,
              name: p.name,
              avatar: p.avatar
            })),
            maxPlayers: table.maxPlayers,
            status: 'waiting'
          };
          
          io.to(tableId).emit('table_updated', updatedTable);
        }
      }
    } catch (error) {
      console.error('Leave table error:', error);
    }
  });
  
  // Start a game
  socket.on('start_game', async ({ tableId }) => {
    try {
      // Get table from database
      const table = await Table.findById(tableId);
      
      if (!table || table.gameInProgress) return;
      
      console.log(`Starting game at table ${tableId}`);
      
      // Need at least 2 players
      if (table.players.length < 2) return;
      
      // Create a new game
      const initialDeck = createDeck();
      const shuffledDeck = shuffleDeck(initialDeck);
      
      // Deal cards to players
      const { playerHands, remainingDeck } = dealCards(shuffledDeck, table.players.length);
      
      // Update player hands
      table.players.forEach((player, index) => {
        player.cards = playerHands[index];
      });
      
      // Set first player as active
      table.players[0].isActive = true;
      
      // Create initial discard pile
      const initialDiscard = remainingDeck.shift();
      
      // Calculate pot amount
      const potAmount = table.players.length * table.stakeAmount;
      
      // Create game state
      activeGames[tableId] = {
        tableId,
        status: 'playing',
        players: table.players,
        currentPlayerIndex: 0,
        deck: remainingDeck,
        discardPile: initialDiscard ? [initialDiscard] : [],
        potAmount,
        startTime: new Date()
      };
      
      // Update table status
      table.gameInProgress = true;
      await table.save();
      
      // Deduct stakes from players
      for (const player of table.players) {
        await User.findByIdAndUpdate(player.userId, {
          $inc: { chips: -table.stakeAmount }
        });
        
        // Record transaction
        await Transaction.create({
          userId: player.userId,
          type: 'game-loss',
          amount: table.stakeAmount,
          paymentMethod: 'game',
          status: 'completed',
          reference: `GAME-${tableId}`
        });
      }
      
      // Send game started event to all players
      io.to(tableId).emit('game_started', getPublicGameState(tableId));
      
      // Schedule regular game state updates
      const gameInterval = setInterval(() => {
        if (activeGames[tableId] && activeGames[tableId].status === 'playing') {
          io.to(tableId).emit('game_state_updated', getPublicGameState(tableId));
        } else {
          clearInterval(gameInterval);
        }
      }, 1000);
    } catch (error) {
      console.error('Start game error:', error);
    }
  });
  
  // Handle player actions
  socket.on('player_action', async ({ tableId, action, data }) => {
    try {
      if (!activeGames[tableId] || activeGames[tableId].status !== 'playing') return;
      
      const game = activeGames[tableId];
      const currentPlayer = game.players[game.currentPlayerIndex];
      
      // Verify it's the player's turn
      if (currentPlayer.socketId !== socket.id) return;
      
      console.log(`Player ${currentPlayer.name} action: ${action}`, data);
      
      switch (action) {
        case 'draw_deck':
          handleDrawFromDeck(tableId);
          break;
        case 'draw_discard':
          handleDrawFromDiscard(tableId);
          break;
        case 'discard':
          handleDiscard(tableId, data.cardIndex);
          break;
        case 'drop':
          handleDrop(tableId, data.cardIndices);
          break;
        case 'tonk':
          handleTonk(tableId);
          break;
      }
      
      // Send updated game state
      io.to(tableId).emit('game_state_updated', getPublicGameState(tableId));
    } catch (error) {
      console.error('Player action error:', error);
    }
  });
  
  // Chat messages
  socket.on('send_message', ({ tableId, message }) => {
    try {
      // Get table from memory or database
      const game = activeGames[tableId];
      if (!game) return;
      
      // Find player
      const player = game.players.find(p => p.socketId === socket.id);
      if (!player) return;
      
      // Broadcast message to table
      io.to(tableId).emit('receive_message', {
        playerId: player.userId,
        playerName: player.name,
        message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Send message error:', error);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log('User disconnected:', socket.id);
      
      // Find all tables with this socket
      const tables = await Table.find({ 'players.socketId': socket.id });
      
      for (const table of tables) {
        const playerIndex = table.players.findIndex(p => p.socketId === socket.id);
        
        if (playerIndex !== -1) {
          const player = table.players[playerIndex];
          console.log(`Player ${player.name} disconnected from table ${table._id}`);
          
          // If game in progress, don't remove player
          if (!table.gameInProgress) {
            table.players.splice(playerIndex, 1);
            await table.save();
            
            // Notify others that player left
            io.to(table._id.toString()).emit('player_left', { playerId: player.userId });
            
            // Send updated table info to remaining players
            if (table.players.length > 0) {
              const updatedTable = {
                id: table._id,
                name: table.name,
                stakeAmount: table.stakeAmount,
                players: table.players.map(p => ({
                  id: p.userId,
                  name: p.name,
                  avatar: p.avatar
                })),
                maxPlayers: table.maxPlayers,
                status: 'waiting'
              };
              
              io.to(table._id.toString()).emit('table_updated', updatedTable);
            }
          }
        }
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// Game action handlers
function handleDrawFromDeck(tableId) {
  const game = activeGames[tableId];
  if (!game || game.deck.length === 0) return;
  
  // Draw top card from deck
  const card = game.deck.shift();
  
  // Add to player's hand
  game.players[game.currentPlayerIndex].cards.push(card);
}

function handleDrawFromDiscard(tableId) {
  const game = activeGames[tableId];
  if (!game || game.discardPile.length === 0) return;
  
  // Draw top card from discard pile
  const card = game.discardPile.pop();
  
  // Add to player's hand
  game.players[game.currentPlayerIndex].cards.push(card);
}

function handleDiscard(tableId, cardIndex) {
  const game = activeGames[tableId];
  if (!game) return;
  
  const player = game.players[game.currentPlayerIndex];
  
  // Check if valid card index
  if (cardIndex < 0 || cardIndex >= player.cards.length) return;
  
  // Remove card from player's hand
  const card = player.cards.splice(cardIndex, 1)[0];
  
  // Add to discard pile
  game.discardPile.push(card);
  
  // Move to next player
  moveToNextPlayer(tableId);
}

function handleDrop(tableId, cardIndices) {
  const game = activeGames[tableId];
  if (!game) return;
  
  const player = game.players[game.currentPlayerIndex];
  
  // Check if valid indices
  if (!Array.isArray(cardIndices) || cardIndices.length < 3) return;
  
  // Sort indices in descending order to avoid issues when removing
  cardIndices.sort((a, b) => b - a);
  
  // Get cards to drop
  const droppedCards = cardIndices.map(index => player.cards[index]);
  
  // Check if valid drop (this is simplified - would need to implement full validation)
  const isValid = isValidDrop(droppedCards);
  
  if (isValid) {
    // Remove cards from player's hand
    cardIndices.forEach(index => {
      player.cards.splice(index, 1);
    });
    
    // Check if player has no cards left
    if (player.cards.length === 0) {
      handleGameEnd(tableId, player.userId);
    }
  }
}

function handleTonk(tableId) {
  const game = activeGames[tableId];
  if (!game) return;
  
  const player = game.players[game.currentPlayerIndex];
  
  // Check if valid tonk (hand value 50 or less)
  const handValue = calculateHandValue(player.cards);
  
  if (handValue <= 50) {
    // Player has valid Tonk
    handleGameEnd(tableId, player.userId);
  } else {
    // Invalid Tonk claim - player loses
    handleGameEnd(tableId, player.userId, true);
  }
}

function moveToNextPlayer(tableId) {
  const game = activeGames[tableId];
  if (!game) return;
  
  // Set current player as inactive
  game.players[game.currentPlayerIndex].isActive = false;
  
  // Move to next player
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  
  // Set new player as active
  game.players[game.currentPlayerIndex].isActive = true;
}

async function handleGameEnd(tableId, winnerId, invalidClaim = false) {
  try {
    const game = activeGames[tableId];
    if (!game) return;
    
    console.log(`Game ended at table ${tableId}. Winner: ${winnerId}`);
    
    // Calculate scores
    const scores = {};
    game.players.forEach(player => {
      scores[player.userId] = calculateHandValue(player.cards);
    });
    
    // Determine winner if invalid claim
    let actualWinner = winnerId;
    if (invalidClaim) {
      // Find player with lowest score
      let lowestScore = Infinity;
      game.players.forEach(player => {
        const score = scores[player.userId];
        if (score < lowestScore) {
          lowestScore = score;
          actualWinner = player.userId;
        }
      });
    }
    
    // Get table from database
    const table = await Table.findById(tableId);
    
    // Record game in database
    const gameRecord = new Game({
      tableId,
      players: game.players.map(p => ({
        userId: p.userId,
        name: p.name,
        score: scores[p.userId]
      })),
      winner: actualWinner,
      potAmount: game.potAmount,
      startTime: game.startTime,
      endTime: new Date()
    });
    
    await gameRecord.save();
    
    // Update winner balance
    await User.findByIdAndUpdate(actualWinner, {
      $inc: { chips: game.potAmount }
    });
    
    // Record winner transaction
    await Transaction.create({
      userId: actualWinner,
      type: 'game-win',
      amount: game.potAmount,
      paymentMethod: 'game',
      status: 'completed',
      reference: `GAME-${tableId}`,
      gameId: gameRecord._id
    });
    
    // Update game status
    game.status = 'ended';
    game.winner = actualWinner;
    game.scores = scores;
    
    // Reset table status
    if (table) {
      table.gameInProgress = false;
      await table.save();
    }
    
    // Notify clients
    io.to(tableId).emit('game_ended', {
      winner: actualWinner,
      scores,
      potAmount: game.potAmount
    });
  } catch (error) {
    console.error('Game end error:', error);
  }
}

// Helper functions
function getPublicGameState(tableId) {
  const game = activeGames[tableId];
  if (!game) return null;
  
  // Create a sanitized game state to send to clients
  // Hide cards except for each player's own hand
  return {
    tableId: game.tableId,
    status: game.status,
    players: game.players.map(p => ({
      id: p.userId,
      name: p.name,
      avatar: p.avatar,
      isActive: p.isActive,
      cardCount: p.cards.length
    })),
    currentPlayerIndex: game.currentPlayerIndex,
    deckCount: game.deck.length,
    discardPile: game.discardPile.length > 0 ? [game.discardPile[game.discardPile.length - 1]] : [],
    potAmount: game.potAmount
  };
}

function isValidDrop(cards) {
  // Simplified validation - would need full validation logic
  if (cards.length < 3) return false;
  
  // Check if all cards have same rank (set)
  const sameRank = cards.every(card => card.rank === cards[0].rank);
  
  // Check if cards form a run (consecutive of same suit)
  const sameSuit = cards.every(card => card.suit === cards[0].suit);
  const values = cards.map(card => card.value).sort((a, b) => a - b);
  const isSequential = values.every((val, i) => i === 0 || val === values[i - 1] + 1);
  
  return sameRank || (sameSuit && isSequential);
}

function calculateHandValue(cards) {
  return cards.reduce((total, card) => total + card.value, 0);
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/history', historyRoutes);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
 