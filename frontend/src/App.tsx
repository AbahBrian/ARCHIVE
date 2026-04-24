import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LibraryPage from './components/LibraryPage';
import PlayerPage from './components/PlayerPage';
import EditPage from './components/EditPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="/edit/:id" element={<EditPage />} />
      </Routes>
    </BrowserRouter>
  );
}
