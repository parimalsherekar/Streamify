import React, { useEffect, useRef } from 'react';
import './VideoGrid.css';

const VideoTile = ({ stream, label, isMuted }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="video-element"
      />
      <div className="video-label">{label}</div>
    </div>
  );
};

const VideoGrid = ({ localVideoRef, peers, username }) => {
  const peerArray = Array.from(peers.entries());
  const totalVideos = peerArray.length + 1; // +1 for local video

  const getGridClass = () => {
    if (totalVideos === 1) return 'grid-1';
    if (totalVideos === 2) return 'grid-2';
    if (totalVideos <= 4) return 'grid-4';
    if (totalVideos <= 6) return 'grid-6';
    return 'grid-9';
  };

  return (
    <div className={`video-grid ${getGridClass()}`}>
      {/* Local video */}
      <div className="video-tile local">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="video-element"
        />
        <div className="video-label">{username} (You)</div>
      </div>

      {/* Remote videos */}
      {peerArray.map(([peerId, peer]) => (
        <VideoTile
          key={peerId}
          stream={peer.stream}
          label={`User ${peerId.substring(0, 4)}`}
          isMuted={false}
        />
      ))}
    </div>
  );
};

export default VideoGrid;