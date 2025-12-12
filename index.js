// Server: index.js (Node.js)
// Убедитесь, что у вас установлен модуль ws: npm install ws
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
        // Предполагаем, что index.html находится в той же папке
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

// --- 2. WEBSOCKET СЕРВЕР (СИГНАЛИНГ) ---
const wss = new WebSocket.Server({ server });

function sendUserListToAll() {
    const activeUsers = Object.keys(clients);
    const userListMessage = JSON.stringify({ type: 'user_list', users: activeUsers });
    
    // Рассылка обновленного списка всем клиентам
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.nickname) {
            client.send(userListMessage);
        }
    });
}

wss.on('connection', (ws) => {
    ws.nickname = null; // Привязываем ник к объекту WS

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Received non-JSON message:', message);
            return;
        }
        
        // 

        switch (data.type) {
            case 'join':
                const requestedNick = data.nickname;

                // Проверка уникальности Никнейма
                if (clients[requestedNick]) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: `ID (Ник) "${requestedNick}" уже занят. Выберите другой.` 
                    }));
                    return;
                }

                // Регистрация нового клиента
                ws.nickname = requestedNick;
                clients[requestedNick] = ws;
                console.log(`[JOIN] Новый участник: ${requestedNick}`);
                
                // Отправляем всем актуальный список (включая нового)
                sendUserListToAll(); 
                break;

            case 'signal':
                // Маршрутизация P2P-сигнала
                const targetWs = clients[data.to];
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify({
                        type: 'signal',
                        from: ws.nickname, 
                        signal: data.signal
                    }));
                } else {
                    console.warn(`[SIGNAL] Получатель "${data.to}" не найден или оффлайн.`);
                }
                break;
                
            case 'target_call':
                // Опциональный служебный сигнал для уведомления цели о входящем звонке
                const callerNick = ws.nickname;
                const calleeWs = clients[data.to];
                if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
                    calleeWs.send(JSON.stringify({
                        type: 'system_alert',
                        message: `Входящий P2P-вызов/чат от ${callerNick}. Установите соединение.`,
                        caller: callerNick 
                    }));
                }
                break;
        }
    });

    ws.on('close', () => {
        if (ws.nickname) {
            const clientNickname = ws.nickname;
            console.log(`[LEAVE] Участник отключился: ${clientNickname}`);
            
            // Удаляем из списка
            delete clients[clientNickname];

            // Уведомляем всех остальных, чтобы они могли закрыть P2P
            const leaveMessage = JSON.stringify({ type: 'leave', nickname: clientNickname });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(leaveMessage);
                }
            });
            
            // Отправляем обновленный список
            sendUserListToAll();
        }
    });
    
    ws.on('error', (error) => {
        console.error(`[WS Error] для ${ws.nickname || 'Неизвестного'}:`, error.message);
    });
});

// --- 3. ЗАПУСК СЕРВЕРА ---
server.listen(PORT, () => {
    console.log(`[СИСТЕМА] Сервер Mesh Conference запущен на порту ${PORT}`);
    console.log(`[СИСТЕМА] Клиент доступен по адресу: http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
    console.log('Ждем подключений клиентов с уникальными ID (Никами)...');
});
