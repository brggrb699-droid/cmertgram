const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// --- КОНФИГУРАЦИЯ СЕРВЕРА ---
const PORT = 8080; 

// Карта для хранения активных клиентов: Nickname -> WebSocket
const clients = new Map();
// Карта для хранения WebSocket -> Nickname
const wsToNickname = new Map();

// --- HTTP SERVER (Для обслуживания index.html) ---
const server = http.createServer((req, res) => {
    // В простейшем случае, обслуживаем только index.html
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

// --- WEBSOCKET SERVER (Для сигнализации и чата) ---
const wss = new WebSocket.Server({ server });

/**
 * Отправляет список активных пользователей всем клиентам.
 */
function broadcastUserList() {
    const activeUsers = Array.from(clients.keys());
    const message = JSON.stringify({
        type: 'user_list',
        users: activeUsers
    });
    clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

/**
 * Отправляет сообщение конкретному пользователю по Nickname.
 * @param {string} toNick - Ник получателя.
 * @param {object} messageObject - Объект сообщения.
 */
function sendTo(toNick, messageObject) {
    const ws = clients.get(toNick);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(messageObject));
        return true;
    }
    return false;
}

wss.on('connection', (ws) => {
    console.log(`[WS] Новое соединение установлено.`);
    let currentNickname = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("[WS] Ошибка парсинга JSON:", message);
            return;
        }

        // 1. Обработка ВХОДА
        if (data.type === 'join' && data.nickname) {
            const newNick = data.nickname;
            if (clients.has(newNick)) {
                // Отклонить, если ник уже занят
                ws.send(JSON.stringify({ type: 'error', message: `Ник "${newNick}" уже занят.` }));
                ws.close();
                return;
            }
            
            // Регистрируем клиента
            currentNickname = newNick;
            clients.set(currentNickname, ws);
            wsToNickname.set(ws, currentNickname);
            
            console.log(`[JOIN] Пользователь "${currentNickname}" подключен.`);
            broadcastUserList();

        // 2. ОБЩИЙ ЧАТ (через сервер)
        } else if (data.type === 'message' && currentNickname) {
            const messageObject = {
                type: 'message',
                from: currentNickname,
                text: data.text
            };
            
            // Рассылаем всем, кроме отправителя
            clients.forEach((clientWs, nick) => {
                if (nick !== currentNickname && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(messageObject));
                }
            });

        // 3. P2P СИГНАЛИЗАЦИЯ (Signal, Offer, Accept, Reject)
        } else if (['signal', 'call_offer', 'call_accept', 'call_reject'].includes(data.type) && currentNickname && data.to) {
            const messageObject = {
                type: data.type,
                from: currentNickname,
                signal: data.signal,        // для 'signal'
                offer: data.offer,          // для 'call_offer'
                channelType: data.channelType // для 'signal'
            };
            
            if (!sendTo(data.to, messageObject)) {
                 console.log(`[SIGNALING] Не удалось отправить ${data.type} для ${data.to}.`);
            }
        }
    });

    ws.on('close', () => {
        if (currentNickname) {
            clients.delete(currentNickname);
            wsToNickname.delete(ws);
            console.log(`[LEAVE] Пользователь "${currentNickname}" отключен.`);
            
            // Оповещаем остальных о выходе
            const leaveMessage = JSON.stringify({
                type: 'leave',
                nickname: currentNickname
            });
            clients.forEach(clientWs => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(leaveMessage);
                }
            });

            broadcastUserList();
        }
    });

    ws.on('error', (error) => {
        console.error(`[WS Error] от ${currentNickname || 'Неизвестный клиент'}:`, error.message);
    });
});

// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Сервер P2P Conference запущен!`);
    console.log(`🔗 Откройте в браузере: http://localhost:${PORT}`);
    console.log(`==============================================\n`);
});
