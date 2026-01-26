
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
  // --- LOBBY LOGIC ---

  socket.on('create_room', ({ roomId, nickname, colorId }) => {
    if (rooms[roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }
    
    socket.join(roomId);
    
    rooms[roomId] = {
      id: roomId,
      p1: { id: socket.id, nickname: nickname || 'PLAYER 1', colorId: colorId || 0, isReady: false, role: 'p1' },
      p2: null,
      gameState: 'LOBBY', 
      deck: [],
      kingDeck: [], // For king selection
      p1Hand: [],
      p2Hand: [],
      p1KingCards: [],
      p2KingCards: [],
      p1Stats: null,
      p2Stats: null,
      turn: 'p1',
      turnCount: 1
    };
    
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
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
    
    // Ensure distinct color if conflict
    let finalColor = colorId || 1;
    if (room.p1.colorId === finalColor) finalColor = (finalColor + 1) % 8;

    room.p2 = { id: socket.id, nickname: nickname || 'PLAYER 2', colorId: finalColor, isReady: false, role: 'p2' };
    
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
          // Reset ready status on change to prevent abuse
          target.isReady = false; 
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

  socket.on('lobby_chat', ({ roomId, message }) => {
      const room = rooms[roomId];
      if (!room) return;
      let sender = null;
      if (room.p1 && room.p1.id === socket.id) sender = room.p1;
      else if (room.p2 && room.p2.id === socket.id) sender = room.p2;

      if (sender) {
          io.to(roomId).emit('chat_message', { 
              text: message.substring(0, 32), 
              senderName: sender.nickname, 
              colorId: sender.colorId,
              senderId: socket.id
          });
      }
  });

  // --- GAME START & KING SELECTION ---

  socket.on('init_king_selection', ({ roomId, kingDeck }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // Host starts this
      room.gameState = 'KING_SELECTION';
      room.kingDeck = shuffle(kingDeck);
      
      io.to(roomId).emit('king_selection_start', {
          deck: room.kingDeck
      });
  });

  socket.on('king_selected', ({ roomId, card, role, remainingDeck }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (role === 'p1') {
          room.p1KingCards.push(card);
          room.kingDeck = remainingDeck; // Update deck after P1 draw
      } else {
          room.p2KingCards.push(card);
          // End of selection
      }

      // Broadcast selection event so clients update UI
      io.to(roomId).emit('king_card_chosen', { card, role, remainingDeck });
  });

  socket.on('start_main_game', ({ roomId, initialDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room) return;

      room.gameState = 'PLAYING';
      room.deck = shuffle([...initialDeck]);
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      
      // Deal Hands (6 cards each)
      room.p1Hand = room.deck.splice(0, 6);
      room.p2Hand = room.deck.splice(0, 6);
      
      room.turn = 'p1';
      room.turnCount = 1;

      io.to(roomId).emit('game_started_final', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          deckCount: room.deck.length
      });
      
      // Send private hands
      if (room.p1) io.to(room.p1.id).emit('hand_deal', room.p1Hand);
      if (room.p2) io.to(room.p2.id).emit('hand_deal', room.p2Hand);
  });

  // --- GAMEPLAY SYNC ---

  socket.on('game_action_sync', ({ roomId, newState, event, log }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Update Server State (Authoritative storage)
      if (newState.p1Stats) room.p1Stats = newState.p1Stats;
      if (newState.p2Stats) room.p2Stats = newState.p2Stats;
      if (newState.turn) room.turn = newState.turn;
      
      // Broadcast to all
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          event: event, 
          log: log
      });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if ((room.p1 && room.p1.id === socket.id) || (room.p2 && room.p2.id === socket.id)) {
        
        if (room.gameState !== 'LOBBY') {
            io.to(roomId).emit('opponent_disconnected');
            delete rooms[roomId];
        } else {
            // In Lobby
            if (room.p1 && room.p1.id === socket.id) {
                // Host left
                io.to(roomId).emit('host_left');
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
