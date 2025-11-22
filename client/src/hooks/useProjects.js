// File: client/src/hooks/useProjects.js
import { useState, useEffect, useCallback } from 'react';
// FIX: Added the .js extension to the path to resolve the build error
import { apiClient } from '../api/apiClient.js'; 

/**
 * Custom hook to fetch and manage the list of projects.
 * @returns {{ projects: Array, isLoading: boolean, error: string, fetchProjects: function }}
 */
const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize the function so it doesn't change on every render
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use your apiClient to call the GET /projects endpoint
      const data = await apiClient('projects', 'GET'); 
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      // Set a user-friendly error message
      setError('Failed to load projects. Check the console for API errors.');
      setProjects([]); // Clear projects on error
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array means this function is created once

  // Run the fetch function only once when the component first mounts
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]); // Dependency ensures we call the memoized fetchProjects

  return { projects, isLoading, error, fetchProjects };
};

export default useProjects;
