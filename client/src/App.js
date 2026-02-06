import React, { useState } from 'react';
import Room from './components/Room';
import './App.css';

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim() && username.trim()) {
      setJoined(true);
    }
  };

  const handleLeave = () => {
    setJoined(false);
    setRoomId('');
  };

  if (joined) {
    return <Room roomId={roomId} username={username} onLeave={handleLeave} />;
  }

  return (
    <div className="App">
      <div className="join-container">
        <div className="join-card">
          <h1>Video Call App</h1>
          <p>Join or create a room to start your video call</p>
          
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Room ID</label>
              <input
                type="text"
                placeholder="Enter room ID or create new"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
            
            <button type="submit" className="btn-join">
              Join Room
            </button>
          </form>
          
          <div className="quick-join">
            <button 
              className="btn-secondary"
              onClick={() => setRoomId(`room-${Date.now()}`)}
            >
              Generate Random Room ID
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;