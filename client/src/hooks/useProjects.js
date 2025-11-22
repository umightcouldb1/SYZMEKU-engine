import { useState, useEffect, useCallback } from 'react';
import apiClient from '../utils/api.js'; 

const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/projects');
      setProjects(response.data);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError("Failed to load projects. Check the console for API errors.");
    } finally {
      setLoading(false);
    }
  }, []);

  const addProject = useCallback((newProject) => {
    setProjects(prevProjects => [...prevProjects, newProject]);
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prevProjects => prevProjects.filter(project => project._id !== id));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refetchProjects: fetchProjects, addProject, deleteProject };
};

export default useProjects;
