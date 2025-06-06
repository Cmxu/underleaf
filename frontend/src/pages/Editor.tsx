import Editor from '@monaco-editor/react';
import FileTree from '../components/FileTree';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function EditorPage() {
  const navigate = useNavigate();
  const repoUrl = sessionStorage.getItem('repoUrl') || '';
  const [content, setContent] = useState('% Start writing your LaTeX here');

  if (!repoUrl) {
    navigate('/');
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <span>Repo: {repoUrl}</span>
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
