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
