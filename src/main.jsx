import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import BlockingOverlay from './overlays/BlockingOverlay'
import CheckinOverlay from './overlays/CheckinOverlay'
import CountdownOverlay from './overlays/CountdownOverlay'
import FloatingScoreBar from './overlays/FloatingScoreBar'
import UIMockup from './pages/UIMockup'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/ui-mockup" element={<UIMockup />} />
        <Route path="/blocking" element={<BlockingOverlay />} />
        <Route path="/countdown" element={<CountdownOverlay />} />
        <Route path="/checkin" element={<CheckinOverlay />} />
        <Route path="/scorebar" element={<FloatingScoreBar />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
