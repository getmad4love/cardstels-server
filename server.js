
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

const initialGameStats = { 
    built: 0, dmg: 0, taken: 0, cardsUsed: 0, cardsDiscarded: 0, totalCost: 0 
};

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

// Check win conditions
const checkWinCondition = (myStats, opStats, myName, opName) => {
    if (myStats.wall >= 200) return { winner: true, reason: `${myName} WALL PIERCES THE HEAVENS!` };
    if (myStats.tower >= 150) return { winner: true, reason: `${myName} TOWER REACHED MAXIMUM HEIGHT!` };
    if (myStats.king >= 100) return { winner: true, reason: `${myName} KING HAS REACHED MAXIMUM POWER!` };
    if (opStats.king <= 0) return { winner: true, reason: `${opName} KING HAS BEEN DESTROYED!` };
    return null;
};

// Helper to calculate total HP (Wall + Tower + King)
const getTotalHP = (stats) => (stats.wall || 0) + (stats.tower || 0) + (stats.king || 0);

io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  // --- LOBBY LOGIC ---

  socket.on('create_room', ({ roomId, nickname, colorId }) => {
    console.log(`[LOBBY] Create Room Request: ${roomId} by ${nickname} (${socket.id})`);
    
    if (rooms[roomId]) {
      const room = rooms[roomId];
      room.p1.id = socket.id;
      room.p1.nickname = nickname;
      room.p1.colorId = colorId;
      
      socket.join(roomId);
      socket.emit('room_created', roomId);
      io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
      
      if (room.gameState !== 'LOBBY') {
         socket.emit('state_sync', { 
             p1Stats: room.p1Stats, p2Stats: room.p2Stats,
             turn: room.turn,
             deckCount: room.mainDeck.length,
             p1KingCards: room.p1KingCards,
             p2KingCards: room.p2KingCards,
             gameStats: room.gameStats // Sync stats
         });
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
      discardPile: [], // New discard pile
      kingDeck: [],
      p1Hand: [],
      p2Hand: [],
      p1KingCards: [],
      p2KingCards: [],
      p1Stats: null,
      p2Stats: null,
      gameStats: { p1: {...initialGameStats}, p2: {...initialGameStats} },
      turn: 'p1',
      turnCounts: { p1: 1, p2: 0 }, // Independent turn counts
      shuffles: { p1: 1, p2: 1 },
      kingSelection: { phase: 'IDLE', availableOptions: [] },
      rematchP1: false,
      rematchP2: false
    };
    
    socket.emit('room_created', roomId);
    io.to(roomId).emit('lobby_update', { p1: rooms[roomId].p1, p2: rooms[roomId].p2 });
  });

  socket.on('join_room', ({ roomId, nickname, colorId }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    
    if (room.p2) {
        // Reconnect Logic
        room.p2.id = socket.id;
        room.p2.nickname = nickname;
        room.p2.colorId = colorId;
        socket.join(roomId);
        io.to(roomId).emit('lobby_update', { p1: room.p1, p2: room.p2 });
        if (room.gameState !== 'LOBBY') {
            socket.emit('state_sync', { 
                p1Stats: room.p1Stats, p2Stats: room.p2Stats,
                turn: room.turn,
                deckCount: room.mainDeck.length,
                p1KingCards: room.p1KingCards,
                p2KingCards: room.p2KingCards,
                gameStats: room.gameStats
            });
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
          
          // Only reset ready state for the player who made changes
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
      let sender = (room.p1 && room.p1.id === socket.id) ? room.p1 : (room.p2 && room.p2.id === socket.id ? room.p2 : null);
      if (sender) {
          io.to(roomId).emit('chat_message', { text: message.substring(0, 32), senderName: sender.nickname, colorId: sender.colorId, context: 'LOBBY' });
      }
  });

  socket.on('chat_message', ({ roomId, message }) => {
      const room = rooms[roomId];
      if (!room) return;
      let sender = (room.p1 && room.p1.id === socket.id) ? room.p1 : (room.p2 && room.p2.id === socket.id ? room.p2 : null);
      if (sender) {
          io.to(roomId).emit('chat_message', { text: message.substring(0, 32), senderName: sender.nickname, colorId: sender.colorId, context: 'GAME' });
      }
  });

  // --- GAME LOGIC ---

  socket.on('init_game_setup', ({ roomId, kingDeck, mainDeck, initialStats }) => {
      const room = rooms[roomId];
      if (!room || room.p1.id !== socket.id) return; 

      room.gameState = 'KING_SELECTION';
      room.mainDeck = shuffle([...mainDeck]);
      room.discardPile = []; // Init discard
      room.kingDeck = shuffle([...kingDeck]);
      room.p1Stats = { ...initialStats };
      room.p2Stats = { ...initialStats };
      room.p1KingCards = [];
      room.p2KingCards = [];
      room.gameStats = { p1: {...initialGameStats}, p2: {...initialGameStats} };
      room.turnCounts = { p1: 1, p2: 0 };
      room.shuffles = { p1: 1, p2: 1 };
      room.rematchP1 = false;
      room.rematchP2 = false;
      
      const options = room.kingDeck.slice(0, 3);
      room.kingSelection = { phase: 'P1_CHOOSING', availableOptions: options };

      io.to(roomId).emit('game_restart'); // Reset clients to selection screen
      io.to(roomId).emit('king_selection_update', {
          phase: 'P1_CHOOSING',
          options: options,
          shufflesLeft: room.shuffles.p1,
          p1Kings: [],
          p2Kings: []
      });
  });

  socket.on('request_rematch', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.p1 && room.p1.id === socket.id) {
          room.rematchP1 = true;
      } else if (room.p2 && room.p2.id === socket.id) {
          room.rematchP2 = true;
      }
      
      io.to(roomId).emit('rematch_update', { p1: room.rematchP1 || false, p2: room.rematchP2 || false });

      // If both accepted, trigger the Host (P1) to restart the game
      if (room.rematchP1 && room.rematchP2) {
          // Tell clients (specifically P1) to run initGame()
          io.to(roomId).emit('start_rematch');
      }
  });

  socket.on('leave_room', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.p1 && room.p1.id === socket.id) {
          io.to(roomId).emit('host_left');
          delete rooms[roomId];
      } else if (room.p2 && room.p2.id === socket.id) {
          io.to(roomId).emit('opponent_disconnected', { nickname: room.p2.nickname });
          room.p2 = null; 
      }
  });

  socket.on('shuffle_king_deck', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      const isP1 = room.p1 && room.p1.id === socket.id;
      const role = isP1 ? 'p1' : 'p2';
      
      if (room.shuffles[role] > 0) {
          if ((isP1 && room.kingSelection.phase === 'P1_CHOOSING') || (!isP1 && room.kingSelection.phase === 'P2_CHOOSING')) {
              io.to(roomId).emit('king_selection_update', {
                  phase: room.kingSelection.phase,
                  options: room.kingSelection.availableOptions,
                  shufflesLeft: room.shuffles[role],
                  p1Kings: room.p1KingCards,
                  p2Kings: room.p2KingCards,
                  isShuffling: true
              });

              setTimeout(() => {
                  room.shuffles[role]--;
                  room.kingDeck = shuffle(room.kingDeck);
                  const newOptions = room.kingDeck.slice(0, 3);
                  room.kingSelection.availableOptions = newOptions;
                  io.to(roomId).emit('king_selection_update', {
                      phase: room.kingSelection.phase,
                      options: newOptions,
                      shufflesLeft: room.shuffles[role],
                      p1Kings: room.p1KingCards,
                      p2Kings: room.p2KingCards,
                      isShuffling: false
                  });
              }, 1500);
          }
      }
  });

  socket.on('select_king_card', ({ roomId, card }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1 && room.p1.id === socket.id;
      
      if (isP1 && room.kingSelection.phase === 'P1_CHOOSING') {
          room.p1KingCards.push(card);
          // Apply Modifiers
          if(card.id === 'k_big') room.p1Stats.king = 60;
          if(card.id === 'k_son') { room.p1Stats.wall = 40; room.p1Stats.tower = 20; room.p1Stats.king = 10; }
          if(card.id === 'k_bunk') { room.p1Stats.wall = 60; room.p1Stats.tower = 10; room.p1Stats.king = 1; }
          if(card.id === 'k_hoard') { room.p1Stats.bricks += 30; room.p1Stats.weapons += 30; room.p1Stats.crystals += 30; }
          if(card.id === 'k_ind') { room.p1Stats.prodBricks++; room.p1Stats.prodWeapons++; room.p1Stats.prodCrystals++; room.p1Stats.bricks=10; room.p1Stats.weapons=10; room.p1Stats.crystals=10; }

          room.kingDeck = room.kingDeck.filter(c => !room.kingSelection.availableOptions.find(o => o.id === c.id));
          room.kingDeck = shuffle(room.kingDeck);
          const options = room.kingDeck.slice(0, 3);
          room.kingSelection = { phase: 'P2_CHOOSING', availableOptions: options };

          io.to(roomId).emit('king_selection_update', {
              phase: 'P2_CHOOSING',
              options: options,
              shufflesLeft: room.shuffles.p2,
              lastSelected: { card, player: 'p1' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

      } else if (!isP1 && room.kingSelection.phase === 'P2_CHOOSING') {
          room.p2KingCards.push(card);
          // Apply Modifiers
          if(card.id === 'k_big') room.p2Stats.king = 60;
          if(card.id === 'k_son') { room.p2Stats.wall = 40; room.p2Stats.tower = 20; room.p2Stats.king = 10; }
          if(card.id === 'k_bunk') { room.p2Stats.wall = 60; room.p2Stats.tower = 10; room.p2Stats.king = 1; }
          if(card.id === 'k_hoard') { room.p2Stats.bricks += 30; room.p2Stats.weapons += 30; room.p2Stats.crystals += 30; }
          if(card.id === 'k_ind') { room.p2Stats.prodBricks++; room.p2Stats.prodWeapons++; room.p2Stats.prodCrystals++; room.p2Stats.bricks=10; room.p2Stats.weapons=10; room.p2Stats.crystals=10; }

          room.gameState = 'DEALING';
          room.turn = 'p1';
          room.turnCounts = { p1: 1, p2: 0 };
          
          room.p1Hand = [];
          room.p2Hand = [];
          for(let i=0; i<6; i++) {
              if(room.mainDeck.length > 0) room.p1Hand.push(room.mainDeck.shift());
              if(room.mainDeck.length > 0) room.p2Hand.push(room.mainDeck.shift());
          }

          const kingPowerCard = { id: 42, name: "KING POWER", type: 2, costB: 0, costW: 0, costC: 0, desc: "UNLOCK A PASSIVE BONUS", img: "👑", count: 1 };
          for(let k=0; k<4; k++) room.mainDeck.push({ ...kingPowerCard, uniqueId: Math.random().toString(36).substr(2, 9) });
          room.mainDeck = shuffle(room.mainDeck);

          io.to(roomId).emit('king_selection_update', {
              phase: 'DONE',
              lastSelected: { card, player: 'p2' },
              p1Kings: room.p1KingCards,
              p2Kings: room.p2KingCards
          });

          setTimeout(() => {
              io.to(roomId).emit('start_dealing_sequence', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  p1Hand: room.p1Hand,
                  p2Hand: room.p2Hand,
                  deckCount: room.mainDeck.length,
                  p1Nickname: room.p1.nickname,
                  p2Nickname: room.p2.nickname,
                  p1Kings: room.p1KingCards,
                  p2Kings: room.p2KingCards
              });
          }, 2000);
      }
  });

  socket.on('draw_card_req', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      
      const isP1 = room.p1.id === socket.id;
      
      // DECK EMPTY LOGIC (Refills from discardPile)
      if (room.mainDeck.length === 0 && room.discardPile.length > 0) {
          room.mainDeck = shuffle(room.discardPile);
          room.discardPile = [];
          // Force deck count update
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
      }

      let newCard = null;
      if (room.mainDeck.length > 0) {
          newCard = room.mainDeck.shift();
          
          // Calculate if card has cost (to properly consume Madness)
          // Prevents King Power (ID 42) or Special cards (Type 4) from consuming Madness buff.
          // Explicit casting to Number to ensure safety
          const hasCost = (Number(newCard.costB) || 0) > 0 || (Number(newCard.costW) || 0) > 0 || (Number(newCard.costC) || 0) > 0;
          const cardType = Number(newCard.type);

          // Madness Handling
          let isMadnessDraw = false;
          if (isP1) {
              // Madness only consumed if card isn't special AND has a resource cost
              if (room.p1Stats.madnessActive && cardType !== 4 && hasCost) { 
                  room.p1Stats.madnessActive = false;
                  newCard.isMadness = true;
                  isMadnessDraw = true;
              }
              room.p1Hand.push(newCard);
          } else {
              if (room.p2Stats.madnessActive && cardType !== 4 && hasCost) {
                  room.p2Stats.madnessActive = false;
                  newCard.isMadness = true;
                  isMadnessDraw = true;
              }
              room.p2Hand.push(newCard);
          }
          
          socket.emit('card_drawn', { card: newCard });
          socket.broadcast.to(roomId).emit('opponent_drew_card');
          io.to(roomId).emit('deck_count_update', room.mainDeck.length);
          
          if (isMadnessDraw) {
              io.to(roomId).emit('state_sync', {
                  p1Stats: room.p1Stats,
                  p2Stats: room.p2Stats,
                  turn: room.turn,
                  deckCount: room.mainDeck.length,
                  gameStats: room.gameStats
              });
          }
      }
  });

  socket.on('activate_king_power', ({ roomId, p1Card, p2Card }) => {
      const room = rooms[roomId];
      if (!room) return;
      
      if(p1Card) room.p1KingCards.push(p1Card);
      if(p2Card) room.p2KingCards.push(p2Card);
      
      io.to(roomId).emit('king_power_triggered', { p1Card, p2Card });
  });

  const calculateBuildStats = (oldStats, newStats) => {
      let built = 0;
      if (newStats.wall > oldStats.wall) built += (newStats.wall - oldStats.wall);
      if (newStats.tower > oldStats.tower) built += (newStats.tower - oldStats.tower);
      if (newStats.king > oldStats.king) built += (newStats.king - oldStats.king);
      return built;
  };

  socket.on('game_action', ({ roomId, action, payload }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1 && room.p1.id === socket.id;
      const playerRole = isP1 ? 'p1' : 'p2';
      const statsKey = playerRole;

      if (action === 'PLAY_CARD' || action === 'DISCARD_CARD') {
          // --- STATS TRACKING ---
          if (action === 'PLAY_CARD') {
              room.gameStats[statsKey].cardsUsed++;
              
              if (isP1) {
                  // P1 BUILT
                  const p1Built = calculateBuildStats(room.p1Stats, payload.newP1Stats);
                  if (p1Built > 0) room.gameStats.p1.built += p1Built;

                  // P1 DAMAGE DEALT (P2 DAMAGE TAKEN)
                  const dKing = room.p2Stats.king - payload.newP2Stats.king;
                  const dTower = room.p2Stats.tower - payload.newP2Stats.tower;
                  const dWall = room.p2Stats.wall - payload.newP2Stats.wall;
                  const totalDmg = (dKing > 0 ? dKing : 0) + (dTower > 0 ? dTower : 0) + (dWall > 0 ? dWall : 0);
                  if (totalDmg > 0) {
                      room.gameStats.p1.dmg += totalDmg;
                      room.gameStats.p2.taken += totalDmg;
                  }
                  
                  const cost = (room.p1Stats.bricks - payload.newP1Stats.bricks) + (room.p1Stats.weapons - payload.newP1Stats.weapons) + (room.p1Stats.crystals - payload.newP1Stats.crystals);
                  if (cost > 0) room.gameStats.p1.totalCost += cost;
              } else {
                  // P2 BUILT
                  const p2Built = calculateBuildStats(room.p2Stats, payload.newP2Stats);
                  if (p2Built > 0) room.gameStats.p2.built += p2Built;

                  // P2 DAMAGE DEALT (P1 DAMAGE TAKEN)
                  const dKing = room.p1Stats.king - payload.newP1Stats.king;
                  const dTower = room.p1Stats.tower - payload.newP1Stats.tower;
                  const dWall = room.p1Stats.wall - payload.newP1Stats.wall;
                  const totalDmg = (dKing > 0 ? dKing : 0) + (dTower > 0 ? dTower : 0) + (dWall > 0 ? dWall : 0);
                  if (totalDmg > 0) {
                      room.gameStats.p2.dmg += totalDmg;
                      room.gameStats.p1.taken += totalDmg;
                  }
                  
                  const cost = (room.p2Stats.bricks - payload.newP2Stats.bricks) + (room.p2Stats.weapons - payload.newP2Stats.weapons) + (room.p2Stats.crystals - payload.newP2Stats.crystals);
                  if (cost > 0) room.gameStats.p2.totalCost += cost;
              }
          } else {
              room.gameStats[statsKey].cardsDiscarded++;
          }

          // SERVER SAFEGUARD: Prevent client from overwriting madnessActive state due to race conditions
          const wasMadnessP1 = room.p1Stats.madnessActive;
          const wasMadnessP2 = room.p2Stats.madnessActive;
          const isMadnessCard = payload.card.name === 'MADNESS' || payload.card.id === 107;

          room.p1Stats = payload.newP1Stats;
          room.p2Stats = payload.newP2Stats;
          
          if (!isMadnessCard) {
              if (isP1) room.p1Stats.madnessActive = wasMadnessP1;
              else room.p2Stats.madnessActive = wasMadnessP2;
          }
          
          if (isP1) room.p1Hand = room.p1Hand.filter(c => c.uniqueId !== payload.card.uniqueId);
          else room.p2Hand = room.p2Hand.filter(c => c.uniqueId !== payload.card.uniqueId);
          
          if (String(payload.card.id) !== '42' && payload.card.id !== 42) {
              room.discardPile.push({ ...payload.card, uniqueId: Math.random().toString() });
          }

          io.to(roomId).emit('state_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              deckCount: room.mainDeck.length,
              event: { type: action, cardId: payload.card.id, player: playerRole, cardDesc: payload.card.desc, cardType: payload.card.type },
              logs: payload.logs,
              p1KingCards: room.p1KingCards, 
              p2KingCards: room.p2KingCards,
              gameStats: room.gameStats 
          });
      }

      if (action === 'END_TURN') {
          const p1Prev = room.p1Stats; const p2Prev = room.p2Stats;
          
          const wasMadnessP1 = room.p1Stats.madnessActive;
          const wasMadnessP2 = room.p2Stats.madnessActive;

          // CALCULATE BUILD STATS FOR END TURN (e.g. Bob, production doesn't count as 'built' usually, but HP does)
          if (isP1) {
              const p1Built = calculateBuildStats(p1Prev, payload.newP1Stats);
              if (p1Built > 0) room.gameStats.p1.built += p1Built;
          } else {
              const p2Built = calculateBuildStats(p2Prev, payload.newP2Stats);
              if (p2Built > 0) room.gameStats.p2.built += p2Built;
          }

          room.p1Stats = payload.newP1Stats;
          room.p2Stats = payload.newP2Stats;
          
          room.p1Stats.madnessActive = wasMadnessP1;
          room.p2Stats.madnessActive = wasMadnessP2;
          
          // Approximate archer/burn damage tracking
          if (isP1) {
              const d = (p2Prev.king - room.p2Stats.king) + (p2Prev.tower - room.p2Stats.tower) + (p2Prev.wall - room.p2Stats.wall);
              if (d > 0) { room.gameStats.p1.dmg += d; room.gameStats.p2.taken += d; }
          } else {
              const d = (p1Prev.king - room.p1Stats.king) + (p1Prev.tower - room.p1Stats.tower) + (p1Prev.wall - room.p1Stats.wall);
              if (d > 0) { room.gameStats.p2.dmg += d; room.gameStats.p1.taken += d; }
          }

          room.turn = isP1 ? 'p2' : 'p1';
          if (room.turn === 'p1') room.turnCounts.p1++; else room.turnCounts.p2++;
          
          io.to(roomId).emit('state_sync', {
              p1Stats: room.p1Stats,
              p2Stats: room.p2Stats,
              turn: room.turn,
              turnCounts: room.turnCounts, 
              deckCount: room.mainDeck.length,
              event: { type: 'END_TURN', player: playerRole },
              logs: payload.logs,
              p1KingCards: room.p1KingCards,
              p2KingCards: room.p2KingCards,
              gameStats: room.gameStats
          });
      }

      // --- WIN CONDITION CHECK ---
      const p1Win = checkWinCondition(room.p1Stats, room.p2Stats, room.p1.nickname, room.p2.nickname);
      const p2Win = checkWinCondition(room.p2Stats, room.p1Stats, room.p2.nickname, room.p1.nickname);

      if (p1Win) {
          room.gameState = 'WON';
          io.to(roomId).emit('game_over', { winner: 'p1', reason: p1Win.reason });
      } else if (p2Win) {
          room.gameState = 'WON';
          io.to(roomId).emit('game_over', { winner: 'p2', reason: p2Win.reason });
      }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.p1 && room.p1.id === socket.id) {
            io.to(roomId).emit('host_left');
            delete rooms[roomId];
        } else if (room.p2 && room.p2.id === socket.id) {
            io.to(roomId).emit('opponent_disconnected', { nickname: room.p2.nickname });
            room.p2 = null; 
        }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
