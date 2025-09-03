const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    field: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Field',
        required: true
    },
    player1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    player2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null 
    },
    player1Ships: {
        type: [[Number]], 
        default: null 
    },
    player2Ships: {
        type: [[Number]], 
        default: null 
    },
    player1Turn: {
        type: Boolean,
        default: true 
    },
    status: {
        type: String,
        enum: ['waiting', 'waiting_for_ships', 'in_progress', 'finished', 'abandoned'],
        default: 'waiting'
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null 
    },
    turnStartTime: {
        type: Date,
        default: null 
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    finishedAt: {
        type: Date,
        default: null 
    }
});

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;