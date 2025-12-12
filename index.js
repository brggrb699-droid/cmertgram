const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
// Использование порта, предоставляемого Render, или 3000 по умолчанию
const PORT = process.env.PORT || 3000;

// Обслуживание статических файлов (index.html, CSS) из папки, где лежит index.js
app.use(express.static(path.join(__dirname, '')));

// Создание HTTP-сервера
const server = http.createServer(app);

// Создание WebSocket-сервера, привязанного к HTTP-серверу
const wss = new WebSocket.Server({ server });

// [STEALTH_GHOST] Главный обработчик WebSocket-соединений
wss.on('connection', function connection(ws, req) {
    // 1. Новое подключение
    console.log(`[STEALTH_GHOST] New connection established.`);
    
    // 2. Обработка входящих сообщений (Broadcast)
    ws.on('message', function incoming(message) {
        console.log('Received: %s', message);
        
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Invalid JSON format.");
            return;
        }

        // Проверяем наличие отправителя и сообщения
        if (!data.sender || !data.message) {
            console.warn("Incomplete data received.");
            return;
        }

        // [CORE_LOGIC] ШИРОКОВЕЩАТЕЛЬНАЯ РАССЫЛКА ВСЕМ КЛИЕНТАМ
        wss.clients.forEach(function each(client) {
            // Отправляем сообщение только открытым и готовым к приему соединениям
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    sender: data.sender,
                    message: data.message
                }));
            }
        });
    });

    // 3. Обработка закрытия соединения
    ws.on('close', () => {
        console.log('[STEALTH_GHOST] Connection closed.');
    });

    // 4. Отправка приветственного сообщения (опционально)
    ws.send(JSON.stringify({
        sender: 'SYSTEM',
        message: 'CONNECTION_INITIATED. ENTER NICKNAME TO JOIN THE MATRIX.'
    }));
});

// [BOOT_SEQUENCE] Запуск HTTP-сервера
server.listen(PORT, () => {
    console.log(`[STEALTH_GHOST] Server is LIVE on port ${PORT}`);
});
