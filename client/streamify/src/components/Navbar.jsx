import React from 'react';
import { Link } from 'react-router-dom'; // ✅ Import Link for routing
import "../css/Navbar.css";

const Navbar = () => {
  return (
    <div className="navbar"> {/* ✅ Use className */}
      <div>
        <p id="logo">Streamify</p>
      </div>
      <div id="left-navbar">
        <a to="/login">Login</a>     {/* ✅ Use Link for routing */}
        <a to="/signup">SignUp</a>   {/* ✅ Use Link for routing */}
      </div>
    </div>
  );
};

export default Navbar;
