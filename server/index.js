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

const rooms = {}//roomid => {socket.id,username,userId}

io.on("connection",(socket)=>{
    
    socket.on("create-room",({roomId,userName,userId})=>{
        if(!rooms[roomId]){
            rooms[roomId] = [];
            socket.join(roomId);
            rooms[roomId].push({socketId:socket.id,userName,userId});
            
            io.to(socket.id).emit("server-msg","Room has been created Succesfully");
        }
        else{
            io.to(socket.id).emit("server-msg","Room has Already created try another name!!!");
        }
    });

    socket.on("join-room",({roomId,userName,userId})=>{
        if(!rooms[roomId]){
            io.to(socket.id).emit("server-msg","Room does not exists");
        }
        else{
            socket.join(roomId);
            rooms[roomId].push({socketId:socket.id,userName,userId});
            io.to(socket.id).emit("server-msg",`${roomId} has been joined succesfully`);
        }
    });
})

const PORT = process.env.PORT || 5000;

app.use('/api/test',testRouter);


server.listen(PORT,()=>{
    console.log(`Server Started on PORT Number : ${PORT}`)
})
