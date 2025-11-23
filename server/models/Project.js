const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        default: 'ACTIVE'
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    }
}, {
    timestamps: true
});

const Project = mongoose.model('Project', ProjectSchema);

module.exports = Project;
