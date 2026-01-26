
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Umožní připojení odkudkoliv (itch.io, Android, localhost)
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- LOBBY LOGIC ---

  socket.on('create_room', (roomId) => {
    console.log(`User ${socket.id} trying to create room ${roomId}`);
    if (rooms[roomId]) {
      socket.emit('error', 'Místnost již existuje');
      return;
    }
    
    socket.join(roomId);
    
    rooms[roomId] = {
      p1: { id: socket.id, nickname: 'PLAYER 1', colorId: 0, isReady: false, role: 'p1' },
      p2: null,
      gameStarted: false,
      deckData: null
    };
    
    console.log(`Room ${roomId} created by ${socket.id}`);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', rooms[roomId]);
  });

  socket.on('join_room', (roomId) => {
    console.log(`User ${socket.id} trying to join room ${roomId}`);
    const room = rooms[roomId];
    
    if (!room) {
      console.log(`Room ${roomId} not found for user ${socket.id}`);
      socket.emit('error', 'Místnost nenalezena');
      return;
    }
    
    if (room.p2) {
      socket.emit('error', 'Místnost je plná');
      return;
    }

    socket.join(roomId);
    
    // Assign distinct color for P2 if collision
    let p2Color = 1;
    if (room.p1.colorId === 1) p2Color = 0;

    room.p2 = { id: socket.id, nickname: 'PLAYER 2', colorId: p2Color, isReady: false, role: 'p2' };
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    io.to(roomId).emit('lobby_update', room);
  });

  socket.on('update_player_info', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    if (!room) return;

    let target = null;
    if (room.p1 && room.p1.id === socket.id) target = room.p1;
    else if (room.p2 && room.p2.id === socket.id) target = room.p2;

    if (target) {
        target.nickname = nickname.substring(0, 12).toUpperCase(); 
        target.colorId = colorId;
        io.to(roomId).emit('lobby_update', room);
    }
  });

  socket.on('toggle_ready', ({ roomId, isReady }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (room.p1 && room.p1.id === socket.id) room.p1.isReady = isReady;
      else if (room.p2 && room.p2.id === socket.id) room.p2.isReady = isReady;

      io.to(roomId).emit('lobby_update', room);
  });

  socket.on('start_game_request', ({ roomId, deckData }) => {
      const room = rooms[roomId];
      if (!room || !room.p1 || !room.p2) return;
      if (room.p1.id !== socket.id) return; // Only host starts
      if (!room.p1.isReady || !room.p2.isReady) return; 

      room.gameStarted = true;
      room.deckData = deckData;
      
      console.log(`Game started in room ${roomId}`);

      io.to(roomId).emit('game_start', {
          deckData: room.deckData,
          p1: room.p1,
          p2: room.p2
      });
  });

  // --- GAME LOGIC ---

  // Action relay (Animation, Discard, End Turn signal)
  socket.on('game_action', ({ roomId, action }) => {
    if (action.type === 'END_TURN') {
        console.log(`[${roomId}] Turn Ended by ${socket.id}`);
    }
    socket.to(roomId).emit('opponent_action', action);
  });

  // STATE SYNC (Authoritative Broadcast)
  socket.on('game_sync', ({ roomId, p1Stats, p2Stats, turnCounts }) => {
      // Forward new stats to opponent
      socket.to(roomId).emit('game_sync_update', { p1Stats, p2Stats, turnCounts });
  });
  
  socket.on('king_selected', ({ roomId, card, role }) => {
      socket.to(roomId).emit('opponent_king_selected', { card, role });
  });

  socket.on('chat_message', ({ roomId, message, color }) => {
    io.to(roomId).emit('chat_message', { 
      text: message, 
      senderId: socket.id, 
      color 
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if ((room.p1 && room.p1.id === socket.id) || (room.p2 && room.p2.id === socket.id)) {
        
        if (room.gameStarted) {
            io.to(roomId).emit('opponent_disconnected');
            delete rooms[roomId];
        } else {
            if (room.p1 && room.p1.id === socket.id) {
                // Host left lobby -> kill room
                io.to(roomId).emit('opponent_disconnected');
                delete rooms[roomId];
            } else {
                // Guest left lobby -> clear slot
                room.p2 = null;
                io.to(roomId).emit('lobby_update', room);
            }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
