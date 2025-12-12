// Server: index.js (Node.js)
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Словарь для хранения сопоставления Nickname -> WebSocket Connection
// { "Nickname": WebSocketInstance }
const clients = {}; 
const PORT = 8080;

// --- 1. HTTP СЕРВЕР ДЛЯ ОТДАЧИ index.html ---
const server = http.createServer((req, res) => {
    // Отдаем index.html при любом запросе (для простоты)
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    } else {
        // Ответ для других запросов
        res.writeHead(404);
        res.end('Not Found');
    }
});

// --- 2. WEBSOCKET СЕРВЕР ---
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    let clientNickname = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Received non-JSON message:', message);
            return;
        }

        switch (data.type) {
            case 'join':
                const requestedNick = data.nickname;

                // Проверка уникальности Никнейма
                if (clients[requestedNick]) {
                    // Никнейм занят -> отправляем ошибку
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: `ID (Ник) "${requestedNick}" уже занят. Выберите другой.` 
                    }));
                    ws.close(); // Закрываем соединение
                    return;
                }

                // Регистрация нового клиента
                clientNickname = requestedNick;
                clients[clientNickname] = ws;
                console.log(`[JOIN] Новый участник: ${clientNickname}`);

                // 1. Отправляем новому клиенту список всех существующих пользователей
                const otherUsers = Object.keys(clients).filter(nick => nick !== clientNickname);
                ws.send(JSON.stringify({ type: 'user_list', users: otherUsers }));
                
                // 2. Уведомляем всех, кроме нового, о новом пользователе
                otherUsers.forEach(nick => {
                    if (clients[nick]) {
                        clients[nick].send(JSON.stringify({
                            type: 'user_list',
                            users: [clientNickname] // Отправляем только нового пользователя
                        }));
                    }
                });
                break;

            case 'signal':
                // Маршрутизация P2P-сигнала
                const targetWs = clients[data.to];
                if (targetWs) {
                    targetWs.send(JSON.stringify({
                        type: 'signal',
                        from: clientNickname, // Используем Никнейм в качестве from ID
                        signal: data.signal
                    }));
                } else {
                    console.warn(`[SIGNAL] Получатель "${data.to}" не найден.`);
                }
                break;
        }
    });

    ws.on('close', () => {
        if (clientNickname) {
            console.log(`[LEAVE] Участник отключился: ${clientNickname}`);
            
            // Удаляем из списка
            delete clients[clientNickname];

            // Уведомляем всех остальных о выходе
            const leaveMessage = JSON.stringify({ type: 'leave', nickname: clientNickname });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(leaveMessage);
                }
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error(`[WS Error] для ${clientNickname || 'Неизвестного'}:`, error.message);
    });
});

// --- 3. ЗАПУСК СЕРВЕРА ---
server.listen(PORT, () => {
    console.log(`[СИСТЕМА] Сервер Mesh Conference запущен на порту ${PORT}`);
    console.log(`[СИСТЕМА] Клиент доступен по адресу: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
    console.log('Ждем подключений клиентов с уникальными ID (Никами)...');
});
