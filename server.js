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
      p1KingCards: [], 
      p2KingCards: [],
      turn: 'p1', // SERVER IS THE SOURCE OF TRUTH FOR TURNS
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

  // --- GAME LOGIC (STRICT SERVER AUTHORITY) ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || room.p1.id !== socket.id) return;

      try {
          console.log(`[GAME] Init setup for room ${roomId}`);
          room.gameState = 'KING_SELECTION';
          room.kingDeck = shuffle([...kingDeck]);
          room.mainDeck = shuffle([...mainDeck]); 
          room.p1Stats = { ...initialStats };
          room.p2Stats = { ...initialStats };
          room.p1KingCards = []; 
          room.p2KingCards = [];
          room.turn = 'p1'; // Reset turn to P1
          
          const options = room.kingDeck.slice(0, 3);
          
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
          room.p1KingCards.push(card); 
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
          room.p2KingCards.push(card); 
          
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
              
              // Ensure turn is P1 at start
              room.turn = 'p1';

              io.to(roomId).emit('start_dealing_sequence', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  p1Hand, p2Hand,
                  deckCount: room.mainDeck.length,
                  p1Nickname: room.p1.nickname,
                  p2Nickname: room.p2.nickname,
                  p1Kings: room.p1KingCards,
                  p2Kings: room.p2KingCards
              });
          }, 2000);
      }
  });

  socket.on('game_action', ({ roomId, action, payload }) => {
      const room = rooms[roomId];
      if (!room) return;

      // 1. IDENTIFY WHO IS SENDING THE ACTION
      const isP1 = room.p1 && room.p1.id === socket.id;
      const isP2 = room.p2 && room.p2.id === socket.id;
      const playerRole = isP1 ? 'p1' : (isP2 ? 'p2' : null);

      if (!playerRole) {
          console.warn(`[GAME] Action from unknown socket ${socket.id} in room ${roomId}`);
          return;
      }

      // 2. STRICT TURN VALIDATION FOR END_TURN
      if (action === 'END_TURN') {
          // If the player requesting END_TURN is NOT the player currently on turn
          if (room.turn !== playerRole) {
              console.warn(`[GAME] Turn Mismatch: ${playerRole} tried to end turn, but it is ${room.turn}'s turn.`);
              // We ignore the logic, BUT we emit a state sync to correct the client's desynced state
              io.to(socket.id).emit('state_sync', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  turn: room.turn, // Force correct turn
                  deckCount: room.mainDeck.length,
                  // No event, just a silent fix
                  p1Nickname: room.p1 ? room.p1.nickname : "PLAYER 1",
                  p2Nickname: room.p2 ? room.p2.nickname : "PLAYER 2"
              });
              return;
          }
          
          // If valid, flip the turn
          room.turn = (room.turn === 'p1' ? 'p2' : 'p1');
          console.log(`[GAME] Turn passed to ${room.turn}`);
      }

      // 3. UPDATE STATS (Payload Trust)
      if (payload.newP1Stats) room.p1Stats = payload.newP1Stats;
      if (payload.newP2Stats) room.p2Stats = payload.newP2Stats;
      
      // 4. DECK MANAGEMENT
      if (action === 'PLAY_CARD' || action === 'DISCARD_CARD') {
          if (payload.card) {
             room.mainDeck.push({ ...payload.card, uniqueId: Math.random().toString() });
          }
      }
      
      // 5. EMIT NEW STATE (With the already updated turn)
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn, // This is now the definitive, updated turn
          deckCount: room.mainDeck.length,
          event: { type: action, cardId: payload.card?.id, player: playerRole },
          logs: payload.logs,
          p1Nickname: room.p1 ? room.p1.nickname : "PLAYER 1",
          p2Nickname: room.p2 ? room.p2.nickname : "PLAYER 2"
      });
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      // Note: Drawing logic usually happens automatically or at start of turn, 
      // but if manual draw is needed, we should probably check turn too. 
      // For now, leaving as is to avoid breaking flow.
      
      if (room.mainDeck.length > 0) {
          const card = room.mainDeck.shift();
          socket.emit('card_drawn', { card });
          socket.broadcast.to(roomId).emit('opponent_drew_card');
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
      }
  });
  
  socket.on('activate_king_power', ({ roomId, p1Card, p2Card }) => {
      // Proxy event to clients
      io.to(roomId).emit('king_power_triggered', { p1Card, p2Card });
  });

  socket.on('request_rematch', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      const isP1 = room.p1 && room.p1.id === socket.id;
      const isP2 = room.p2 && room.p2.id === socket.id;
      
      if (!room.rematch) room.rematch = { p1: false, p2: false };
      
      if (isP1) room.rematch.p1 = true;
      if (isP2) room.rematch.p2 = true;
      
      io.to(roomId).emit('rematch_update', room.rematch);
      
      if (room.rematch.p1 && room.rematch.p2) {
          room.rematch = { p1: false, p2: false };
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
            if (room.p1) room.p1.isReady = false; // Reset host ready state
        }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
