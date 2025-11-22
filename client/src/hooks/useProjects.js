// File: client/src/hooks/useProjects.js
import { useState, useEffect, useCallback } from 'react';
// Corrected path to point to the new location: ../utils/api.js
import { apiClient } from '../utils/api.js'; 

const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient('projects', 'GET'); 
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Failed to load projects. Check the console for API errors.');
      setProjects([]); 
    } finally {
      setIsLoading(false);
    }
  }, []); 

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]); 

  return { projects, isLoading, error, fetchProjects };
};

export default useProjects;
