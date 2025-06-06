import Editor from '@monaco-editor/react';
import FileTree from '../components/FileTree';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { compileRepo } from '../utils/api';

export default function EditorPage() {
  const navigate = useNavigate();
  const repoUrl = sessionStorage.getItem('repoUrl') || '';
  const [content, setContent] = useState('% Start writing your LaTeX here');

  const repoName = repoUrl
    ? repoUrl.split('/').pop()?.replace(/\.git$/, '') || ''
    : '';

  const handleCompile = async () => {
    if (!repoName) return;
    try {
      await compileRepo(repoName);
      alert('Compilation finished');
    } catch (err) {
      alert('Compilation failed');
      console.error(err);
    }
  };

  if (!repoUrl) {
    navigate('/');
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="app-header"
        style={{ padding: '0.5rem', background: '#f5f5f5', display: 'flex', justifyContent: 'space-between' }}
      >
        <span>Repo: {repoUrl}</span>
        <button onClick={handleCompile}>Compile</button>
      </header>
      <div style={{ flex: 1, display: 'flex' }}>
        <aside className="sidebar">
          <FileTree />
        </aside>
        <main style={{ flex: 1 }}>
          <Editor
            height="100%"
            defaultLanguage="latex"
            value={content}
            onChange={(value) => setContent(value || '')}
            options={{ minimap: { enabled: false } }}
          />
        </main>
        <section className="preview">
          <p>PDF Preview</p>
          {/* TODO: render PDF preview */}
        </section>
      </div>
    </div>
  );
}
