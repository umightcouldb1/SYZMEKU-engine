// File: client/src/AddProjectForm.jsx

import React, { useState } from 'react';
// Assuming you have an api.js or similar utility for the fetch logic
// If you don't have api.js, the fetch will be inline here.

// Define the base URL using the environment variable for production
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';
const API_URL = `${BASE_URL}/api/projects`; // The full, absolute URL for POSTing a new project

// IMPORTANT: This ID must match the testOwnerId used in your backend's projectRoutes.js
// If your authentication logic changes, you must update how you get the owner ID.
const testOwnerId = "66c7f020c9a0a00d5ff04fcs"; 

export default function AddProjectForm({ onProjectAdded }) {
    const [title, setTitle] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (title.trim() === "") return;

        setIsSubmitting(true);
        setError(null);

        try {
            // Send a POST request to create a new project
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title,
                    // Temporarily hardcode the owner for testing/initial setup
                    owner: testOwnerId
                }),
            });

            if (!response.ok) {
                // Attempt to get specific error details from the response
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create project on the server.');
            }

            // Clear the input and trigger a project list refresh
            setTitle("");
            if (onProjectAdded) {
                onProjectAdded();
            }

        } catch (err) {
            console.error("Error creating project:", err);
            setError(`Error: ${err.message || 'Could not connect to the API.'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <h3>+ Add a New Project</h3>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter project title"
                    disabled={isSubmitting}
                />
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Project"}
                </button>
            </form>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
}
