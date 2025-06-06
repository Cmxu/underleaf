import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // Save the URL (for now just in sessionStorage)
      sessionStorage.setItem('repoUrl', url.trim());
      navigate('/editor');
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
