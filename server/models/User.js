// File: server/models/User.js

const { Schema, model } = require('mongoose');
// FIX: Use 'bcryptjs' instead of 'bcrypt' to avoid native dependency errors
const bcrypt = require('bcryptjs'); 

// Schema definition
const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            match: [/.+@.+\..+/, 'Must match an email address!'],
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },
        projects: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Project',
            },
        ],
    },
    {
        toJSON: {
            virtuals: true,
        },
        id: false,
    }
);

// Pre-save middleware to create password hash
userSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('password')) {
        const saltRounds = 10;
        this.password = await bcrypt.hash(this.password, saltRounds);
    }

    next();
});

// Method to compare the password hash
userSchema.methods.isCorrectPassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

const User = model('User', userSchema);

module.exports = User;
