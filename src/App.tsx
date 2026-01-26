
import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './pages/Menu';
import Game from './pages/Game';
import OnlineGame from './pages/OnlineGame';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/game" element={<Game />} />
        <Route path="/online" element={<OnlineGame />} />
      </Routes>
    </Router>
  );
}

export default App;
