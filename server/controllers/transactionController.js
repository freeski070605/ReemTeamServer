import  User from '../models/User.js';
import Transaction from '../models/Transaction.js';

// Get user transactions
export const getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
      
    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Process deposit
export const processDeposit = async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount,
      paymentMethod: paymentMethod || 'cashapp',
      status: 'pending',
      reference: `DEP-${Date.now()}`
    });
    
    await transaction.save();
    
    // In a real app, we would integrate with CashApp API here
    // For demo purposes, we'll mark it as completed immediately
    transaction.status = 'completed';
    await transaction.save();
    
    // Update user balance
    const user = await User.findById(req.user.id);
    user.chips += amount;
    await user.save();
    
    res.json({
      transaction,
      newBalance: user.chips
    });
  } catch (error) {
    console.error('Process deposit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Process withdrawal
export const processWithdrawal = async (req, res) => {
  try {
    const { amount, cashAppId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    
    if (!cashAppId) {
      return res.status(400).json({ message: 'CashApp ID is required' });
    }
    
    // Check user balance
    const user = await User.findById(req.user.id);
    
    if (user.chips < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      type: 'withdrawal',
      amount,
      paymentMethod: 'cashapp',
      status: 'pending',
      reference: `WDR-${Date.now()}`
    });
    
    await transaction.save();
    
    // In a real app, we would integrate with CashApp API here
    // For demo purposes, we'll mark it as completed immediately
    transaction.status = 'completed';
    await transaction.save();
    
    // Update user balance
    user.chips -= amount;
    
    // Save CashApp ID if user doesn't have one
    if (!user.cashAppId) {
      user.cashAppId = cashAppId;
    }
    
    await user.save();
    
    res.json({
      transaction,
      newBalance: user.chips
    });
  } catch (error) {
    console.error('Process withdrawal error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
 