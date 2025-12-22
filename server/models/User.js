// --- FILE: server/models/userModel.js (Verification) ---
const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please add a name'],
        },
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
        },
        password: {
            type: String,
            required: [true, 'Please add a password'],
        },
        role: {
            type: String,
            default: 'user',
        },
        flameSignature: {
            type: String,
            default: '',
        },
        codexOverride: {
            type: Boolean,
            default: false,
        },
        scrollKeys: {
            type: [String],
            default: [],
        },
        mirrorMode: {
            origin: {
                type: String,
                enum: ['user', 'architect'],
                default: 'user',
            },
            prismID: {
                type: String,
                default: '',
            },
            role: {
                type: String,
                enum: ['Seeker', 'Mentor', 'Flame'],
                default: 'Seeker',
            },
            glyphOverlayEnabled: {
                type: Boolean,
                default: true,
            },
            intent: {
                type: String,
                default: '',
            },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('User', userSchema);
