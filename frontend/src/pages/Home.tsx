import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cloneRepo } from '../utils/api';

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      await cloneRepo(url.trim());
      // Save the URL for use in the editor
      sessionStorage.setItem('repoUrl', url.trim());
      navigate('/editor');
    } catch (err) {
      alert('Failed to clone repository');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <h1 className="home-title">Underleaf</h1>
        
        <form onSubmit={handleSubmit} className="home-form">
          <div className="input-container">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/username/repository"
              className="url-input"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              className="submit-button"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? (
                <div className="loading-spinner"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              )}
            </button>
          </div>
          
          <div className="tooltip">
            <span className="tooltip-text">
              Enter a public Git repository URL to get started
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
