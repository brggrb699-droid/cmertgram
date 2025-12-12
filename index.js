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

    // ... (Ваша существующая логика register, public_message, private_message) ...
    
    // ------------------------------------
    // НОВЫЕ ОБРАБОТЧИКИ СИГНАЛИЗАЦИИ WEBRTC
    // ------------------------------------

    // 1. Обработка Offer (начало звонка)
    socket.on('webrtc_offer', (data) => {
        const caller = users[socket.id];
        const recipientSocketId = nicknames[data.target];

        if (recipientSocketId) {
            console.log(`WebRTC Offer от ${caller} к ${data.target}`);
            // Отправляем Offer получателю
            io.to(recipientSocketId).emit('incoming_call', {
                callerNickname: caller,
                offerSdp: data.sdp,
            });
        }
    });

    // 2. Обработка Answer (ответ на звонок)
    socket.on('webrtc_answer', (data) => {
        const caller = users[socket.id]; // Ответчик
        const recipientSocketId = nicknames[data.target]; // Инициатор

        if (recipientSocketId) {
            console.log(`WebRTC Answer от ${caller} к ${data.target}`);
            // Отправляем Answer инициатору
            io.to(recipientSocketId).emit('webrtc_answer', {
                answerSdp: data.sdp,
                partner: caller,
            });
        }
    });

    // 3. Обработка ICE-кандидатов
    socket.on('webrtc_ice', (data) => {
        const caller = users[socket.id];
        const recipientSocketId = nicknames[data.target];

        if (recipientSocketId) {
            // Отправляем ICE-кандидат партнеру
            io.to(recipientSocketId).emit('webrtc_ice', {
                candidate: data.candidate,
            });
        }
    });

    // 4. Завершение звонка
    socket.on('call_end', (partnerNickname) => {
        const user = users[socket.id];
        const partnerSocketId = nicknames[partnerNickname];
        
        if (partnerSocketId) {
            console.log(`Звонок завершен между ${user} и ${partnerNickname}`);
            // Уведомляем партнера о завершении
            io.to(partnerSocketId).emit('call_ended', user);
        }
    });

    // ... (Ваша существующая логика disconnect) ...

});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер WebRTC-сигнализации запущен на порту ${PORT}`);
});
