const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/videocall')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// For development, use HTTP. For production, use HTTPS
const server = require('http').createServer(app);

const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// MediaSoup workers, routers, and peers
let workers = [];
let nextWorkerIdx = 0;
const rooms = new Map();
const peers = new Map();
const transports = new Map();
const producers = new Map();
const consumers = new Map();

// Create MediaSoup workers
async function createWorkers() {
  const numWorkers = Object.keys(require('os').cpus()).length;
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
  }
}

// Get next worker (round-robin)
function getWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

// Create room
async function createRoom(roomId) {
  const worker = getWorker();
  const router = await worker.createRouter({
    mediaCodecs: config.mediasoup.router.mediaCodecs
  });

  rooms.set(roomId, { router, peers: new Set() });
  console.log(`Room created: ${roomId}`);
  return router;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join-room', async ({ roomId, peerId }, callback) => {
    try {
      if (!rooms.has(roomId)) {
        await createRoom(roomId);
      }

      const room = rooms.get(roomId);
      room.peers.add(socket.id);
      
      peers.set(socket.id, {
        id: peerId,
        roomId,
        transports: new Set(),
        producers: new Set(),
        consumers: new Set()
      });

      socket.join(roomId);
      
      callback({
        rtpCapabilities: room.router.rtpCapabilities
      });

      // Notify others
      socket.to(roomId).emit('new-peer', { peerId: socket.id });
      
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ error: error.message });
    }
  });

  socket.on('get-router-rtp-capabilities', (callback) => {
    const peer = peers.get(socket.id);
    if (!peer) return callback({ error: 'Peer not found' });
    
    const room = rooms.get(peer.roomId);
    callback({ rtpCapabilities: room.router.rtpCapabilities });
  });

  socket.on('create-webrtc-transport', async ({ sender }, callback) => {
    try {
      const peer = peers.get(socket.id);
      const room = rooms.get(peer.roomId);
      
      const transport = await room.router.createWebRtcTransport({
        listenIps: config.mediasoup.webRtcTransport.listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      transports.set(transport.id, transport);
      peer.transports.add(transport.id);

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          transport.close();
          transports.delete(transport.id);
        }
      });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error('Error creating transport:', error);
      callback({ error: error.message });
    }
  });

  socket.on('connect-transport', async ({ transportId, dtlsParameters }, callback) => {
    try {
      const transport = transports.get(transportId);
      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (error) {
      console.error('Error connecting transport:', error);
      callback({ error: error.message });
    }
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      const transport = transports.get(transportId);
      const producer = await transport.produce({ kind, rtpParameters });
      
      const peer = peers.get(socket.id);
      producers.set(producer.id, producer);
      peer.producers.add(producer.id);

      producer.on('transportclose', () => {
        producer.close();
        producers.delete(producer.id);
      });

      callback({ id: producer.id });

      // Notify other peers
      socket.to(peer.roomId).emit('new-producer', {
        peerId: socket.id,
        producerId: producer.id,
        kind
      });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ error: error.message });
    }
  });

  socket.on('consume', async ({ producerId, rtpCapabilities }, callback) => {
    try {
      const peer = peers.get(socket.id);
      const room = rooms.get(peer.roomId);
      const producer = producers.get(producerId);

      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        return callback({ error: 'Cannot consume' });
      }

      const transport = Array.from(peer.transports)
        .map(id => transports.get(id))
        .find(t => t.appData.consuming);

      if (!transport) {
        return callback({ error: 'No consuming transport' });
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      consumers.set(consumer.id, consumer);
      peer.consumers.add(consumer.id);

      consumer.on('transportclose', () => {
        consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        socket.emit('consumer-closed', { consumerId: consumer.id });
        consumers.delete(consumer.id);
      });

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ error: error.message });
    }
  });

  socket.on('resume-consumer', async ({ consumerId }, callback) => {
    try {
      const consumer = consumers.get(consumerId);
      await consumer.resume();
      callback({ success: true });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  socket.on('get-producers', (callback) => {
    const peer = peers.get(socket.id);
    const room = rooms.get(peer.roomId);
    const producerList = [];
    room.peers.forEach(peerId => {
      if (peerId !== socket.id) {
        const otherPeer = peers.get(peerId);
        otherPeer.producers.forEach(prodId => {
          const producer = producers.get(prodId);
          producerList.push({
            peerId,
            producerId: prodId,
            kind: producer.kind
          });
        });
      }
    });
    
    callback({ producers: producerList });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const peer = peers.get(socket.id);
    if (peer) {
      // Clean up transports
      peer.transports.forEach(transportId => {
        const transport = transports.get(transportId);
        if (transport) transport.close();
        transports.delete(transportId);
      });

      // Clean up producers
      peer.producers.forEach(producerId => {
        producers.delete(producerId);
      });

      // Clean up consumers
      peer.consumers.forEach(consumerId => {
        consumers.delete(consumerId);
      });

      // Remove from room
      const room = rooms.get(peer.roomId);
      if (room) {
        room.peers.delete(socket.id);
        socket.to(peer.roomId).emit('peer-left', { peerId: socket.id });
        
        // Delete room if empty
        if (room.peers.size === 0) {
          room.router.close();
          rooms.delete(peer.roomId);
        }
      }

      peers.delete(socket.id);
    }
  });
});

// REST API endpoints
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.keys()).map(roomId => ({
    id: roomId,
    participants: rooms.get(roomId).peers.size
  }));
  res.json(roomList);
});

// Initialize and start server
async function startServer() {
  await createWorkers();
  
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();