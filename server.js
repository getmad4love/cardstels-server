
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
    
    // Cleanup empty room if exists
    if (rooms[roomId]) {
        const r = rooms[roomId];
        // If room is stale (no active sockets for a long time) or reset requested
        // For now, we trust the logic: if P1 is missing, it's a new room.
        // But if P1 exists, we treat it as a reconnect attempt.
    }

    if (rooms[roomId]) {
      // Reconnect Logic
      const room = rooms[roomId];
      console.log(`[LOBBY] Room ${roomId} exists. Attempting reconnect for Host.`);
      
      // If we are recovering a session, update the socket ID
      if (room.p1) {
          room.p1.id = socket.id; // Update socket ID
          if (nickname) room.p1.nickname = nickname; // Update nick if provided
          
          socket.join(roomId);
          socket.emit('room_created', roomId);
          io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
          
          // Determine Phase
          let currentPhase = room.gameState;
          
          // Send specific game state if playing
          if (currentPhase === 'PLAYING') {
             socket.emit('game_start_sync', {
                p1Stats: room.p1Stats,
                p2Stats: room.p2Stats,
                turn: room.turn,
                p1KingCards: room.p1KingCards,
                p2KingCards: room.p2KingCards,
                deckCount: room.mainDeck.length
             });
             socket.emit('hand_update', room.p1Hand);
          } else if (currentPhase === 'KING_SELECTION') {
             // Resend king selection state
             socket.emit('king_selection_update', {
                 phase: room.kingSelection.phase,
                 options: room.kingSelection.availableOptions,
                 p1Kings: room.p1KingCards,
                 p2Kings: room.p2KingCards
             });
          }
      } else {
          // This shouldn't happen for P1 if room exists, but just in case
          rooms[roomId].p1 = { id: socket.id, nickname: nickname || 'PLAYER 1', colorId: colorId || 0, isReady: false, role: 'p1' };
          socket.join(roomId);
          socket.emit('room_created', roomId);
          io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
      }
      return;
    }
    
    // New Room
    socket.join(roomId);
    
    rooms[roomId] = {
      id: roomId,
      p1: { id: socket.id, nickname: nickname || 'PLAYER 1', colorId: colorId || 0, isReady: false, role: 'p1' },
      p2: null,
      gameState: 'LOBBY', 
      mainDeck: [],
      kingDeck: [],
      p1Hand: [],
      p2Hand: [],
      p1KingCards: [],
      p2KingCards: [],
      p1Stats: null,
      p2Stats: null,
      turn: 'p1',
      turnCount: 1,
      kingSelection: {
          phase: 'IDLE', 
          availableOptions: [] 
      }
    };
    
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
    console.log(`[LOBBY] Join Room: ${roomId} by ${nickname}`);
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.p2) {
      // Reconnect P2
      console.log(`[LOBBY] Room ${roomId} full. Reconnecting P2.`);
      room.p2.id = socket.id;
      if (nickname) room.p2.nickname = nickname;
      
      socket.join(roomId);
      io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
      
      if (room.gameState === 'PLAYING') {
         socket.emit('game_start_sync', {
            p1Stats: room.p1Stats,
            p2Stats: room.p2Stats,
            turn: room.turn,
            p1KingCards: room.p1KingCards,
            p2KingCards: room.p2KingCards,
            deckCount: room.mainDeck.length
         });
         socket.emit('hand_update', room.p2Hand);
      } else if (room.gameState === 'KING_SELECTION') {
         socket.emit('king_selection_update', {
             phase: room.kingSelection.phase,
             options: room.kingSelection.availableOptions,
             p1Kings: room.p1KingCards,
             p2Kings: room.p2KingCards
         });
      }
      return;
    }

    // New P2 Join
    socket.join(roomId);
    let finalColor = colorId || 1;
    if (room.p1 && room.p1.colorId === finalColor) finalColor = (finalColor + 1) % 8;

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

  // --- GAME START & KING SELECTION FLOW ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.p1.id !== socket.id) return; // Only host can start

      console.log(`[GAME] Starting King Selection for Room ${roomId}`);

      room.gameState = 'KING_SELECTION';
      room.mainDeck = shuffle([...mainDeck]);
      room.kingDeck = shuffle([...kingDeck]);
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      
      const options = room.kingDeck.slice(0, 3);
      room.kingSelection = {
          phase: 'P1_CHOOSING',
          availableOptions: options
      };

      io.to(roomId).emit('king_selection_update', {
          phase: 'P1_CHOOSING',
          options: options,
          p1Kings: [],
          p2Kings: []
      });
  });

  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1 && room.p1.id === socket.id;
      const isP2 = room.p2 && room.p2.id === socket.id;

      if (isP1 && room.kingSelection.phase === 'P1_CHOOSING') {
          room.p1KingCards.push(card);
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          room.kingDeck = shuffle(room.kingDeck);
          
          const options = room.kingDeck.slice(0, 3);
          room.kingSelection.phase = 'P2_CHOOSING';
          room.kingSelection.availableOptions = options;

          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              lastSelected: { card, player: 'p1' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

      } else if (isP2 && room.kingSelection.phase === 'P2_CHOOSING') {
          room.p2KingCards.push(card);
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

          // START MAIN GAME
          console.log(`[GAME] Starting Gameplay for Room ${roomId}`);
          room.gameState = 'PLAYING';
          room.turn = 'p1';
          room.turnCount = 1;
          
          // Deal Hands
          room.p1Hand = room.mainDeck.splice(0, 6);
          room.p2Hand = room.mainDeck.splice(0, 6);

          io.to(roomId).emit('game_start_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              p1KingCards: room.p1KingCards,
              p2KingCards: room.p2KingCards,
              deckCount: room.mainDeck.length
          });

          // Private hands
          if (room.p1) io.to(room.p1.id).emit('hand_update', room.p1Hand);
          if (room.p2) io.to(room.p2.id).emit('hand_update', room.p2Hand);
      }
  });

  // --- GAMEPLAY SYNC ---

  socket.on('game_action_sync', ({ roomId, newState, event, logs, hands }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Authoritative State Update (trusting client calculation)
      if (newState.p1Stats) room.p1Stats = newState.p1Stats;
      if (newState.p2Stats) room.p2Stats = newState.p2Stats;
      if (newState.turn) room.turn = newState.turn;
      
      // Update Server Hands if provided (Critical for reconnects)
      if (hands) {
          if (hands.p1) room.p1Hand = hands.p1;
          if (hands.p2) room.p2Hand = hands.p2;
      }
      
      // Broadcast State
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          event: event, 
          logs: logs
      });
      
      // Sync private hands back to players (keeps them in sync)
      if (hands?.p1 && room.p1) io.to(room.p1.id).emit('hand_update', room.p1Hand);
      if (hands?.p2 && room.p2) io.to(room.p2.id).emit('hand_update', room.p2Hand);
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.mainDeck.length === 0) {
          // Empty deck handling
          return;
      }
      
      const card = room.mainDeck.shift();
      
      // Identify requester
      const isP1 = room.p1 && room.p1.id === socket.id;
      
      // Update server hand state
      if (isP1) {
          room.p1Hand.push(card);
      } else {
          room.p2Hand.push(card);
      }
      
      // Send card ONLY to requester
      socket.emit('card_drawn', { card });
      
      // Tell everyone deck count changed
      io.to(roomId).emit('deck_count_update', room.mainDeck.length);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
    
    // Check if user was a host or p2 in any room
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.p1 && room.p1.id === socket.id) {
            console.log(`[LOBBY] Host disconnected from room ${roomId}`);
            // Logic: we don't delete immediately to allow reconnect
        }
        if (room.p2 && room.p2.id === socket.id) {
            console.log(`[LOBBY] P2 disconnected from room ${roomId}`);
        }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
