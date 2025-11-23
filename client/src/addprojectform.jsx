// File: client/src/addprojectform.jsx (ALL LOWERCASE FILENAME)

import React, { useState } from 'react';

const AddProjectForm = ({ onProjectAdded }) => {
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (!title.trim()) {
            setError('Project title cannot be empty.');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // This is still a temporary bypass until Part 3 is completed
                    'Authorization': `Bearer ${localStorage.getItem('token') || 'DUMMY_TOKEN'}` 
                },
                body: JSON.stringify({ title })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to add project. Check API server logs.');
            }

            setTitle('');
            if (onProjectAdded) {
                onProjectAdded(); 
            }
        } catch (err) {
            console.error('Project submission error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter new project title..."
                disabled={loading}
            />
            <button type="submit" disabled={loading || !title.trim()}>
                {loading ? 'Transmitting...' : 'EXECUTE INPUT'}
            </button>
            {error && <p className="error-message">{error}</p>}
        </form>
    );
};

export default AddProjectForm;
