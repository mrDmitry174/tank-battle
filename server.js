const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище игр
const games = new Map();

// Socket.IO обработчики
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Создание игры
    socket.on('createGame', (data) => {
        const gameId = Date.now().toString();
        const game = {
            id: gameId,
            type: data.type,
            status: 'waiting',
            players: [{
                id: data.playerId,
                name: data.playerName,
                team: null,
                ready: false,
                socketId: socket.id
            }],
            maxPlayers: data.type === '1x1' ? 2 : data.type === '3x3' ? 6 : 10
        };
        
        games.set(gameId, game);
        socket.join(gameId);
        socket.emit('gameCreated', game);
        io.emit('gameListUpdated', Array.from(games.values()));
    });

    // Присоединение к игре
    socket.on('joinGame', (data) => {
        const game = games.get(data.gameId);
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }

        if (game.players.length >= game.maxPlayers) {
            socket.emit('error', 'Game is full');
            return;
        }

        game.players.push({
            id: data.playerId,
            name: data.playerName,
            team: null,
            ready: false,
            socketId: socket.id
        });

        socket.join(data.gameId);
        io.to(data.gameId).emit('gameUpdated', game);
        io.emit('gameListUpdated', Array.from(games.values()));
    });

    // Выбор команды
    socket.on('selectTeam', (data) => {
        const game = games.get(data.gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === data.playerId);
        if (player) {
            player.team = data.team;
            io.to(data.gameId).emit('gameUpdated', game);
        }
    });

    // Готовность игрока
    socket.on('toggleReady', (data) => {
        const game = games.get(data.gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === data.playerId);
        if (player) {
            player.ready = !player.ready;
            io.to(data.gameId).emit('gameUpdated', game);

            // Проверяем, готовы ли все игроки
            const allReady = game.players.every(p => p.ready);
            const teamsBalanced = checkTeamsBalance(game);
            
            if (allReady && teamsBalanced) {
                game.status = 'starting';
                io.to(data.gameId).emit('gameStarting', game);
            }
        }
    });

    // Выход из игры
    socket.on('leaveGame', (data) => {
        const game = games.get(data.gameId);
        if (!game) return;

        game.players = game.players.filter(p => p.id !== data.playerId);
        
        if (game.players.length === 0) {
            games.delete(data.gameId);
        }

        socket.leave(data.gameId);
        io.to(data.gameId).emit('gameUpdated', game);
        io.emit('gameListUpdated', Array.from(games.values()));
    });

    // Отключение клиента
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // Находим и удаляем игрока из всех игр
        games.forEach((game, gameId) => {
            game.players = game.players.filter(p => p.socketId !== socket.id);
            if (game.players.length === 0) {
                games.delete(gameId);
            } else {
                io.to(gameId).emit('gameUpdated', game);
            }
        });
        io.emit('gameListUpdated', Array.from(games.values()));
    });
});

// Вспомогательные функции
function checkTeamsBalance(game) {
    const teams = game.players.reduce((acc, player) => {
        if (player.team === 0) acc.team0++;
        if (player.team === 1) acc.team1++;
        return acc;
    }, { team0: 0, team1: 0 });

    return teams.team0 === teams.team1;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 