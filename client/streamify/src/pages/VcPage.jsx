import "../css/vcPage.css"
import {useRef , useState , useEffect} from "react"
import socket from "../utils/socket.js";
import {toast} from "react-toastify"

function VcPage(){

    const [serverMsg,setserverMsg] = useState("");
    const [roomId,setroomId] = useState("");
    const [userName,setuserName] = useState("");
    const [userId,setuserId] = useState("");
    
    // const peer = useRef(null);
    // const localVideo = useRef(null);
    // const remoteVideo = useRef(null);
    

    // useEffect(()=>{

    //     const setupConnection = async () =>{
    //         console.log("joinpage")
    //         peer.current = new RTCPeerConnection({
    //             iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    //         });

    //         console.log(peer);

    //         navigator.mediaDevices.getUserMedia({video:true , audio:false}).then(
    //             stream => {
    //                 localVideo.current.srcObject = stream;
    //                 stream.getTracks().forEach(track => peer.current.addrack(track,stream));
    //             }
    //         );
    //     }

    //     setupConnection();
    // },[]);

    useEffect(()=>{
        socket.on("server-msg",(msg)=>{
            console.log(msg);
            toast(msg);
        })
    },[]);

    const createRoom = () =>{
        if(!socket.connected){
            console.log("Socket not connected");
        }

        socket.emit("create-room",{
            roomId,
            userName,
            userId,
            socketId:socket.id,
        });
    }

    const joinRoom = () =>{
        socket.emit("join-room",{
            roomId,
            userName,
            userId,
            socketId:socket.id,
        });
    }

    return(
        <>
            <div className="container">
                {/* <video ref = {localVideo} id="localvideo" autoPlay ></video>
                <video ref = {remoteVideo} id="remotevideo" autoPlay ></video> */}
                <div>
                    <h1>Create Room</h1>
                    <input type = "text" placeholder = "Enter the RoomId" onChange = {(e)=>{setroomId(e.target.value);}}></input>
                    <input type = "text" placeholder = "UserName" onChange = {(e)=>{setuserName(e.target.value);}}></input>
                    <input type = "text" placeholder = "UserId" onChange = {(e)=>{setuserId(e.target.value);}}></input>
                    <input type = "text" placeholder = "Enter Your Message" onChange = {(e)=>{setserverMsg(e.target.value);}}></input>
                    <button onClick ={createRoom}>Send</button>
                </div>
                <div>
                    <h1>Join Room</h1>
                    <input type = "text" placeholder = "Enter the RoomId" onChange = {(e)=>{setroomId(e.target.value);}}></input>
                    <input type = "text" placeholder = "UserName" onChange = {(e)=>{setuserName(e.target.value);}}></input>
                    <input type = "text" placeholder = "UserId" onChange = {(e)=>{setuserId(e.target.value);}}></input>
                    <input type = "text" placeholder = "Enter Your Message" onChange = {(e)=>{setserverMsg(e.target.value);}}></input>
                    <button onClick ={joinRoom}>Send</button>
                </div>
            </div>
        </>
    );
}

export default VcPage;