// File: client/src/hooks/useProjects.js
import { useState, useEffect, useCallback } from 'react';
// FIX: Correcting the import path to access the utility file.
import apiClient from '../utils/api.js'; 

const useProjects = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.get('/projects');
            setProjects(response.data);
        } catch (err) {
            console.error('Error fetching projects:', err.response?.data || err.message);
            setError(`Error: Failed to load projects. Check the console for API errors.`);
        } finally {
            setLoading(false);
        }
    }, []);

    const addProject = useCallback((newProject) => {
        setProjects(prevProjects => [...prevProjects, newProject]);
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    return { 
        projects, 
        loading, 
        error, 
        refetchProjects: fetchProjects, 
        addProject 
    };
};

export default useProjects;
