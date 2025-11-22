import React, { useState, useEffect } from 'react';
import { apiFetch } from './utils/api'; // Import the new API utility

// Simple Projects Component to demonstrate fetching data
const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiFetch('/projects'); // Fetch from /api/projects
        setProjects(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setError('Failed to load projects. Check the console for API errors.');
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  if (loading) return <div className="text-center text-lg text-blue-500">Loading Projects...</div>;
  if (error) return <div className="text-center text-lg text-red-600 font-bold">{error}</div>;

  return (
    <div className="p-6">
      <h2 className="text-3xl font-extrabold text-[#5B21B6] mb-6 border-b-2 border-gray-200 pb-2">
        My Projects ({projects.length})
      </h2>
      <button 
        className="mb-6 px-6 py-2 bg-[#5B21B6] text-white font-semibold rounded-lg shadow-md hover:bg-[#4d1c9e] transition duration-300"
        onClick={() => alert('New Project Modal/Form goes here!')}
      >
        + Add New Project
      </button>
      
      <div className="space-y-4">
        {projects.length === 0 ? (
            <p className="text-gray-500">No projects found. Add one to get started!</p>
        ) : (
            projects.map(project => (
              <div key={project._id} className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white">
                <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold text-[#14B8A6]">{project.title}</h3>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        project.status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                        {project.status}
                    </span>
                </div>
                <p className="mt-2 text-gray-700">{project.description || 'No description provided.'}</p>
                <p className="mt-1 text-xs text-gray-500">
                    Owner: {project.owner ? project.owner.username : 'Unknown'} | Created: {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))
        )}
      </div>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md p-4">
        <h1 className="text-2xl font-bold text-[#5B21B6]">SYZMEKU Engine</h1>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Placeholder Sidebar Structure */}
        <div className="lg:grid lg:grid-cols-4 lg:gap-6">
          <aside className="lg:col-span-1 p-4 bg-white shadow rounded-lg mb-6 lg:mb-0">
            <h3 className="text-lg font-semibold mb-3">Navigation</h3>
            <ul className="space-y-2">
              <li className="text-[#14B8A6] font-medium">Dashboard</li>
              <li className="text-[#5B21B6] font-medium">Projects</li>
              <li>Settings</li>
            </ul>
            <button className="mt-6 w-full py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition duration-300">Log Out (Future)</button>
          </aside>
          
          {/* Main Content Area */}
          <div className="lg:col-span-3 bg-white shadow rounded-lg">
            <Projects />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
