
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Health check route for Render
app.get('/', (req, res) => {
    res.send('Cardstels Game Server is Running (ESM)');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
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
            // Room exists, check if p1 is missing (rejoin possibility)
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

        // Verify both ready
        if (room.p1?.isReady && room.p2?.isReady) {
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
        // Forward actions to opponent
        socket.to(roomId).emit('opponent_action', action);
    });

    socket.on('king_selected', ({ roomId, card, role }) => {
        socket.to(roomId).emit('opponent_king_selected', { card, role });
    });

    socket.on('chat_message', ({ roomId, message, color }) => {
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
            
            socket.to(roomId).emit('opponent_disconnected');
            
            if (room.p1?.id === socket.id) {
                room.p1 = null;
            } else if (room.p2?.id === socket.id) {
                room.p2 = null;
                if (room.p1) room.p1.isReady = false;
                io.to(roomId).emit('lobby_update', room);
            }

            if (!room.p1 && !room.p2) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted`);
            }
        }
        console.log(`User Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
