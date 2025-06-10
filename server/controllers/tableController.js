import  Table from '../models/Table.js';

// Get all tables
export const getAllTables = async (req, res) => {
  try {
    const tables = await Table.find();
    
    // Format tables for client
    const formattedTables = tables.map(table => ({
      id: table._id,
      name: table.name,
      stakeAmount: table.stakeAmount,
      playerCount: table.players.length,
      maxPlayers: table.maxPlayers,
      status: table.gameInProgress ? 'active' : table.players.length === table.maxPlayers ? 'full' : 'waiting'
    }));
    
    res.json(formattedTables);
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a single table by ID
export const getTableById = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    res.json({
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
    });
  } catch (error) {
    console.error('Get table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new table
export const createTable = async (req, res) => {
  try {
    const { name, stakeAmount, maxPlayers } = req.body;
    
    const newTable = new Table({
      name,
      stakeAmount,
      maxPlayers: maxPlayers || 4
    });
    
    await newTable.save();
    
    res.status(201).json({
      id: newTable._id,
      name: newTable.name,
      stakeAmount: newTable.stakeAmount,
      playerCount: 0,
      maxPlayers: newTable.maxPlayers,
      status: 'waiting'
    });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Join a table
export const joinTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    // Check if table is full
    if (table.players.length >= table.maxPlayers) {
      return res.status(400).json({ message: 'Table is full' });
    }
    
    // Check if user is already at table
    const isAlreadyJoined = table.players.some(p => p.userId.toString() === req.user.id);
    
    if (isAlreadyJoined) {
      return res.status(400).json({ message: 'Already joined this table' });
    }
    
    // Get user info
    const user = await User.findById(req.user.id);
    
    // Check if user has enough chips
    if (user.chips < table.stakeAmount) {
      return res.status(400).json({ message: 'Insufficient chips to join this table' });
    }
    
    // Add user to table
    table.players.push({
      userId: req.user.id,
      name: user.name,
      avatar: user.avatar
    });
    
    if (table.players.length === table.maxPlayers) {
      table.status = 'full';
    }
    
    await table.save();
    
    res.json({
      id: table._id,
      name: table.name,
      stakeAmount: table.stakeAmount,
      players: table.players.map(p => ({
        id: p.userId,
        name: p.name,
        avatar: p.avatar
      })),
      maxPlayers: table.maxPlayers,
      status: table.status
    });
  } catch (error) {
    console.error('Join table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Leave a table
export const leaveTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    // Check if game is in progress
    if (table.gameInProgress) {
      return res.status(400).json({ message: 'Cannot leave while game is in progress' });
    }
    
    // Remove user from table
    table.players = table.players.filter(p => p.userId.toString() !== req.user.id);
    
    if (table.status === 'full') {
      table.status = 'waiting';
    }
    
    await table.save();
    
    res.json({ message: 'Successfully left table' });
  } catch (error) {
    console.error('Leave table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
 