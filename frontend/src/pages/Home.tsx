import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cloneRepo } from '../utils/api';

export default function Home() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      await cloneRepo(url.trim());
      // Save the URL for use in the editor
      sessionStorage.setItem('repoUrl', url.trim());
      navigate('/editor');
    } catch (err) {
      alert('Failed to clone repository');
      console.error(err);
    }
  };

  return (
    <div className="home-container">
      <h1>Underleaf</h1>
      <form onSubmit={handleSubmit} className="home-form">
        <input
          type="url"
          placeholder="Enter Git repository URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ minWidth: '300px' }}
        />
        <button type="submit">Open</button>
      </form>
    </div>
  );
}
