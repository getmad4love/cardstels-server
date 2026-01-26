
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
    
    // If room exists but is empty (cleanup didn't happen), reset it
    if (rooms[roomId] && !rooms[roomId].p1 && !rooms[roomId].p2) {
        delete rooms[roomId];
    }

    if (rooms[roomId]) {
      // Allow host reconnect
      console.log(`[LOBBY] Room ${roomId} exists. Reconnecting Host/P1 with new socket ${socket.id}`);
      if (rooms[roomId].p1) {
          rooms[roomId].p1.id = socket.id;
          socket.join(roomId);
          socket.emit('room_created', roomId);
          io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
          
          // If game is in progress, send sync
          if (rooms[roomId].gameState !== 'LOBBY') {
             socket.emit('game_start_sync', {
                p1Stats: rooms[roomId].p1Stats,
                p2Stats: rooms[roomId].p2Stats,
                turn: rooms[roomId].turn,
                p1KingCards: rooms[roomId].p1KingCards,
                p2KingCards: rooms[roomId].p2KingCards,
                deckCount: rooms[roomId].mainDeck.length
             });
             socket.emit('hand_update', rooms[roomId].p1Hand);
          }
      } else {
          socket.emit('error', 'Room state invalid (P1 missing)');
      }
      return;
    }
    
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
      // Allow P2 Reconnect
      console.log(`[LOBBY] Room ${roomId} full. Reconnecting P2 with new socket ${socket.id}`);
      room.p2.id = socket.id;
      socket.join(roomId);
      io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
      
      // If game is in progress, send sync
      if (room.gameState !== 'LOBBY') {
         socket.emit('game_start_sync', {
            p1Stats: room.p1Stats,
            p2Stats: room.p2Stats,
            turn: room.turn,
            p1KingCards: room.p1KingCards,
            p2KingCards: room.p2KingCards,
            deckCount: room.mainDeck.length
         });
         socket.emit('hand_update', room.p2Hand);
      }
      return;
    }

    socket.join(roomId);
    
    let finalColor = colorId || 1;
    // Avoid color clash
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
          
          // Unready both if settings change to prevent starting with wrong settings
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

  socket.on('game_action_sync', ({ roomId, newState, event, logs }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Authoritative State Update (trusting client calculation for now)
      if (newState.p1Stats) room.p1Stats = newState.p1Stats;
      if (newState.p2Stats) room.p2Stats = newState.p2Stats;
      if (newState.turn) room.turn = newState.turn;
      
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          event: event, 
          logs: logs
      });
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // Safety check
      if (room.mainDeck.length === 0) {
          // Optional: Reshuffle discard pile logic could go here
          return;
      }
      
      const card = room.mainDeck.shift();
      
      // Send card ONLY to requester
      socket.emit('card_drawn', { card });
      
      // Tell everyone deck count changed
      io.to(roomId).emit('deck_count_update', room.mainDeck.length);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
    
    // We do NOT remove the player from the room immediately to allow reconnects.
    // Cleanup should happen if room is empty for X minutes or explicit leave.
    // For this simple implementation, we assume players might refresh.
    
    // Optional: Notify other player of potential disconnection (but dont end game immediately)
    // For lobby:
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.gameState === 'LOBBY') {
             // In lobby, we might want to show they are disconnected or just wait
             // If P1 leaves lobby, maybe destroy? But they might refresh.
             // Let's keep it persistent for now.
        }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
