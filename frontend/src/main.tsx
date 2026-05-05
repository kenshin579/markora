import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles.css';
import { createBridge, createMockBridge, parseQueryContext } from './bridge/markora';
import { Editor } from './editor/Editor';
import type { MarkoraBridge } from './types';

const isDev = import.meta.env.DEV && !window.location.search.includes('filePath=');
const bridge: MarkoraBridge = isDev
  ? createMockBridge()
  : createBridge(parseQueryContext(window.location.href));

function App() {
  const [theme, setTheme] = React.useState(bridge.getContext().initialTheme);
  React.useEffect(() => bridge.onThemeChange(setTheme), []);
  return (
    <MantineProvider defaultColorScheme={theme} forceColorScheme={theme}>
      <Editor bridge={bridge} />
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
