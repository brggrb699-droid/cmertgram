// index.js (Сервер, адаптированный для Render)

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Порт для Render: используем переменную окружения PORT, если доступна, или 3000 локально.
const PORT = process.env.PORT || 3000;

// Настройка Socket.io с явным указанием CORS для продакшена.
// Render предоставляет нам публичный URL, который будет добавлен в allowdOrigins.
const io = new Server(server, {
    cors: {
        // В продакшене лучше указать точный домен Render.
        // Для простоты, разрешаем все источники (*), но это не рекомендуется для высокой безопасности.
        // Если вы знаете свой домен Render (например, https://my-app-name.onrender.com),
        // используйте: origin: ["https://my-app-name.onrender.com"],
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Хранилище пользователей: { socketId: nickname }
const users = {}; 

// --- Маршрутизация HTTP ---

// Отдаем index.html при обращении к корню
const htmlPath = path.join(__dirname, 'index.html');
if (fs.existsSync(htmlPath)) {
    app.get('/', (req, res) => {
        res.sendFile(htmlPath);
    });
} else {
    // Если index.html не найден, отдаем его через Express, 
    // чтобы Render не выдал ошибку 404
    app.get('/', (req, res) => {
        res.send('<h1>Ошибка: index.html не найден.</h1><p>Убедитесь, что оба файла находятся в корневой директории.</p>');
    });
}


// --- Обработка Socket.io ---

io.on('connection', (socket) => {
    // Вся логика регистрации, public_message, private_message и disconnect 
    // остается такой же, как в оригинальной версии, так как она не зависит от порта.
    
    // [1] Регистрация/Вход
    socket.on('register', (nickname) => {
        const isNicknameTaken = Object.values(users).includes(nickname);
        if (isNicknameTaken) {
            socket.emit('registration_error', `Никнейм "${nickname}" уже занят.`);
            return;
        }

        users[socket.id] = nickname;
        socket.emit('registration_success', nickname);

        io.emit('user_list', Object.values(users));

        io.emit('public_message', { 
            type: 'system', 
            sender: 'Система', 
            content: `**${nickname}** присоединился(ась) к чату.` 
        });
    });

    // [2] Общее сообщение
    socket.on('public_message', (encryptedContent) => {
        const sender = users[socket.id] || 'Неизвестный';
        const message = {
            type: 'public',
            sender: sender,
            content: encryptedContent, 
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        };
        io.emit('public_message', message); 
    });

    // [3] Приватное сообщение
    socket.on('private_message', (data) => {
        const senderNickname = users[socket.id];
        const { recipientNickname, encryptedContent } = data;
        
        const recipientSocketId = Object.keys(users).find(key => users[key] === recipientNickname);

        if (recipientSocketId) {
            const message = {
                type: 'private',
                sender: senderNickname,
                content: encryptedContent,
                timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            };
            
            io.to(recipientSocketId).emit('private_message', message);
            socket.emit('private_message', { ...message, recipient: recipientNickname });
        } else {
            socket.emit('public_message', { 
                type: 'system', 
                sender: 'Система', 
                content: `Пользователь **${recipientNickname}** не найден или не в сети.` 
            });
        }
    });

    // [4] Отключение
    socket.on('disconnect', () => {
        const nickname = users[socket.id];
        if (nickname) {
            delete users[socket.id];
            
            io.emit('user_list', Object.values(users));

            io.emit('public_message', { 
                type: 'system', 
                sender: 'Система', 
                content: `**${nickname}** покинул(а) чат.` 
            });
        }
    });
});

// Запуск сервера с динамическим портом
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту: ${PORT}`);
    console.log('Для локальной разработки используйте http://localhost:3000');
});
