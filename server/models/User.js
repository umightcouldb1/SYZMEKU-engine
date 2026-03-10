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
            enum: ['founder', 'admin', 'user', 'clinician', 'support'],
            default: 'user',
        },
        mfa: {
            enabled: {
                type: Boolean,
                default: false,
            },
            method: {
                type: String,
                enum: ['totp', 'sms', 'email', 'none'],
                default: 'none',
            },
            secretRef: {
                type: String,
                default: '',
            },
            recoveryCodes: {
                type: [String],
                default: [],
            },
            enrolledAt: {
                type: Date,
                default: null,
            },
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
            mirrorSeedEncrypted: {
                type: String,
                default: '',
            },
        },
        metaCodex: {
            harmonicKey: {
                type: String,
                default: '',
            },
            ketsuronStatus: {
                type: String,
                default: '',
            },
            scrollTrigger: {
                type: Boolean,
                default: false,
            },
        },
        onboarding: {
            completed: {
                type: Boolean,
                default: false,
            },
            completedAt: {
                type: Date,
                default: null,
            },
            profile: {
                preferredName: { type: String, default: '' },
                lifeStage: { type: String, default: '' },
                supportAreas: { type: [String], default: [] },
                mentorStyle: { type: String, default: 'gentle' },
                baseline: {
                    sleep: { type: Number, default: 0 },
                    stress: { type: Number, default: 0 },
                    energy: { type: Number, default: 0 },
                    mood: { type: String, default: '' },
                    symptoms: { type: String, default: '' },
                    focusChallenge: { type: String, default: '' },
                },
                goals: { type: [String], default: [] },
                signalSetup: { type: String, default: 'manual' },
            },
        },
        healthSync: {
            provider: { type: String, default: 'health_connect' },
            status: {
                type: String,
                enum: ['disconnected', 'pending', 'connected', 'error'],
                default: 'disconnected',
            },
            lastError: { type: String, default: '' },
            updatedAt: { type: Date, default: null },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('User', userSchema);
