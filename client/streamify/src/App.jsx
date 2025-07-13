import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import {Routes,Route} from "react-router-dom"
import VcPage from './pages/VcPage.jsx'
import { ToastContainer } from 'react-toastify';
import './App.css'

function App() {
  return (
    <>
      <ToastContainer/>
      <Routes>
        <Route path='/join' element = {<VcPage/>}/>
      </Routes>
    </>
  )
}

export default App;
