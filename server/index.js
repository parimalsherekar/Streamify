import express from "express";
import http from "http";
import {Server} from 'socket.io';
import cors from "cors";
import dotenv from "dotenv";
import testRouter from "./Routes/testRoutes.js"

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const io = new Server(server,{
    cors:{
        origin : '*',
    },
});

const PORT = process.env.PORT || 5000;

app.use('/api/test',testRouter);


server.listen(PORT,()=>{
    console.log(`Server Started on PORT Number : ${PORT}`)
})
