
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

// Health check route for Render
app.get('/', (req, res) => {
    res.send('Cardstels Game Server is Running');
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from any frontend (Itch.io, Vercel, Localhost)
        methods: ["GET", "POST"]
    }
});

// Store room states in memory
// Structure: { roomId: { p1: { id, nickname, colorId, isReady }, p2: { ... }, deck: [] } }
const rooms = {};

// Helper to find which room a socket belongs to
const findRoomBySocketId = (socketId) => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.p1?.id === socketId || room.p2?.id === socketId) {
            return roomId;
        }
    }
    return null;
};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // --- LOBBY MANAGEMENT ---

    socket.on('create_room', (roomId) => {
        if (rooms[roomId]) {
            // Room exists, try to rejoin as host if ID matches (reconnection logic) or fail
            // For simplicity, we assume generic fail if taken, unless p1 is missing
            if (rooms[roomId].p1) {
                socket.emit('error', 'Room already exists and has a host.');
                return;
            }
        }

        // Initialize room
        rooms[roomId] = {
            p1: { 
                id: socket.id, 
                nickname: 'HOST', 
                colorId: 0, 
                isReady: false 
            },
            p2: null,
            deck: null // Will be populated on game start
        };

        socket.join(roomId);
        socket.emit('room_created', roomId);
        
        // Broadcast initial state to room (just p1)
        io.to(roomId).emit('lobby_update', rooms[roomId]);
        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', 'Room does not exist.');
            return;
        }

        if (room.p2) {
            socket.emit('error', 'Room is full.');
            return;
        }

        // Add Player 2
        room.p2 = {
            id: socket.id,
            nickname: 'GUEST',
            colorId: 1, // Default distinct color
            isReady: false
        };

        socket.join(roomId);
        
        // Notify everyone in room of update
        io.to(roomId).emit('lobby_update', room);
        console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on('update_player_info', ({ roomId, nickname, colorId }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.p1 && room.p1.id === socket.id) {
            room.p1.nickname = nickname;
            room.p1.colorId = colorId;
        } else if (room.p2 && room.p2.id === socket.id) {
            room.p2.nickname = nickname;
            room.p2.colorId = colorId;
        }

        io.to(roomId).emit('lobby_update', room);
    });

    socket.on('toggle_ready', ({ roomId, isReady }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.p1 && room.p1.id === socket.id) {
            room.p1.isReady = isReady;
        } else if (room.p2 && room.p2.id === socket.id) {
            room.p2.isReady = isReady;
        }

        io.to(roomId).emit('lobby_update', room);
    });

    socket.on('start_game_request', ({ roomId, deckData }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Verify both ready (Host should enforce this, but double check)
        if (room.p1?.isReady && room.p2?.isReady) {
            // Store the initial deck so we could potentially handle reconnects/sync
            room.deck = deckData.deck;

            io.to(roomId).emit('game_start', {
                deckData: deckData,
                p1: room.p1,
                p2: room.p2
            });
            console.log(`Game started in room ${roomId}`);
        }
    });

    // --- GAMEPLAY SYNC ---

    socket.on('game_action', ({ roomId, action }) => {
        // Forward actions (PLAY, DISCARD, END_TURN) to the opponent
        // We use socket.to(roomId) which sends to everyone in room EXCEPT sender
        socket.to(roomId).emit('opponent_action', action);
    });

    socket.on('king_selected', ({ roomId, card, role }) => {
        // Notify opponent that I selected a king card
        socket.to(roomId).emit('opponent_king_selected', { card, role });
    });

    socket.on('chat_message', ({ roomId, message, color }) => {
        // Broadcast chat to everyone including sender (or sender can optimize locally)
        // Using io.to includes sender
        io.to(roomId).emit('chat_message', {
            text: message,
            senderId: socket.id,
            color: color
        });
    });

    // --- DISCONNECT HANDLING ---

    socket.on('disconnect', () => {
        const roomId = findRoomBySocketId(socket.id);
        if (roomId) {
            const room = rooms[roomId];
            
            // Notify other player
            socket.to(roomId).emit('opponent_disconnected');
            
            // Logic: If Host (P1) leaves, destroy room? If Guest (P2) leaves, open slot?
            // For simplicity in this version, we act destructively or clean up
            if (room.p1?.id === socket.id) {
                // Host left
                room.p1 = null;
                // Ideally, kick p2 or migrate host, but for now we basically reset
                // If P2 exists, they get 'opponent_disconnected' and game ends
            } else if (room.p2?.id === socket.id) {
                // Guest left
                room.p2 = null;
                room.p1.isReady = false; // Reset host ready status
                // Notify host via lobby update if still in lobby
                io.to(roomId).emit('lobby_update', room);
            }

            // If room is empty, delete it
            if (!room.p1 && !room.p2) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted`);
            }
        }
        console.log(`User Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
