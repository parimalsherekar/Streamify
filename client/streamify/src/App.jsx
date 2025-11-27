import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import {Routes,Route} from "react-router-dom"
// import VcPage from './pages/VcPage.jsx'
import Homepage from './pages/Homepage.jsx'
import Callerpage from './pages/Callerpage.jsx';
// import Joinerpage from './pages/Joinerpage.jsx';
import { ToastContainer } from 'react-toastify';
import './App.css'

function App() {
  return (
    <>
      <ToastContainer/>
      <Routes>
        <Route path='/caller' element = {<Callerpage/>}/>
        {/* <Route path='/joiner' element = {<Joinerpage/>}/> */}
        <Route path='/' element = {<Homepage/>}/>
      </Routes>
    </>
  )
}

export default App;
