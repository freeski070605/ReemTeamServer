import  express from 'express';
import { getUserGameHistory, getGameDetails } from '../controllers/gameHistoryController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/history
// @desc    Get user game history
// @access  Private
router.get('/', auth, getUserGameHistory);

// @route   GET /api/history/:id
// @desc    Get game details
// @access  Private
router.get('/:id', auth, getGameDetails);

export default router;
 