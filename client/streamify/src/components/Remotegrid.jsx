import React from 'react'
import '../css/Remotegrid.css';

const Remotegrid = ({remoteStreams}) => {
  return (
    <>
      <div className="remote-videos-container"
        style={{gridTemplateColumns:`repeat(${Math.min(Object.keys(remoteStreams).length,4)},1fr)`}}>
            {Object.entries(remoteStreams).map(([socketId, stream]) => (
                <video
                    key={socketId}
                    className="remote-video"
                    autoPlay
                    playsInline
                    ref={(videoEl) => {
                        if (videoEl && stream) {
                            videoEl.srcObject = stream;
                        }
                    }}
                />
            ))}
        </div>
    </>
  )
}

export default Remotegrid;