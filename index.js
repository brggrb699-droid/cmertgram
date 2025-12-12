const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling'] 
});

const PORT = process.env.PORT || 3000;

const users = {}; // { socket.id: nickname }
const nicknames = {}; // { nickname: socket.id }

function broadcastUserList() {
    const userList = Object.values(users);
    io.emit('user_list', userList);
}

function sendSystemMessage(content) {
    io.emit('system_message', content);
}

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Обработка соединений Socket.IO ---
io.on('connection', (socket) => {
    console.log('Новое соединение:', socket.id);

    // 1. Регистрация
    socket.on('register', (nickname) => {
        const cleanNickname = nickname.trim().substring(0, 15);
        
        if (!cleanNickname || cleanNickname === 'Система' || nicknames[cleanNickname]) {
            socket.emit('registration_error', `Никнейм "${cleanNickname}" уже занят или недопустим.`);
            return;
        }

        // Успешная регистрация
        users[socket.id] = cleanNickname;
        nicknames[cleanNickname] = socket.id;
        
        socket.emit('registration_success', cleanNickname); 
        
        sendSystemMessage(`Пользователь **${cleanNickname}** присоединился.`);
        broadcastUserList();
        console.log(`Пользователь зарегистрирован: ${cleanNickname}`);
    });

    // 2. Общее сообщение
    socket.on('public_message', (msg) => {
        const sender = users[socket.id];
        if (!sender) return; 
        msg.sender = sender;
        io.emit('public_message', msg);
    });

    // 3. Личное сообщение
    socket.on('private_message', (msg) => {
        const sender = users[socket.id];
        const recipientSocketId = nicknames[msg.recipient];
        if (!sender || !recipientSocketId) return;

        msg.sender = sender;
        
        // Отправка получателю
        io.to(recipientSocketId).emit('private_message', msg);
        // Отправка обратно отправителю (для отображения своего сообщения)
        io.to(socket.id).emit('private_message', msg);
    });
    
    // ------------------------------------
    // ОБРАБОТЧИКИ СИГНАЛИЗАЦИИ WEBRTC
    // ------------------------------------

    // 4. Обработка Offer (начало звонка)
    socket.on('webrtc_offer', (data) => {
        const caller = users[socket.id];
        const recipientSocketId = nicknames[data.target];

        if (recipientSocketId) {
            console.log(`WebRTC Offer от ${caller} к ${data.target}`);
            io.to(recipientSocketId).emit('incoming_call', {
                callerNickname: caller,
                offerSdp: data.sdp,
            });
        }
    });

    // 5. Обработка Answer (ответ на звонок)
    socket.on('webrtc_answer', (data) => {
        const caller = users[socket.id]; // Ответчик
        const recipientSocketId = nicknames[data.target]; // Инициатор

        if (recipientSocketId) {
            console.log(`WebRTC Answer от ${caller} к ${data.target}`);
            io.to(recipientSocketId).emit('webrtc_answer', {
                answerSdp: data.sdp,
                partner: caller,
            });
        }
    });

    // 6. Обработка ICE-кандидатов
    socket.on('webrtc_ice', (data) => {
        const recipientSocketId = nicknames[data.target];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('webrtc_ice', {
                candidate: data.candidate,
            });
        }
    });

    // 7. Завершение звонка
    socket.on('call_end', (partnerNickname) => {
        const user = users[socket.id];
        const partnerSocketId = nicknames[partnerNickname];
        
        if (partnerSocketId) {
            console.log(`Звонок завершен между ${user} и ${partnerNickname}`);
            io.to(partnerSocketId).emit('call_ended', user);
        }
    });

    // 8. Отключение
    socket.on('disconnect', () => {
        const disconnectedUser = users[socket.id];
        if (disconnectedUser) {
            delete nicknames[disconnectedUser];
            delete users[socket.id];

            sendSystemMessage(`Пользователь **${disconnectedUser}** покинул чат.`);
            broadcastUserList();
            console.log(`Пользователь отключился: ${disconnectedUser}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Сервер WebRTC-сигнализации запущен на порту ${PORT}`);
});
