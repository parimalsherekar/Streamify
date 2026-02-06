import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import VideoGrid from './VideoGrid';
import './Room.css';

const Room = ({ roomId, username, onLeave }) => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [consumerTransport, setConsumerTransport] = useState(null);
  const [videoProducer, setVideoProducer] = useState(null);
  const [audioProducer, setAudioProducer] = useState(null);
  const [peers, setPeers] = useState(new Map());
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    initializeRoom();
    return () => {
      cleanup();
    };
  }, []);

  const initializeRoom = async () => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('connect', async () => {
      console.log('Connected to server');
      await joinRoom(newSocket);
    });

    newSocket.on('new-peer', async ({ peerId }) => {
      console.log('New peer joined:', peerId);
    });

    newSocket.on('new-producer', async ({ peerId, producerId, kind }) => {
      console.log('New producer:', peerId, producerId, kind);
      await consumeMedia(newSocket, producerId, peerId, kind);
    });

    newSocket.on('peer-left', ({ peerId }) => {
      console.log('Peer left:', peerId);
      setPeers(prev => {
        const updated = new Map(prev);
        const peer = updated.get(peerId);
        if (peer && peer.stream) {
          peer.stream.getTracks().forEach(track => track.stop());
        }
        updated.delete(peerId);
        return updated;
      });
    });

    newSocket.on('consumer-closed', ({ consumerId }) => {
      console.log('Consumer closed:', consumerId);
    });
  };

  const joinRoom = async (socket) => {
    return new Promise((resolve, reject) => {
      socket.emit('join-room', { 
        roomId, 
        peerId: socket.id 
      }, async (response) => {
        if (response.error) {
          reject(response.error);
          return;
        }

        try {
          const newDevice = new mediasoupClient.Device();
          await newDevice.load({ routerRtpCapabilities: response.rtpCapabilities });
          setDevice(newDevice);

          await createTransports(socket, newDevice);
          
          // Small delay to ensure transports are ready
          await new Promise(res => setTimeout(res, 200));
          
          await produceMedia(socket, newDevice);
          
          // Get existing producers after we've produced our media
          await new Promise(res => setTimeout(res, 300));
          await getExistingProducers(socket);
          
          resolve();
        } catch (error) {
          console.error('Error joining room:', error);
          reject(error);
        }
      });
    });
  };

  const createTransports = async (socket, device) => {
    // Create producer transport
    const producerTransportData = await new Promise((resolve) => {
      socket.emit('create-webrtc-transport', { sender: true }, resolve);
    });

    const prodTransport = device.createSendTransport(producerTransportData);
    
    prodTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        socket.emit('connect-transport', {
          transportId: prodTransport.id,
          dtlsParameters
        }, (response) => {
          if (response.error) errback(response.error);
          else callback();
        });
      } catch (error) {
        errback(error);
      }
    });

    prodTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        socket.emit('produce', {
          transportId: prodTransport.id,
          kind,
          rtpParameters
        }, (response) => {
          if (response.error) errback(response.error);
          else callback({ id: response.id });
        });
      } catch (error) {
        errback(error);
      }
    });

    setProducerTransport(prodTransport);

    // Create consumer transport
    const consumerTransportData = await new Promise((resolve) => {
      socket.emit('create-webrtc-transport', { sender: false }, resolve);
    });

    const consTransport = device.createRecvTransport(consumerTransportData);
    consTransport.appData = { consuming: true };
    
    consTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        socket.emit('connect-transport', {
          transportId: consTransport.id,
          dtlsParameters
        }, (response) => {
          if (response.error) errback(response.error);
          else callback();
        });
      } catch (error) {
        errback(error);
      }
    });

    setConsumerTransport(consTransport);
  };

  const produceMedia = async (socket, device) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      // Wait for producer transport to be set
      await new Promise(resolve => setTimeout(resolve, 100));

      if (producerTransport) {
        const videoProd = await producerTransport.produce({ track: videoTrack });
        const audioProd = await producerTransport.produce({ track: audioTrack });
        
        setVideoProducer(videoProd);
        setAudioProducer(audioProd);
        
        console.log('Produced video and audio');
      }
    } catch (error) {
      console.error('Error producing media:', error);
    }
  };

  const consumeMedia = async (socket, producerId, peerId, kind) => {
    if (!device || !consumerTransport) {
      console.log('Device or consumer transport not ready');
      return;
    }

    const { rtpCapabilities } = device;
    
    console.log('Attempting to consume:', producerId, kind);
    
    socket.emit('consume', {
      producerId,
      rtpCapabilities,
      transportId: consumerTransport.id
    }, async (response) => {
      if (response.error) {
        console.error('Error consuming:', response.error);
        return;
      }

      console.log('Consume response:', response);

      const consumer = await consumerTransport.consume({
        id: response.id,
        producerId: response.producerId,
        kind: response.kind,
        rtpParameters: response.rtpParameters,
      });

      socket.emit('resume-consumer', { consumerId: consumer.id }, (res) => {
        console.log('Consumer resumed:', consumer.id);
      });

      const stream = new MediaStream([consumer.track]);
      
      setPeers(prev => {
        const updated = new Map(prev);
        const peer = updated.get(peerId) || { streams: {} };
        peer.streams = peer.streams || {};
        
        if (kind === 'video') {
          peer.videoStream = stream;
        } else {
          peer.audioStream = stream;
        }
        
        if (peer.videoStream && peer.audioStream) {
          const combinedStream = new MediaStream([
            ...peer.videoStream.getTracks(),
            ...peer.audioStream.getTracks()
          ]);
          peer.stream = combinedStream;
        } else {
          peer.stream = stream;
        }
        
        updated.set(peerId, peer);
        console.log('Updated peers, total:', updated.size);
        return updated;
      });
    });
  };

  const getExistingProducers = async (socket) => {
    socket.emit('get-producers', ({ producers }) => {
      producers.forEach(({ peerId, producerId, kind }) => {
        consumeMedia(socket, producerId, peerId, kind);
      });
    });
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      
      if (videoProducer) {
        if (videoTrack.enabled) videoProducer.resume();
        else videoProducer.pause();
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
      
      if (audioProducer) {
        if (audioTrack.enabled) audioProducer.resume();
        else audioProducer.pause();
      }
    }
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });
      
      const screenTrack = screenStream.getVideoTracks()[0];
      
      if (videoProducer) {
        await videoProducer.replaceTrack({ track: screenTrack });
        setIsScreenSharing(true);
        
        screenTrack.onended = () => {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          videoProducer.replaceTrack({ track: videoTrack });
          setIsScreenSharing(false);
        };
      }
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (videoProducer) videoProducer.close();
    if (audioProducer) audioProducer.close();
    if (producerTransport) producerTransport.close();
    if (consumerTransport) consumerTransport.close();
    if (socket) socket.disconnect();
  };

  const handleLeave = () => {
    cleanup();
    onLeave();
  };

  return (
    <div className="room-container">
      <div className="room-header">
        <h2>Room: {roomId}</h2>
        <span className="username">{username}</span>
      </div>

      <VideoGrid
        localVideoRef={localVideoRef}
        peers={peers}
        username={username}
      />

      <div className="controls">
        <button 
          className={`control-btn ${!isVideoEnabled ? 'disabled' : ''}`}
          onClick={toggleVideo}
        >
          {isVideoEnabled ? '📹' : '📹❌'}
        </button>
        
        <button 
          className={`control-btn ${!isAudioEnabled ? 'disabled' : ''}`}
          onClick={toggleAudio}
        >
          {isAudioEnabled ? '🎤' : '🎤❌'}
        </button>
        
        <button 
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={shareScreen}
        >
          🖥️
        </button>
        
        <button className="control-btn leave" onClick={handleLeave}>
          📞 Leave
        </button>
      </div>
    </div>
  );
};

export default Room;