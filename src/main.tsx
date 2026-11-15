import { render } from 'preact';
import { App } from './ui/App';
// Fonts are bundled with the game (no CDN), so it works offline.
import '@fontsource/unbounded/latin-600.css';
import '@fontsource/unbounded/latin-800.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-600.css';
import '@fontsource/lexend/latin-700.css';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);
