import  Game from '../models/Game.js';

// Get user game history
export const getUserGameHistory = async (req, res) => {
  try {
    // Find games where user was a player
    const games = await Game.find({
      'players.userId': req.user.id
    }).sort({ startTime: -1 });
    
    res.json(games);
  } catch (error) {
    console.error('Get game history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get game details
export const getGameDetails = async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Check if user was part of this game
    const userInGame = game.players.some(p => p.userId.toString() === req.user.id);
    
    if (!userInGame) {
      return res.status(403).json({ message: 'Not authorized to view this game' });
    }
    
    res.json(game);
  } catch (error) {
    console.error('Get game details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
 