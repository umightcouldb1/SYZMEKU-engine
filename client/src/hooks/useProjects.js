// File: client/src/hooks/useProjects.js

import { useState, useEffect, useCallback } from 'react';

// Define the base URL using the environment variable for production, or fallback for development.
// This requires setting VITE_API_URL in your Render client service dashboard.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';
const API_URL = `${BASE_URL}/api/projects`; // The full, absolute URL for fetching projects

export default function useProjects() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refetchFlag, setRefetchFlag] = useState(0);

    // Function to trigger a re-fetch of project data
    const refetch = useCallback(() => {
        setRefetchFlag(prev => prev + 1);
    }, []);

    // Fetch projects data
    useEffect(() => {
        const fetchProjects = async () => {
            setLoading(true);
            setError(null);
            try {
                // Use the full absolute path for the API call
                const response = await fetch(API_URL); 
                
                if (!response.ok) {
                    // Throw a specific error if the status code indicates failure
                    throw new Error(`Failed to load projects: ${response.statusText}`);
                }
                
                const data = await response.json();
                setProjects(data);
            } catch (err) {
                console.error("Error fetching projects:", err);
                setError("Error: Failed to load projects. Check the console for API errors.");
            } finally {
                setLoading(false);
            }
        };
        fetchProjects();
    }, [refetchFlag]);

    // Function to add a new project (client-side)
    // NOTE: The actual POST request logic is often in AddProjectForm.jsx, 
    // but a simpler wrapper might exist here or be called by the form.
    // For now, this hook focuses on reading data.

    return { projects, loading, error, refetch };
}
