import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LibraryPage from './components/LibraryPage';
import PlayerPage from './components/PlayerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
