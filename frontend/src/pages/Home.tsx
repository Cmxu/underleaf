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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1>Underleaf</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          type="url"
          placeholder="Enter Git repository URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ padding: '0.5rem', minWidth: '300px' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>Open</button>
      </form>
    </div>
  );
}
