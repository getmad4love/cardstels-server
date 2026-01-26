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

  socket.on('create_room', ({ roomId, nickname, colorId }) => {
    if (rooms[roomId]) {
      // If room exists but is empty/stale, reset it
      if (!rooms[roomId].p1 && !rooms[roomId].p2) {
        delete rooms[roomId];
      } else {
        socket.emit('error', 'Room already exists');
        return;
      }
    }
    
    socket.join(roomId);
    
    rooms[roomId] = {
      p1: { id: socket.id, nickname: nickname || 'PLAYER 1', colorId: colorId || 0, isReady: false },
      p2: null,
      gameState: 'LOBBY',
      deck: [],
      p1Hand: [],
      p2Hand: [],
      turn: 'p1'
    };
    
    console.log(`Room ${roomId} created by ${nickname}`);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: null });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.p2) {
      // Reconnection logic could go here, for now reject
      socket.emit('error', 'Room is full');
      return;
    }

    socket.join(roomId);
    
    // Ensure distinct color
    let finalColor = colorId;
    if (room.p1.colorId === colorId) finalColor = (colorId + 1) % 8;

    room.p2 = { id: socket.id, nickname: nickname || 'PLAYER 2', colorId: finalColor, isReady: false };
    
    console.log(`User ${nickname} joined room ${roomId}`);
    io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
  });

  socket.on('update_lobby_settings', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    if (!room) return;

    let target = null;
    if (room.p1 && room.p1.id === socket.id) target = room.p1;
    else if (room.p2 && room.p2.id === socket.id) target = room.p2;

    if (target) {
        if (nickname) target.nickname = nickname.substring(0, 12).toUpperCase(); 
        if (colorId !== undefined) target.colorId = colorId;
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

  // --- GAME INITIALIZATION ---

  socket.on('init_game_setup', ({ roomId, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || !room.p1 || !room.p2) return;
      // Only P1 (Host) can start
      if (room.p1.id !== socket.id) return;

      // 1. Setup Server Deck
      room.deck = shuffle([...mainDeck]);
      
      // 2. Deal Initial Hands (6 cards each)
      room.p1Hand = room.deck.splice(0, 6);
      room.p2Hand = room.deck.splice(0, 6);
      
      // 3. Insert King Power Cards (4x) into remaining deck and reshuffle
      // (Assuming client sends a generic deck, we insert special cards here or client handles it? 
      //  To keep it simple based on client logic, we assume 'mainDeck' passed in includes everything or client handles logic. 
      //  However, standard rules say shuffle King Power AFTER deal. Let's do a simple shuffle here.)
      
      // Note: Client logic in OnlineGame usually prepares the full deck. We just use what is sent, 
      // but strictly handling shuffle ensures fairness.
      
      room.gameState = 'PLAYING';
      room.turn = 'p1';

      // 4. Send Game Start Signal
      io.to(room.p1.id).emit('game_start_sync', {
          p1Stats: initialStats,
          p2Stats: initialStats,
          turn: 'p1',
          myHand: room.p1Hand,
          deckCount: room.deck.length
      });

      io.to(room.p2.id).emit('game_start_sync', {
          p1Stats: initialStats, // P1 is opponent for P2, but we keep "p1Stats" as "Host Stats" in data structure
          p2Stats: initialStats,
          turn: 'p1',
          myHand: room.p2Hand,
          deckCount: room.deck.length
      });
  });

  // --- GAMEPLAY ---

  socket.on('game_action_sync', ({ roomId, newState, event, logs }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Update Turn State
      if (newState && newState.turn) {
          room.turn = newState.turn;
      }

      // Relay to everyone (Client handles "am I P1 or P2" rendering)
      socket.broadcast.to(roomId).emit('state_sync', {
          p1Stats: newState.p1Stats,
          p2Stats: newState.p2Stats,
          turn: newState.turn,
          event: event,
          logs: logs
      });
  });

  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.deck.length === 0) return;

      const card = room.deck.shift(); // Pop top card
      
      // Send card to requester
      socket.emit('card_drawn', { card: card });
      
      // Tell opponent that a card was drawn (so they see animation/deck count change)
      socket.broadcast.to(roomId).emit('opponent_drew_card', { deckCount: room.deck.length });
      
      // Sync deck count for requester too
      socket.emit('deck_count_update', room.deck.length);
  });

  // King Selection Relay
  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // Determine who sent it
      const player = (room.p1 && room.p1.id === socket.id) ? 'p1' : 'p2';
      
      // Relay to other player
      socket.broadcast.to(roomId).emit('king_selection_update', {
          lastSelected: { player, card }
      });
  });

  // Chat Relay
  socket.on('lobby_chat', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    let senderName = "Unknown";
    let colorId = 0;

    if (room.p1 && room.p1.id === socket.id) {
        senderName = room.p1.nickname;
        colorId = room.p1.colorId;
    } else if (room.p2 && room.p2.id === socket.id) {
        senderName = room.p2.nickname;
        colorId = room.p2.colorId;
    }

    io.to(roomId).emit('chat_message', { 
      text: message, 
      senderId: socket.id, 
      senderName,
      colorId
    });
  });

  // --- DISCONNECT ---

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if ((room.p1 && room.p1.id === socket.id) || (room.p2 && room.p2.id === socket.id)) {
        
        if (room.gameState === 'PLAYING') {
            io.to(roomId).emit('opponent_disconnected');
            delete rooms[roomId];
        } else {
            // If in lobby
            if (room.p1 && room.p1.id === socket.id) {
                // Host left - close room or assign new host (simple: close)
                io.to(roomId).emit('host_left');
                delete rooms[roomId];
            } else {
                // P2 left
                room.p2 = null;
                if (room.p1) room.p1.isReady = false; // Reset ready
                io.to(roomId).emit('lobby_update', { p1: room.p1, p2: null });
            }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Cardstels Server running on port ${PORT}`);
});
