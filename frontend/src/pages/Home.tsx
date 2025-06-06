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
