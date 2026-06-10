const net = require('net');

const PORT = 3000;
const rooms = {};

function send(socket, msg) {
    if (!socket || socket.destroyed) return;
    socket.write(JSON.stringify(msg) + '\n');
}

function genCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for ( let i = 0; i < 5; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let currentRoom = null;
    let isOwner = false;

    socket.on('data', (data) => {
        buffer += data;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
                try {
                    const msg = JSON.parse(line);
                    handleMessage(socket, msg);
                } catch(e) {
                    console.error("Invalid JSON:", line, e);
                }
            }
        }
    });

    socket.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (socket === room.owner) {
                if (room.guest) {
                    send(room.guest, { type: 'room_closed' });
                    room.guest.destroy();
                }
                delete rooms[currentRoom];
            } else if (socket === room.guest) {
                room.guest = null;
                room.guestReady = false;
                send(room.owner, { type: 'guest_left' });
            }
        }
    });

    socket.on('error', (err) => {
        console.error("Socket error:", err);
    });

    function handleMessage(socket, msg) {
        if (msg.type === 'create') {
            let code = genCode();
            while (rooms[code]) code = genCode();
            currentRoom = code;
            isOwner = true;
            rooms[code] = { owner: socket, guest: null, settings: msg.settings, guestReady: false, p1_info: msg.info };
            send(socket, { type: 'created', code: code });
        }
        else if (msg.type === 'join') {
            let code = (msg.code || '').toUpperCase();
            if (rooms[code]) {
                const room = rooms[code];
                if (!room.guest) {
                    room.guest = socket;
                    currentRoom = code;
                    isOwner = false;
                    send(socket, { type: 'joined', code: code, settings: room.settings, p1_info: room.p1_info });
                    send(room.owner, { type: 'guest_joined', info: msg.info });
                } else {
                    send(socket, { type: 'error', message: 'Room is full' });
                }
            } else {
                send(socket, { type: 'error', message: 'Room not found' });
            }
        }
        else if (msg.type === 'update_settings') {
            if (isOwner && currentRoom && rooms[currentRoom]) {
                rooms[currentRoom].settings = msg.settings;
                if (rooms[currentRoom].guest) {
                    send(rooms[currentRoom].guest, { type: 'settings_updated', settings: msg.settings });
                }
            }
        }
        else if (msg.type === 'update_info') {
             if (currentRoom && rooms[currentRoom]) {
                 const room = rooms[currentRoom];
                 if (isOwner) {
                     room.p1_info = msg.info;
                     if (room.guest) send(room.guest, { type: 'p1_info', info: msg.info });
                 } else {
                     room.p2_info = msg.info;
                     if (room.owner) send(room.owner, { type: 'guest_info', info: msg.info });
                 }
             }
        }
        else if (msg.type === 'ready') {
            if (!isOwner && currentRoom && rooms[currentRoom]) {
                rooms[currentRoom].guestReady = msg.ready;
                send(rooms[currentRoom].owner, { type: 'guest_ready', ready: msg.ready });
            }
        }
        else if (msg.type === 'start') {
            if (isOwner && currentRoom && rooms[currentRoom] && rooms[currentRoom].guestReady) {
                send(rooms[currentRoom].guest, { type: 'start_match' });
                send(rooms[currentRoom].owner, { type: 'start_match' });
            }
        }
        else if (msg.type === 'chat') {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom];
                const other = isOwner ? room.guest : room.owner;
                if (other) send(other, { type: 'chat', text: msg.text, sender: isOwner ? 'p1' : 'p2', timestamp: Date.now() });
            }
        }
        else if (msg.type === 'pull' || msg.type === 'shoot' || msg.type === 'game_sync' || msg.type === 'end_turn') {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom];
                const other = isOwner ? room.guest : room.owner;
                if (other) send(other, msg);
            }
        }
        else if (msg.type === 'typing') {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom];
                const other = isOwner ? room.guest : room.owner;
                if (other) send(other, { type: 'typing', sender: isOwner ? 'p1' : 'p2' });
            }
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pucki server listening on port ${PORT}`);
});
