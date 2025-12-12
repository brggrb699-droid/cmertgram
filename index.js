const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO 
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] 
});

const PORT = process.env.PORT || 3000;

// Хранилище пользователей: { socket.id: nickname }
const users = {};
// Хранилище для обратного поиска: { nickname: socket.id }
const nicknames = {};

// Обслуживание статических файлов (index.html)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Функции сервера ---

/** Обновление и рассылка списка пользователей */
function broadcastUserList() {
    const userList = Object.values(users);
    io.emit('user_list', userList);
}

/** Отправка системного сообщения всем */
function sendSystemMessage(content) {
    io.emit('system_message', content);
}

// --- Обработка соединений Socket.IO ---
io.on('connection', (socket) => {
    console.log('Новое соединение:', socket.id);

    // 1. Регистрация
    socket.on('register', (nickname) => {
        const cleanNickname = nickname.trim().substring(0, 15);
        
        if (!cleanNickname || cleanNickname === 'Система') {
            socket.emit('registration_error', 'Некорректный никнейм.');
            return;
        }

        if (Object.values(users).includes(cleanNickname)) {
            socket.emit('registration_error', `Никнейм "${cleanNickname}" уже занят.`);
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

        // Добавляем отправителя и рассылаем всем
        msg.sender = sender;
        io.emit('public_message', msg);
    });

    // 3. Личное сообщение
    socket.on('private_message', (msg) => {
        const sender = users[socket.id];
        const recipientSocketId = nicknames[msg.recipient];

        if (!sender) return;

        // Добавляем отправителя
        msg.sender = sender;
        
        // Отправка получателю (если он в сети)
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private_message', msg);
            
            // Отправка обратно отправителю (для отображения своего сообщения)
            io.to(socket.id).emit('private_message', msg);
        } else {
             // Сообщение отправителю, что пользователь оффлайн
             const offlineMsg = `Пользователь **${msg.recipient}** не в сети. Сообщение не доставлено.`;
             io.to(socket.id).emit('system_message', offlineMsg);
        }
    });
    
    // 4. Отключение
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

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
