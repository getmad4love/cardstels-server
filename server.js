
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

// Helper to shuffle array
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- LOBBY LOGIC ---

  socket.on('create_room', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }
    
    socket.join(roomId);
    
    rooms[roomId] = {
      id: roomId,
      p1: { id: socket.id, nickname: 'PLAYER 1', colorId: 0, isReady: false, role: 'p1' },
      p2: null,
      gameState: 'LOBBY', // LOBBY, PLAYING, ENDED
      // Game Data
      deck: [],
      p1Hand: [],
      p2Hand: [],
      p1Stats: null,
      p2Stats: null,
      turn: 'p1',
      logs: [],
      turnCount: 1
    };
    
    console.log(`Room ${roomId} created by ${socket.id}`);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', (roomId) => {
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.p2) {
      socket.emit('error', 'Room is full');
      return;
    }

    socket.join(roomId);
    
    // Assign different color to P2 if needed
    let p2Color = 1;
    if (room.p1.colorId === 1) p2Color = 0;

    room.p2 = { id: socket.id, nickname: 'PLAYER 2', colorId: p2Color, isReady: false, role: 'p2' };
    
    console.log(`User ${socket.id} joined ${roomId}`);
    io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
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
        io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
    }
  });

  socket.on('toggle_ready', ({ roomId, isReady }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (room.p1 && room.p1.id === socket.id) room.p1.isReady = isReady;
      else if (room.p2 && room.p2.id === socket.id) room.p2.isReady = isReady;

      io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
  });

  // --- GAME START & SYNC ---

  socket.on('start_game_request', ({ roomId, initialDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || !room.p1 || !room.p2) return;
      if (room.p1.id !== socket.id) return; // Only host starts
      if (!room.p1.isReady || !room.p2.isReady) return; 

      room.gameState = 'PLAYING';
      
      // Initialize Game State
      room.deck = shuffle([...initialDeck]);
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      
      // Deal Hands (6 cards each)
      room.p1Hand = room.deck.splice(0, 6);
      room.p2Hand = room.deck.splice(0, 6);
      
      room.turn = 'p1';
      room.turnCount = 1;

      io.to(roomId).emit('game_start', {
          p1: room.p1,
          p2: room.p2,
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
      });
      
      // Send specific hands
      io.to(room.p1.id).emit('hand_update', room.p1Hand);
      io.to(room.p2.id).emit('hand_update', room.p2Hand);
  });

  // --- GAME ACTIONS ---

  socket.on('game_action_sync', ({ roomId, newState, event, log }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (newState.p1Stats) room.p1Stats = newState.p1Stats;
      if (newState.p2Stats) room.p2Stats = newState.p2Stats;
      if (newState.deck) room.deck = newState.deck;
      if (newState.p1Hand) room.p1Hand = newState.p1Hand;
      if (newState.p2Hand) room.p2Hand = newState.p2Hand;
      if (newState.turn) room.turn = newState.turn;
      
      // Broadcast update to everyone with detailed event info
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          event: event, // Contains { type: 'PLAY_CARD', cardId: 10, player: 'p1' }
          log: log
      });

      if (room.p1) io.to(room.p1.id).emit('hand_update', room.p1Hand);
      if (room.p2) io.to(room.p2.id).emit('hand_update', room.p2Hand);
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
        
        if (room.gameState === 'PLAYING') {
            io.to(roomId).emit('opponent_disconnected');
            delete rooms[roomId];
        } else {
            if (room.p1 && room.p1.id === socket.id) {
                // Host left, close room
                io.to(roomId).emit('opponent_disconnected');
                delete rooms[roomId];
            } else {
                // Guest left
                room.p2 = null;
                io.to(roomId).emit('lobby_update', { p1: room.p1, p2: null });
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
