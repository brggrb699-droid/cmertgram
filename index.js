const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO для работы на Render
// Добавляем CORS, чтобы клиент (index.html) мог подключаться
const io = new Server(server, {
    cors: {
        origin: "*", // Разрешаем всем, так как это общедоступный чат
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] // Указываем транспорт
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
    const message = {
        type: 'system',
        sender: 'Система',
        content: content,
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    io.emit('public_message', message);
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
        sendSystemMessage(`Пользователь **${cleanNickname}** присоединился к чату.`);
        broadcastUserList();
        console.log(`Пользователь зарегистрирован: ${cleanNickname}`);
    });

    // 2. Общее сообщение (ИСПРАВЛЕННАЯ ЛОГИКА)
    socket.on('public_message', (encryptedContent) => {
        const sender = users[socket.id];
        if (!sender) return; // Игнорируем, если пользователь не зарегистрирован

        const message = {
            type: 'public',
            sender: sender,
            content: encryptedContent, 
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        };
        
        // Отправляем всем клиентам
        io.emit('public_message', message);
    });

    // 3. Приватное сообщение
    socket.on('private_message', (data) => {
        const sender = users[socket.id];
        const recipientSocketId = nicknames[data.recipientNickname];

        if (!sender || !recipientSocketId) {
             console.log(`Ошибка: Отправитель не найден или получатель "${data.recipientNickname}" не в сети.`);
             // Можно отправить уведомление только отправителю об ошибке
             return;
        }
        
        const message = {
            type: 'private',
            sender: sender,
            recipient: data.recipientNickname,
            content: data.encryptedContent,
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        };
        
        // Отправка получателю
        io.to(recipientSocketId).emit('private_message', message);
        // Отправка обратно отправителю (для отображения своего сообщения)
        io.to(socket.id).emit('private_message', message);
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
