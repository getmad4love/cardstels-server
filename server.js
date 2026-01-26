
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
      // King Selection specific state
      kingSelection: {
          phase: 'IDLE', // IDLE, P1_CHOOSING, P2_CHOOSING, DONE
          availableOptions: [] 
      }
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

  // --- GAME START & KING SELECTION FLOW ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.p1.id !== socket.id) return; // Only host

      // 1. Setup Data
      room.gameState = 'KING_SELECTION';
      room.mainDeck = shuffle([...mainDeck]); // Server authoritative shuffle of main deck
      room.kingDeck = shuffle([...kingDeck]); // Server authoritative shuffle of king deck
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      
      // 2. Start P1 Selection
      // Deal 3 cards for P1 to choose from
      const options = room.kingDeck.slice(0, 3);
      room.kingSelection = {
          phase: 'P1_CHOOSING',
          availableOptions: options
      };

      // Broadcast to everyone that King Selection started
      io.to(roomId).emit('king_selection_update', {
          phase: 'P1_CHOOSING',
          options: options, // Clients will filter visibility based on their role
          p1Kings: [],
          p2Kings: []
      });
  });

  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1.id === socket.id;
      const isP2 = room.p2.id === socket.id;

      if (isP1 && room.kingSelection.phase === 'P1_CHOOSING') {
          // P1 Selected
          room.p1KingCards.push(card);
          
          // Remove selected card from deck
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          
          // CRITICAL: Reshuffle remaining king deck before P2 draws
          room.kingDeck = shuffle(room.kingDeck);
          
          // Prepare P2 Options
          const options = room.kingDeck.slice(0, 3);
          room.kingSelection = {
              phase: 'P2_CHOOSING',
              availableOptions: options
          };

          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              lastSelected: { card, player: 'p1' }, // For visual feedback
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

      } else if (isP2 && room.kingSelection.phase === 'P2_CHOOSING') {
          // P2 Selected
          room.p2KingCards.push(card);
          
          // Clean up king deck (not strictly necessary if game starts, but good for endless logic)
          room.kingDeck = room.kingDeck.filter(c => c.id !== card.id);
          
          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

          // START MAIN GAME
          room.gameState = 'PLAYING';
          room.turn = 'p1';
          room.turnCount = 1;
          
          // Deal Hands
          room.p1Hand = room.mainDeck.splice(0, 6);
          room.p2Hand = room.mainDeck.splice(0, 6);

          // Send Game Start Signal
          io.to(roomId).emit('game_start_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              p1KingCards: room.p1KingCards,
              p2KingCards: room.p2KingCards,
              deckCount: room.mainDeck.length
          });

          // Send Private Hands
          io.to(room.p1.id).emit('hand_update', room.p1Hand);
          io.to(room.p2.id).emit('hand_update', room.p2Hand);
      }
  });

  // --- GAMEPLAY SYNC ---

  socket.on('game_action_sync', ({ roomId, newState, event, log }) => {
      const room = rooms[roomId];
      if (!room) return;

      // Update Server State
      if (newState.p1Stats) room.p1Stats = newState.p1Stats;
      if (newState.p2Stats) room.p2Stats = newState.p2Stats;
      if (newState.turn) room.turn = newState.turn;
      
      // If a card was played, we assume client managed their hand locally for speed,
      // but in a strict server we'd validate. Here we just sync.
      
      // Broadcast to all
      io.to(roomId).emit('state_sync', {
          p1Stats: room.p1Stats,
          p2Stats: room.p2Stats,
          turn: room.turn,
          event: event, 
          log: log
      });
  });
  
  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.mainDeck.length === 0) return;
      
      const isP1 = room.p1.id === socket.id;
      const card = room.mainDeck.shift();
      
      // Send card ONLY to requester
      socket.emit('card_drawn', { card });
      
      // Tell opponent deck count changed
      socket.broadcast.to(roomId).emit('deck_count_update', room.mainDeck.length);
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
