const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
    fieldName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    player1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    player2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    players: {
        type: Number,
        default: 0,
        min: 0,
        max: 2
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Field = mongoose.model('Field', fieldSchema);

module.exports = Field;