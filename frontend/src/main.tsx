import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return <div>Markora editor — bootstrapping...</div>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
