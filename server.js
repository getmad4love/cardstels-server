
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
    
    if (rooms[roomId]) {
      // Reconnect Logic for Host
      const room = rooms[roomId];
      if (room.p1 && room.p1.nickname === nickname) {
          room.p1.id = socket.id;
          socket.join(roomId);
          socket.emit('room_created', roomId);
          io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
          
          if (room.gameState !== 'LOBBY') {
             socket.emit('state_sync', { 
                 p1Stats: room.p1Stats, p2Stats: room.p2Stats,
                 turn: room.turn,
                 deckCount: room.mainDeck.length
             });
          }
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
      kingSelection: { phase: 'IDLE', availableOptions: [] }
    };
    
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    
    if (room.p2) {
        if (room.p2.nickname === nickname) {
            room.p2.id = socket.id;
            socket.join(roomId);
            io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
            
            if (room.gameState !== 'LOBBY') {
                socket.emit('state_sync', { 
                    p1Stats: room.p1Stats, p2Stats: room.p2Stats,
                    turn: room.turn,
                    deckCount: room.mainDeck.length
                });
            }
        }
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

  // --- GAME LOGIC ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || room.p1.id !== socket.id) return;

      room.gameState = 'KING_SELECTION';
      room.mainDeck = shuffle([...mainDeck]);
      room.kingDeck = shuffle([...kingDeck]);
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      room.p1KingCards = [];
      room.p2KingCards = [];
      
      // Phase 1: P1 Choosing
      const options = room.kingDeck.slice(0, 3);
      room.kingSelection = { phase: 'P1_CHOOSING', availableOptions: options };

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
      
      if (isP1 && room.kingSelection.phase === 'P1_CHOOSING') {
          room.p1KingCards.push(card);
          // Apply King Stats Modifiers
          if(card.id === 'k_big') room.p1Stats.king = 60;
          if(card.id === 'k_son') { room.p1Stats.wall = 40; room.p1Stats.tower = 40; room.p1Stats.king = 20; }
          if(card.id === 'k_bunk') { room.p1Stats.wall = 60; room.p1Stats.tower = 10; room.p1Stats.king = 1; }
          if(card.id === 'k_hoard') { room.p1Stats.bricks += 30; room.p1Stats.weapons += 30; room.p1Stats.crystals += 30; }
          if(card.id === 'k_ind') { room.p1Stats.prodBricks++; room.p1Stats.prodWeapons++; room.p1Stats.prodCrystals++; room.p1Stats.bricks=10; room.p1Stats.weapons=10; room.p1Stats.crystals=10; }

          // Remove selected and options from deck to prevent duplicates, shuffle rest
          room.kingDeck = room.kingDeck.filter(c => !room.kingSelection.availableOptions.find(o => o.id === c.id));
          room.kingDeck = shuffle(room.kingDeck); 
          
          const options = room.kingDeck.slice(0, 3);
          room.kingSelection = { phase: 'P2_CHOOSING', availableOptions: options };

          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              lastSelected: { card, player: 'p1' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

      } else if (!isP1 && room.kingSelection.phase === 'P2_CHOOSING') {
          room.p2KingCards.push(card);
          // Apply King Stats Modifiers P2
          if(card.id === 'k_big') room.p2Stats.king = 60;
          if(card.id === 'k_son') { room.p2Stats.wall = 40; room.p2Stats.tower = 40; room.p2Stats.king = 20; }
          if(card.id === 'k_bunk') { room.p2Stats.wall = 60; room.p2Stats.tower = 10; room.p2Stats.king = 1; }
          if(card.id === 'k_hoard') { room.p2Stats.bricks += 30; room.p2Stats.weapons += 30; room.p2Stats.crystals += 30; }
          if(card.id === 'k_ind') { room.p2Stats.prodBricks++; room.p2Stats.prodWeapons++; room.p2Stats.prodCrystals++; room.p2Stats.bricks=10; room.p2Stats.weapons=10; room.p2Stats.crystals=10; }

          room.gameState = 'DEALING';
          room.turn = 'p1';
          
          // Deal initial hands
          room.p1Hand = [];
          room.p2Hand = [];
          for(let i=0; i<6; i++) {
              if(room.mainDeck.length > 0) room.p1Hand.push(room.mainDeck.shift());
              if(room.mainDeck.length > 0) room.p2Hand.push(room.mainDeck.shift());
          }

          // Insert King Powers into deck then shuffle
          const kingPowerCard = { id: 42, name: "KING POWER", type: 2, costB: 0, costW: 0, costC: 0, desc: "UNLOCK A PASSIVE BONUS", img: "👑", count: 1 };
          for(let k=0; k<4; k++) room.mainDeck.push({ ...kingPowerCard, uniqueId: Math.random().toString(36).substr(2, 9) });
          room.mainDeck = shuffle(room.mainDeck);

          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

          // Trigger Dealing Sequence
          setTimeout(() => {
              io.to(roomId).emit('start_dealing_sequence', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  p1Hand: room.p1Hand,
                  p2Hand: room.p2Hand,
                  deckCount: room.mainDeck.length,
                  p1Nickname: room.p1.nickname,
                  p2Nickname: room.p2.nickname
              });
          }, 2000);
      }
  });

  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      
      const isP1 = room.p1.id === socket.id;
      let newCard = null;
      if (room.mainDeck.length > 0) {
          newCard = room.mainDeck.shift();
          if (isP1) room.p1Hand.push(newCard);
          else room.p2Hand.push(newCard);
          
          // Send private draw
          socket.emit('card_drawn', { card: newCard });
          // Notify opponent
          socket.broadcast.to(roomId).emit('opponent_drew_card');
          // Update deck count
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
      }
  });

  socket.on('game_action', ({ roomId, action, payload }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1 && room.p1.id === socket.id;
      const playerRole = isP1 ? 'p1' : 'p2';

      if (action === 'PLAY_CARD' || action === 'DISCARD_CARD') {
          room.p1Stats = payload.newP1Stats;
          room.p2Stats = payload.newP2Stats;
          
          if (isP1) {
              room.p1Hand = room.p1Hand.filter(c => c.uniqueId !== payload.card.uniqueId);
          } else {
              room.p2Hand = room.p2Hand.filter(c => c.uniqueId !== payload.card.uniqueId);
          }
          // Add back to bottom
          room.mainDeck.push({ ...payload.card, uniqueId: Math.random().toString() });

          io.to(roomId).emit('state_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              deckCount: room.mainDeck.length,
              event: { type: action, cardId: payload.card.id, player: playerRole },
              logs: payload.logs
          });
      }

      if (action === 'END_TURN') {
          room.p1Stats = payload.newP1Stats;
          room.p2Stats = payload.newP2Stats;
          room.turn = isP1 ? 'p2' : 'p1';
          
          io.to(roomId).emit('state_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              deckCount: room.mainDeck.length,
              event: { type: 'END_TURN', player: playerRole },
              logs: payload.logs
          });
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
