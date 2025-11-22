// File: client/src/AddProjectForm.jsx
import React, { useState } from 'react';
import { apiClient } from './utils/api.js'; 

// IMPORTANT: This ID must match the testOwnerId used in your backend's projectRoutes.js
const TEMP_OWNER_ID = '66c7ed02f9f102c0818d0f6b'; 

const AddProjectForm = ({ onProjectAdded }) => {
    const [title, setTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);
        setError(null);

        // Prepare the data to send, including the required owner ID
        const projectData = {
            title: title,
            // FIX: Inject the temporary owner ID to satisfy the backend
            owner: TEMP_OWNER_ID 
        };

        try {
            // Send a POST request with the required projectData (title + owner ID)
            const newProject = await apiClient('projects', 'POST', projectData);
            
            // Call the callback function to update the project list
            if (onProjectAdded) {
                onProjectAdded(newProject);
            }
            setTitle(''); // Clear the form input
        } catch (err) {
            console.error('Error creating project:', err);
            // Display an error message to the user
            setError('Failed to create project. Check console for details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px 0' }}>
            <h3>➕ Add a New Project</h3>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter project title"
                    required
                    disabled={isSubmitting}
                    style={{ padding: '8px', marginRight: '10px', width: '300px' }}
                />
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
            </form>
            {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
        </div>
    );
};

export default AddProjectForm;
