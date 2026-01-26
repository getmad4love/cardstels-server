
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
      turn: 'p1'
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
          // Shuffle on server so both players get same initial deck order if needed, 
          // but mainly we just relay the deck to clients.
          room.kingDeck = shuffle([...kingDeck]);
          room.p1Stats = { ...initialStats };
          room.p2Stats = { ...initialStats };
          
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

      // We just track phase and relay choices. Logic is client side now? 
      // No, for King Selection, server logic is simple enough to keep here to coordinate turns.
      
      const isP1 = room.p1 && room.p1.id === socket.id;
      
      if (isP1) {
          // P1 Selected
          // Filter out selected card from deck
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          // Shuffle rest
          room.kingDeck = shuffle(room.kingDeck);
          const options = room.kingDeck.slice(0, 3);
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              lastSelected: { card, player: 'p1' },
              p1Kings: [card],
              p2Kings: []
          });
      } else {
          // P2 Selected -> Start Game
          const p1Kings = []; // We don't persist these on server anymore, clients handle their own logic
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: [], // Clients will track their own kings based on selection events
              p2Kings: [] 
          });

          // Trigger Deal
          setTimeout(() => {
              // Generate decks on the fly to relay
              // This part assumes clients have the same DB, but we send basic structure
              // Ideally, Host sends the initial state fully. 
              // But for now, we just tell clients to start.
              
              // To ensure sync, let's create a main deck here indices or relay what Host sent.
              // Simplified: We assume clients know the deck or we send an RNG seed. 
              // Better: Server deals hands from the deck it has.
              
              // Re-create main deck (simplified) or use one passed in init?
              // We rely on the fact that we stored nothing complex.
              
              // Creating a simple deck of IDs to send? 
              // Actually, looking at previous code, init_game_setup sent a full mainDeck.
              // Let's use that if available, else empty.
              
              // SERVER DOES NOT HOLD GAME STATE LOGIC ANYMORE.
              // IT JUST RELAYS. 
              // HOWEVER, for initial deal, we need to send hands to avoid cheating visibility.
              
              // We'll rely on the existing mainDeck stored in init
              // Deal 6 to each
              const p1Hand = [];
              const p2Hand = [];
              // We need to re-init mainDeck because we didn't save it in the simplified version above?
              // Wait, we didn't save mainDeck in the new `init_game_setup`.
              // We should fix that.
              
              // But wait, the prompt asks for 1:1 logic.
              // The safest way is to let the clients handle it, but dealing needs to be synchronized.
              // Let's stick to the previous pattern: Server deals from the deck it got in Init.
          }, 2000);
      }
  });
  
  // FIX: Restore deck storage in init
  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      // ... existing code ...
      // ADD THIS BACK:
      const room = rooms[roomId];
      room.mainDeck = shuffle([...mainDeck]);
      // ...
  });
  
  // RE-IMPLEMENT select_king_card with proper deck management
  socket.removeAllListeners('select_king_card'); // Avoid dupes if hot reloading
  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;
      const isP1 = room.p1 && room.p1.id === socket.id;

      if (isP1) {
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          room.kingDeck = shuffle(room.kingDeck);
          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: room.kingDeck.slice(0, 3),
              lastSelected: { card, player: 'p1' },
              p1Kings: [card], p2Kings: []
          });
      } else {
          // P2 Selected
          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: [], p2Kings: [card]
          });
          
          // START GAME
          setTimeout(() => {
              const p1Hand = [];
              const p2Hand = [];
              // Add King Power cards before dealing?
              // Local logic: Main Deck -> Deal 6 -> Insert King Powers -> Shuffle -> Play
              // We will just deal 6 from current deck, then insert King Powers into Deck
              
              for(let i=0; i<6; i++) {
                  if(room.mainDeck.length) p1Hand.push(room.mainDeck.shift());
                  if(room.mainDeck.length) p2Hand.push(room.mainDeck.shift());
              }
              
              // Insert King Powers (id 42)
              const kp = { id: 42, name: "KING POWER", type: 2, costB: 0, costW: 0, costC: 0, desc: "UNLOCK A PASSIVE BONUS", img: "👑", count: 1 };
              for(let k=0; k<4; k++) room.mainDeck.push({ ...kp, uniqueId: Math.random().toString() });
              room.mainDeck = shuffle(room.mainDeck);
              
              io.to(roomId).emit('start_dealing_sequence', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  p1Hand, p2Hand,
                  deckCount: room.mainDeck.length,
                  p1Nickname: room.p1.nickname,
                  p2Nickname: room.p2.nickname
              });
          }, 2000);
      }
  });

  socket.on('game_action', ({ roomId, action, payload }) => {
      const room = rooms[roomId];
      if (!room) return;

      // CLIENT IS AUTHORITY. WE JUST BROADCAST.
      // Payload contains: newP1Stats, newP2Stats, logs, card, etc.
      
      // Update server state for reconnects
      if (payload.newP1Stats) room.p1Stats = payload.newP1Stats;
      if (payload.newP2Stats) room.p2Stats = payload.newP2Stats;
      
      // Handle Deck changes if card drawn/discarded
      // This is tricky if client manages deck. 
      // For simplicity in this specific "fix it now" request, we assume infinite deck or client didn't send deck.
      // We will just decrement deck count if needed or rely on client sync.
      
      // Actually, standard play recycles card to bottom.
      if (action === 'PLAY_CARD' || action === 'DISCARD_CARD') {
          // Recycle
          if (payload.card) {
             room.mainDeck.push({ ...payload.card, uniqueId: Math.random().toString() });
          }
      }
      
      // Broadcast to EVERYONE in room (including sender, to confirm receipt, 
      // OR sender updates optimistically and ignores this if timestamp matches? 
      // Frontend handles avoiding double-play via 'turn' check).
      io.to(roomId).emit('state_sync', {
          p1Stats: payload.newP1Stats,
          p2Stats: payload.newP2Stats,
          turn: action === 'END_TURN' ? (room.turn === 'p1' ? 'p2' : 'p1') : room.turn,
          deckCount: room.mainDeck.length,
          event: { type: action, cardId: payload.card?.id, player: (room.p1.id === socket.id ? 'p1' : 'p2') },
          logs: payload.logs
      });
      
      if (action === 'END_TURN') {
          room.turn = (room.turn === 'p1' ? 'p2' : 'p1');
      }
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      const isP1 = room.p1.id === socket.id;
      
      if (room.mainDeck.length > 0) {
          const card = room.mainDeck.shift();
          socket.emit('card_drawn', { card });
          socket.broadcast.to(roomId).emit('opponent_drew_card');
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
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
