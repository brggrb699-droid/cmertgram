
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

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
    // Если index.html не найден, отправляем сообщение об ошибке
    app.get('/', (req, res) => {
        res.send('<h1>Ошибка: index.html не найден.</h1><p>Пожалуйста, убедитесь, что index.html находится в той же папке, что и index.js</p>');
    });
}


// --- Обработка Socket.io ---

io.on('connection', (socket) => {
    console.log(`Пользователь подключился: ${socket.id}`);

    // [1] Регистрация/Вход
    socket.on('register', (nickname) => {
        // Проверяем, свободен ли никнейм
        const isNicknameTaken = Object.values(users).includes(nickname);
        if (isNicknameTaken) {
            socket.emit('registration_error', `Никнейм "${nickname}" уже занят.`);
            return;
        }

        users[socket.id] = nickname;
        console.log(`Пользователь зарегистрирован: ${nickname} (${socket.id})`);
        socket.emit('registration_success', nickname);

        // Обновление списка пользователей для всех
        io.emit('user_list', Object.values(users));

        // Уведомление о входе в общий чат
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
            content: encryptedContent, // Отправляем зашифрованное содержимое
            timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        };
        // Отправляем всем, включая отправителя
        io.emit('public_message', message); 
    });

    // [3] Приватное сообщение
    socket.on('private_message', (data) => {
        const senderNickname = users[socket.id];
        const { recipientNickname, encryptedContent } = data;
        
        // Находим socketId получателя по никнейму
        const recipientSocketId = Object.keys(users).find(key => users[key] === recipientNickname);

        if (recipientSocketId) {
            const message = {
                type: 'private',
                sender: senderNickname,
                content: encryptedContent, // Отправляем зашифрованное содержимое
                timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            };
            
            // Отправляем получателю
            io.to(recipientSocketId).emit('private_message', message);

            // Отправляем копию отправителю (для отображения в его чате)
            socket.emit('private_message', { ...message, recipient: recipientNickname });
        } else {
            // Уведомление, если получатель не найден (например, только что вышел)
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
            console.log(`Пользователь отключился: ${nickname} (${socket.id})`);
            delete users[socket.id];
            
            // Обновление списка пользователей для всех
            io.emit('user_list', Object.values(users));

            // Уведомление об отключении
            io.emit('public_message', { 
                type: 'system', 
                sender: 'Система', 
                content: `**${nickname}** покинул(а) чат.` 
            });
        }
    });
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('---');
    console.log('Не забудьте создать файл index.html в этой же папке!');
});
