import  express from 'express';
import { getUserTransactions, processDeposit, processWithdrawal } from '../controllers/transactionController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/transactions
// @desc    Get user transactions
// @access  Private
router.get('/', auth, getUserTransactions);

// @route   POST /api/transactions/deposit
// @desc    Process a deposit
// @access  Private
router.post('/deposit', auth, processDeposit);

// @route   POST /api/transactions/withdraw
// @desc    Process a withdrawal
// @access  Private
router.post('/withdraw', auth, processWithdrawal);

export default router;
 