const { Schema, model } = require('mongoose');

const projectSchema = new Schema({
  title: {
    type: String,
    required: 'A title is required for the project!',
    trim: true,
  },
  description: {
    type: String,
    maxlength: 280,
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'complete', 'archived'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

const Project = model('Project', projectSchema);

module.exports = Project;
