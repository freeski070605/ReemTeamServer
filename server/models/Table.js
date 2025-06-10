import  mongoose from 'mongoose';

const tableSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  stakeAmount: {
    type: Number,
    required: true
  },
  maxPlayers: {
    type: Number,
    default: 4
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'full'],
    default: 'waiting'
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    avatar: String,
    socketId: String
  }],
  gameInProgress: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Table = mongoose.model('Table', tableSchema);

export default Table;
 