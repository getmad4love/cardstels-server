const net = require('net');

const PORT = 5000;
const MAX_LINE_LENGTH = 8192;      // drop clients that flood oversized frames
const MAX_CHAT_LENGTH = 32;        // hard cap mirrored by the client UI
const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // prune dead rooms after 30 min

const rooms = {};

function send(socket, msg) {
    if (!socket || socket.destroyed) return;
    socket.write(JSON.stringify(msg) + '\n');
}

function genCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 5; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function sanitizeText(value, maxLen) {
    return String(value == null ? '' : value)
        .replace(/[\r\n\t]/g, ' ')
        .slice(0, maxLen);
}

function sanitizeInfo(info) {
    if (!info || typeof info !== 'object') return {};
    return {
        nickname: sanitizeText(info.nickname || 'PLAYER', 16),
        color: sanitizeText(info.color || '', 32),
        skin: sanitizeText(info.skin || '', 32),
    };
}

function touchRoom(code) {
    if (rooms[code]) rooms[code].lastActivity = Date.now();
}

// Periodic cleanup of abandoned rooms.
setInterval(() => {
    const now = Date.now();
    for (const code of Object.keys(rooms)) {
        if (now - (rooms[code].lastActivity || 0) > ROOM_IDLE_TIMEOUT_MS) {
            const room = rooms[code];
            if (room.owner) { send(room.owner, { type: 'room_closed' }); room.owner.destroy(); }
            if (room.guest) { send(room.guest, { type: 'room_closed' }); room.guest.destroy(); }
            delete rooms[code];
            console.log(`Room ${code} pruned (idle).`);
        }
    }
}, 60 * 1000);

const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.setKeepAlive(true, 30000);
    socket.setNoDelay(true); // gameplay messages must not wait for Nagle
    let buffer = '';
    let currentRoom = null;
    let isOwner = false;

    socket.on('data', (data) => {
        buffer += data;
        if (buffer.length > MAX_LINE_LENGTH * 4) {
            socket.destroy();
            return;
        }
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;
            if (line.length > MAX_LINE_LENGTH) continue;
            try {
                const msg = JSON.parse(line);
                handleMessage(socket, msg);
            } catch (e) {
                console.error('Invalid JSON:', line.slice(0, 200));
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
        console.error('Socket error:', err.message);
    });

    function relayToOther(msg) {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        const other = isOwner ? room.guest : room.owner;
        if (other) send(other, msg);
        touchRoom(currentRoom);
    }

    function handleMessage(socket, msg) {
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'create') {
            if (currentRoom) return; // one room per connection
            let code = genCode();
            while (rooms[code]) code = genCode();
            currentRoom = code;
            isOwner = true;
            rooms[code] = {
                owner: socket,
                guest: null,
                settings: msg.settings || {},
                guestReady: false,
                p1_info: sanitizeInfo(msg.info),
                lastActivity: Date.now(),
            };
            send(socket, { type: 'created', code: code });
        }
        else if (msg.type === 'join') {
            const code = sanitizeText(msg.code, 8).toUpperCase();
            if (rooms[code]) {
                const room = rooms[code];
                if (!room.guest) {
                    room.guest = socket;
                    currentRoom = code;
                    isOwner = false;
                    touchRoom(code);
                    send(socket, { type: 'joined', code: code, settings: room.settings, p1_info: room.p1_info });
                    send(room.owner, { type: 'guest_joined', info: sanitizeInfo(msg.info) });
                } else {
                    send(socket, { type: 'error', message: 'Room is full' });
                }
            } else {
                send(socket, { type: 'error', message: 'Room not found' });
            }
        }
        else if (msg.type === 'update_settings') {
            if (isOwner && currentRoom && rooms[currentRoom]) {
                rooms[currentRoom].settings = msg.settings || {};
                touchRoom(currentRoom);
                if (rooms[currentRoom].guest) {
                    send(rooms[currentRoom].guest, { type: 'settings_updated', settings: rooms[currentRoom].settings });
                }
            }
        }
        else if (msg.type === 'update_info') {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom];
                const info = sanitizeInfo(msg.info);
                touchRoom(currentRoom);
                if (isOwner) {
                    room.p1_info = info;
                    if (room.guest) send(room.guest, { type: 'p1_info', info: info });
                } else {
                    room.p2_info = info;
                    if (room.owner) send(room.owner, { type: 'guest_info', info: info });
                }
            }
        }
        else if (msg.type === 'ready') {
            if (!isOwner && currentRoom && rooms[currentRoom]) {
                rooms[currentRoom].guestReady = msg.ready === true;
                touchRoom(currentRoom);
                send(rooms[currentRoom].owner, { type: 'guest_ready', ready: rooms[currentRoom].guestReady });
            }
        }
        else if (msg.type === 'start') {
            if (isOwner && currentRoom && rooms[currentRoom] && rooms[currentRoom].guestReady) {
                touchRoom(currentRoom);
                send(rooms[currentRoom].guest, { type: 'start_match' });
                send(rooms[currentRoom].owner, { type: 'start_match' });
            }
        }
        else if (msg.type === 'chat') {
            const text = sanitizeText(msg.text, MAX_CHAT_LENGTH);
            if (text.length === 0) return;
            relayToOther({ type: 'chat', text: text, sender: isOwner ? 'p1' : 'p2', timestamp: Date.now() });
        }
        else if (msg.type === 'turn' || msg.type === 'game_sync' || msg.type === 'shoot' || msg.type === 'pull' || msg.type === 'pull_end' || msg.type === 'end_turn' || msg.type === 'typing') {
            // Pure relay: the server never inspects or simulates gameplay, it just
            // forwards small packets to the other player. 'turn' carries a whole
            // settled turn (shot + rest snapshot); 'game_sync' carries the coin
            // toss and end-of-match decisions. This keeps CPU at a few % even with
            // hundreds of concurrent rooms on the Oracle free tier.
            relayToOther(msg);
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pucki server listening on port ${PORT}`);
});
