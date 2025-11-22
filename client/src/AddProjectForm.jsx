// File: client/src/AddProjectForm.jsx
import React, { useState } from 'react';
// FIX: Ensure this path is correct relative to client/src/
import apiClient from './utils/api.js'; 

// IMPORTANT: This ID must match the testOwnerId used in your backend's projectRoutes.js
// If your authentication logic changes, you must update how you get the owner ID.
const testOwnerId = "60c72b2f9c8d4a0015f8b4c5"; 

const AddProjectForm = ({ onProjectAdded }) => {
    const [title, setTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            // Send a POST request to create a new project
            const response = await apiClient.post('/projects', { 
                title, 
                owner: testOwnerId // Use the hardcoded owner ID for testing
            });
            
            const newProject = response.data;

            // Call the callback function passed from the parent component (App.jsx)
            if (onProjectAdded) {
                onProjectAdded(newProject);
            }

            setTitle(''); // Clear the input field

        } catch (err) {
            console.error('Error creating project:', err.response?.data || err.message);
            setError(`Failed to create project: ${err.response?.data?.message || 'Server error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="add-project-form">
            <h3>+ Add a New Project</h3>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Enter project title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isSubmitting}
                />
                <button type="submit" disabled={isSubmitting || !title.trim()}>
                    {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
            </form>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        </div>
    );
};

export default AddProjectForm;
