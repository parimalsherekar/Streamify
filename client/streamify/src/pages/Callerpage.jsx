// Callerpage.jsx
import "../css/Callerpage.css";
import { useRef, useState, useEffect } from "react";
import socket from "../utils/socket.js";
import { toast } from "react-toastify";
import Remotegrid from "../components/Remotegrid.jsx";

function Callerpage() {
  const [roomId, setroomId] = useState("");
  const [userId, setuserId] = useState("");
  const [userName, setuserName] = useState("");
  const [remoteStreams, setRemoteStreams] = useState({});
  const localVideo = useRef(null);
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const iceCandidateQueue = useRef({});

  // return created stream so callers can await it
  async function getLocalStream() {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo.current) {
        localVideo.current.srcObject = localStream.current;
        localVideo.current.autoplay = true;
        localVideo.current.playsInline = true;
        localVideo.current.muted = true; // local preview should be muted
        // try play
        localVideo.current.play().catch(() => {});
      }
      return localStream.current;
    } catch (error) {
      console.error("Error accessing media devices", error);
      toast.error("Please allow access to camera and microphone.");
      throw error;
    }
  }

  async function ensureLocalStream() {
    if (!localStream.current) {
      await getLocalStream();
    }
  }

  function createPeerConnection(socketId) {
    // add TURN servers here — replace with real TURN if needed
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // Example TURN entry (replace with your TURN server)
        // { urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { candidate: event.candidate, from: socket.id, to: socketId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE STATE for", socketId, pc.iceConnectionState);
      // if failed/closed, cleanup
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        if (peerConnections.current[socketId]) {
          try { peerConnections.current[socketId].close(); } catch (e) {}
          delete peerConnections.current[socketId];
        }
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0];
      console.log("ontrack:", socketId, "tracks:", event.track && event.track.kind, "stream:", !!stream);
      if (!stream) return;
      // Always set/overwrite so UI attaches correctly
      setRemoteStreams((prev) => ({ ...prev, [socketId]: stream }));
    };

    return pc;
  }

  async function sendOffer(socketId) {
    await ensureLocalStream().catch(() => {});
    if (!localStream.current) {
      console.warn("No local stream, aborting offer to", socketId);
      return;
    }

    // prevent duplicate
    if (peerConnections.current[socketId]) {
      console.log("Peer connection already exists for", socketId);
      return;
    }

    const pc = createPeerConnection(socketId);
    peerConnections.current[socketId] = pc;

    // add local tracks
    try {
      localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current));
    } catch (err) {
      console.warn("Failed to add local tracks", err);
    }

    console.log("Creating offer ->", socketId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { offer, from: socket.id, to: socketId });
  }

  async function sendAnswer(offer, socketId) {
    // Clean up existing connection if any
    if (peerConnections.current[socketId]) {
      try { peerConnections.current[socketId].close(); } catch (e) {}
      delete peerConnections.current[socketId];
      iceCandidateQueue.current[socketId] = [];
    }

    await ensureLocalStream().catch(() => {}); // ensure we have local media if possible

    const pc = createPeerConnection(socketId);
    peerConnections.current[socketId] = pc;

    if (localStream.current) {
      try { localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current)); } catch (e) {}
    }

    console.log("Answer: setRemoteDescription for", socketId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Process queued ICE candidates (if any)
    const queued = iceCandidateQueue.current[socketId] || [];
    for (const ice of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(ice));
      } catch (err) {
        console.error("Error adding queued ICE candidate", err);
      }
    }
    iceCandidateQueue.current[socketId] = [];

    socket.emit("answer", { answer, from: socket.id, to: socketId });
  }

  useEffect(() => {
    // get local as early as possible
    getLocalStream().catch(() => {});

    socket.on("server-msg", (msg) => {
      console.log("server-msg:", msg);
      toast(msg);
    });

    socket.on("offer", ({ offer, from }) => {
      console.log("Received offer from", from);
      sendAnswer(offer, from);
    });

    socket.on("user-list", ({ userList }) => {
      if (!Array.isArray(userList)) return;
      userList.forEach((member) => {
        // member may be an object with socketId property
        const id = member.socketId || member;
        if (id && id !== socket.id) {
          console.log("Member :", id);
          sendOffer(id).catch((e) => console.error("sendOffer error", e));
        }
      });
    });

    socket.on("new-joinee", ({ socketId }) => {
      console.log("New user joined:", socketId);
      if (socketId && socketId !== socket.id) sendOffer(socketId).catch((e) => console.error(e));
    });

    socket.on("answer", async ({ answer, from }) => {
      console.log("Received answer from", from);
      const pc = peerConnections.current[from];
      if (!pc) {
        console.warn("No pc present for answer from", from);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        // process queued ICEs
        const queued = iceCandidateQueue.current[from] || [];
        for (const ice of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ice));
          } catch (err) {
            console.error("Error adding queued ICE candidate", err);
          }
        }
        iceCandidateQueue.current[from] = [];
      } catch (err) {
        console.error("Failed to apply remote description for answer", err);
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = peerConnections.current[from];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate immediately", err);
        }
      } else {
        if (!iceCandidateQueue.current[from]) iceCandidateQueue.current[from] = [];
        iceCandidateQueue.current[from].push(candidate);
      }
    });

    return () => {
      socket.off("server-msg");
      socket.off("offer");
      socket.off("user-list");
      socket.off("new-joinee");
      socket.off("answer");
      socket.off("ice-candidate");
      // close all peer connections
      Object.values(peerConnections.current).forEach((pc) => {
        try { pc.close(); } catch (e) {}
      });
      peerConnections.current = {};
      iceCandidateQueue.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const host = () => {
    socket.emit("create-room", { roomId, userName, userId });
  };

  const join = () => {
    socket.emit("join-room", { roomId, userName, userId });
  };

  return (
    <div className="container">
      <div>
        <h3>This is Caller Page</h3>
      </div>
      <div className="videosection">
        <video className="local-video" ref={localVideo} autoPlay playsInline muted />
        <Remotegrid remoteStreams={remoteStreams} />
      </div>
      <div>
        <input type="text" placeholder="Enter RoomId" onChange={(e) => setroomId(e.target.value)} />
        <input type="text" placeholder="Enter userId" onChange={(e) => setuserId(e.target.value)} />
        <input type="text" placeholder="Enter userName" onChange={(e) => setuserName(e.target.value)} />
        <button onClick={host}>Host</button>
        <button onClick={join}>Join</button>
      </div>
    </div>
  );
}

export default Callerpage;
