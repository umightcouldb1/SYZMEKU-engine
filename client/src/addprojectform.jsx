import React, { useState } from 'react';
import useApi from './utils/api';
import useProjects from './hooks/useProjects'; // To refresh list after adding

const AddProjectForm = () => {
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState('');
    const [message, setMessage] = useState('');
    const { authorizedFetch } = useApi();
    const { fetchProjects } = useProjects(); // Use the hook to trigger list refresh

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('Processing...');

        try {
            const response = await authorizedFetch('/api/projects', {
                method: 'POST',
                body: JSON.stringify({ title, status: status || 'ACTIVE' }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create project.');
            }

            setTitle('');
            setStatus('');
            setMessage('Project successfully added to the log.');
            
            // Trigger a refresh of the project list immediately
            fetchProjects();

        } catch (err) {
            setMessage(`ERROR: ${err.message}`);
        }
    };

    return (
        <div className="add-project-form-container">
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="ENTER PROJECT TITLE / CODE"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />
                
                <button type="submit">
                    COMMIT PROJECT
                </button>
            </form>
            {message && <div className="form-message">{message}</div>}
        </div>
    );
};

export default AddProjectForm;
