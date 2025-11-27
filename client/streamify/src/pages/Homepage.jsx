import { toast } from "react-toastify";
import '../css/Homepage.css';
import Navbar from "../components/Navbar.jsx";
import {useEffect} from 'react';
import {useNavigate} from "react-router-dom";

function Homepage() {
    const navigate = useNavigate();

    useEffect(() => {
        const ball = document.getElementById('cursor-ball');

        const handleMouseMove = (e) => {
            if (ball) {
                ball.style.left = `${e.clientX }px`;
                ball.style.top = `${e.clientY}px`;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);
  return (
    <div id="container">
      <Navbar />
      
      <div className="home-container">
        <h1 className="question">What do we do?</h1>
        <div className="tagline">Built for Speed. Made for simplicity.</div>
        <div className="description">
            <p>Connect instantly through fast, peer-to-peer video calls</p>
            <p>No signups. No downloads. Just share a link and start talking.</p>
            <p>Streamify is built for simplicity, so you can focus on the conversation, not the setup.</p>
        </div>
        <div className="bottom">
            <button onClick={()=>navigate('/caller')}>Start Call</button>
            <button onClick={()=>navigate('/joiner')}>Join Call</button>
        </div>
        <div id="cursor-ball"></div>
      </div>
    </div>
  );
}

export default Homepage;
