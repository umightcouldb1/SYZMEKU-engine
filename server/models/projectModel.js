const mongoose = require('mongoose');

const projectSchema = mongoose.Schema(
    {
        user: {
            // Links the project to the specific user who created it
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        title: {
            type: String,
            required: [true, 'Please add a project title'],
        },
        description: {
            type: String,
            required: false,
        },
        status: {
            type: String,
            required: true,
            default: 'todo', // e.g., todo, in-progress, done
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Project', projectSchema);
