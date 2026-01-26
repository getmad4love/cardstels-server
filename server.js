
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

// Helper to shuffle array (Fisher-Yates)
const shuffle = (array) => {
    if (!array || !Array.isArray(array)) return [];
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
};

io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  // --- LOBBY LOGIC ---

  socket.on('create_room', ({ roomId, nickname, colorId }) => {
    console.log(`[LOBBY] Create Room: ${roomId} by ${nickname}`);
    
    if (rooms[roomId]) {
      const room = rooms[roomId];
      room.p1.id = socket.id;
      room.p1.nickname = nickname;
      room.p1.colorId = colorId;
      
      socket.join(roomId);
      socket.emit('room_created', roomId);
      io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
      return;
    }
    
    socket.join(roomId);
    
    rooms[roomId] = {
      id: roomId,
      p1: { id: socket.id, nickname: nickname || 'PLAYER 1', colorId: colorId || 0, isReady: false, role: 'p1' },
      p2: null,
      gameState: 'LOBBY', 
      p1Stats: null,
      p2Stats: null,
      p1KingCards: [], // Initialize empty arrays for King Cards
      p2KingCards: [],
      turn: 'p1',
      mainDeck: [],
      kingDeck: []
    };
    
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    
    if (room.p2) {
        // Reconnect logic
        room.p2.id = socket.id;
        room.p2.nickname = nickname;
        room.p2.colorId = colorId;
        socket.join(roomId);
        io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
        return;
    }

    socket.join(roomId);
    let finalColor = colorId || 1;
    if (room.p1 && room.p1.colorId === finalColor) finalColor = (finalColor + 1) % 8;

    room.p2 = { id: socket.id, nickname: nickname || 'PLAYER 2', colorId: finalColor, isReady: false, role: 'p2' };
    io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
  });

  socket.on('update_lobby_settings', ({ roomId, nickname, colorId }) => {
      const room = rooms[roomId];
      if (!room) return;
      let target = (room.p1 && room.p1.id === socket.id) ? room.p1 : (room.p2 && room.p2.id === socket.id ? room.p2 : null);
      if (target) {
          if (nickname !== undefined) target.nickname = nickname.substring(0, 12).toUpperCase();
          if (colorId !== undefined) target.colorId = colorId;
          if (room.p1) room.p1.isReady = false;
          if (room.p2) room.p2.isReady = false;
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
      let sender = (room.p1 && room.p1.id === socket.id) ? room.p1 : (room.p2 && room.p2.id === socket.id ? room.p2 : null);
      if (sender) {
          io.to(roomId).emit('chat_message', { text: message.substring(0, 32), senderName: sender.nickname, colorId: sender.colorId });
      }
  });

  // --- GAME LOGIC (RELAY ONLY) ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || room.p1.id !== socket.id) return;

      try {
          room.gameState = 'KING_SELECTION';
          room.kingDeck = shuffle([...kingDeck]);
          room.mainDeck = shuffle([...mainDeck]); // STORE MAIN DECK
          room.p1Stats = { ...initialStats };
          room.p2Stats = { ...initialStats };
          room.p1KingCards = []; // Reset King Cards
          room.p2KingCards = [];
          room.turn = 'p1';
          
          const options = room.kingDeck.slice(0, 3);
          
          // Notify clients to start selection
          io.to(roomId).emit('king_selection_update', {
              phase: 'P1_CHOOSING',
              options: options,
              p1Kings: [],
              p2Kings: []
          });
      } catch (error) {
          console.error("Init Error", error);
      }
  });

  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1 && room.p1.id === socket.id;
      
      if (isP1) {
          // P1 Selected
          room.p1KingCards.push(card); // Store P1 King Card
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          room.kingDeck = shuffle(room.kingDeck);
          const options = room.kingDeck.slice(0, 3);
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              lastSelected: { card, player: 'p1' },
              p1Kings: room.p1KingCards,
              p2Kings: []
          });
      } else {
          // P2 Selected -> Start Game
          room.p2KingCards.push(card); // Store P2 King Card
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards 
          });

          // Trigger Deal
          setTimeout(() => {
              const p1Hand = [];
              const p2Hand = [];
              
              for(let i=0; i<6; i++) {
                  if(room.mainDeck.length) p1Hand.push(room.mainDeck.shift());
                  if(room.mainDeck.length) p2Hand.push(room.mainDeck.shift());
              }
              
              const kp = { id: 42, name: "KING POWER", type: 2, costB: 0, costW: 0, costC: 0, desc: "UNLOCK A PASSIVE BONUS", img: "👑", count: 1 };
              for(let k=0; k<4; k++) room.mainDeck.push({ ...kp, uniqueId: Math.random().toString() });
              room.mainDeck = shuffle(room.mainDeck);
              
              io.to(roomId).emit('start_dealing_sequence', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  p1Hand, p2Hand,
                  deckCount: room.mainDeck.length,
                  p1Nickname: room.p1.nickname,
                  p2Nickname: room.p2.nickname,
                  // IMPORTANT: Send King Cards back to confirm state
                  p1Kings: room.p1KingCards,
                  p2Kings: room.p2KingCards
              });
          }, 2000);
      }
  });

  socket.on('game_action', ({ roomId, action, payload }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Update server state for reconnects
      if (payload.newP1Stats) room.p1Stats = payload.newP1Stats;
      if (payload.newP2Stats) room.p2Stats = payload.newP2Stats;
      
      if (action === 'PLAY_CARD' || action === 'DISCARD_CARD') {
          // Recycle
          if (payload.card) {
             room.mainDeck.push({ ...payload.card, uniqueId: Math.random().toString() });
          }
      }
      
      // FIX: Update turn BEFORE emitting state sync to ensure everyone gets the new turn value
      if (action === 'END_TURN') {
          room.turn = (room.turn === 'p1' ? 'p2' : 'p1');
      }

      io.to(roomId).emit('state_sync', {
          p1Stats: payload.newP1Stats,
          p2Stats: payload.newP2Stats,
          turn: room.turn, // Now correctly updated
          deckCount: room.mainDeck.length,
          event: { type: action, cardId: payload.card?.id, player: (room.p1.id === socket.id ? 'p1' : 'p2') },
          logs: payload.logs,
          p1Nickname: room.p1 ? room.p1.nickname : "PLAYER 1",
          p2Nickname: room.p2 ? room.p2.nickname : "PLAYER 2"
      });
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      const isP1 = room.p1 && room.p1.id === socket.id;
      const role = isP1 ? 'p1' : 'p2';
      
      if (room.mainDeck.length > 0) {
          const card = room.mainDeck.shift();
          
          // Send specific card to the person who drew
          socket.emit('player_drew', { card, role });
          
          // Send generic "animation" event to the opponent (so they see card fly but not face)
          socket.to(roomId).emit('player_drew', { card: null, role });
          
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
      }
  });

  socket.on('activate_king_power', ({ roomId, p1Card, p2Card }) => {
      io.to(roomId).emit('king_power_triggered', { p1Card, p2Card });
  });

  socket.on('request_rematch', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (socket.id === room.p1.id) room.rematchP1 = true;
      if (socket.id === room.p2.id) room.rematchP2 = true;
      
      io.to(roomId).emit('rematch_update', { p1: !!room.rematchP1, p2: !!room.rematchP2 });
      
      if (room.rematchP1 && room.rematchP2) {
          room.rematchP1 = false;
          room.rematchP2 = false;
          // Trigger restart
          io.to(roomId).emit('game_restart');
      }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.p1 && room.p1.id === socket.id) {
            io.to(roomId).emit('host_left');
            delete rooms[roomId];
        } else if (room.p2 && room.p2.id === socket.id) {
            io.to(roomId).emit('opponent_disconnected');
            room.p2 = null; 
        }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
