import { useState, useCallback } from 'react';
import useApi from '../utils/api';

const useProjects = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { authorizedFetch } = useApi();

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authorizedFetch('/api/projects');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch projects');
            }

            setProjects(data);
        } catch (err) {
            setError(err);
            setProjects([]);
        } finally {
            setLoading(false);
        }
    }, [authorizedFetch]);

    return { projects, loading, error, fetchProjects, setProjects };
};

export default useProjects;
