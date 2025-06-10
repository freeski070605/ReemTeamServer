import  express from 'express';
import { getAllTables, getTableById, createTable, joinTable, leaveTable } from '../controllers/tableController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/tables
// @desc    Get all tables
// @access  Private
router.get('/', auth, getAllTables);

// @route   GET /api/tables/:id
// @desc    Get table by ID
// @access  Private
router.get('/:id', auth, getTableById);

// @route   POST /api/tables
// @desc    Create a new table
// @access  Private
router.post('/', auth, createTable);

// @route   POST /api/tables/:id/join
// @desc    Join a table
// @access  Private
router.post('/:id/join', auth, joinTable);

// @route   POST /api/tables/:id/leave
// @desc    Leave a table
// @access  Private
router.post('/:id/leave', auth, leaveTable);

export default router;
 