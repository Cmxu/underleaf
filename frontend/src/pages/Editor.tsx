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
      <header style={{ padding: '0.5rem', background: '#f5f5f5' }}>
        <span>Repo: {repoUrl}</span>
      </header>
      <div style={{ flex: 1, display: 'flex' }}>
        <aside style={{ width: '200px', borderRight: '1px solid #ddd' }}>
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
        <section style={{ width: '400px', borderLeft: '1px solid #ddd', padding: '0.5rem' }}>
          <p>PDF Preview</p>
          {/* TODO: render PDF preview */}
        </section>
      </div>
    </div>
  );
}
