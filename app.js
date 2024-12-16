// В начале файла добавляем подключение к Socket.IO
const socket = io(window.location.origin);

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('error', (message) => {
    tg.showAlert(message);
});

socket.on('gameCreated', (game) => {
    currentGame = game;
    showWaitingRoom(game);
});

socket.on('gameUpdated', (game) => {
    if (currentGame && game.id === currentGame.id) {
        currentGame = game;
        updateWaitingRoom(game);
    }
});

socket.on('gameListUpdated', (games) => {
    currentGames = games;
    if (document.querySelector('.game-list-menu').style.display !== 'none') {
        refreshGamesList();
    }
});

socket.on('gameStarting', (game) => {
    if (currentGame && game.id === currentGame.id) {
        startGame();
    }
});

// В начале app.js добавляем настройки игры
const GAME_SETTINGS = {
    bullet: {
        speed: 0.030,      
        minSpeed: 0.030,   
        maxSpeed: 0.2,     // Уменьшим максимальную скорость пули
        size: 1,
        reloadTime: 5000,
        maxReloadTime: 5000,
        minReloadTime: 2000  // Увеличим минимальное время перезарядки
    },
    tank: {
        moveSpeed: 0.02,    
        minMoveSpeed: 0.02,
        maxMoveSpeed: 0.1   // Оставим как есть
    }
};

// В начале файла добавим счетчики
const upgradeCounters = {
    tankSpeed: 0,
    bulletSpeed: 0,
    reloadTime: 0
};

// В начале файла добавим хранилище для спрайтов
const customSprites = {
    tank: null
};

let tg = window.Telegram.WebApp;
let currentTool = 'wall';
let gridSize = 16;
let gameField;
let tanks = [];
let keydownHandler = null;
let keyupHandler = null;
let pressedKeys = new Set();
let previousKeys = new Set();
let currentColor = '#1B5E20';
let isDrawing = false;

// Добавим отдельную переменную для размера сетки в редакторе спрайтов
const SPRITE_GRID_SIZE = 1;

// В начале файла добавим переменную для хранения выбранного типа танка
let selectedTankType = 'default';

// В начале файла добавим создание стандартного спрайта
function createDefaultTankSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 80, 80);
    
    // Создаем танк с правильными цветами
    // Первый цвет - цвет корпуса (#1B5E20)
    // Третий параметр - цвет башни (#4CAF50)
    const tempTank = new Tank(0, 0, { cellSize: 16 }, '#1B5E20', null, '#4CAF50');
    tempTank.direction = 0;
    
    tempTank.draw(ctx);
    
    return canvas.toDataURL();
}

// В начале файла добавляем глобальные переменные для временного canvas
const tempCanvas = document.createElement('canvas');
const tempCtx = tempCanvas.getContext('2d');

// Добавляем переменную для контроля FPS
const FPS = 60;
const frameDelay = 1000 / FPS;
let lastFrameTime = 0;

// Создаем менеджер ресурсов
const ResourceManager = {
    images: new Map(),
    
    loadImage(key, url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(key, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    },
    
    getImage(key) {
        return this.images.get(key);
    },
    
    clearImages() {
        this.images.clear();
    }
};

// В начале файла добавляем переменную состояния игры
let isGameActive = false;

// Объединенная система очистки
const CleanupSystem = {
    interval: null,
    
    start() {
        this.interval = setInterval(() => this.cleanup(), 5000);
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    },
    
    cleanup() {
        // Очищаем пули
        tanks.forEach(tank => {
            if (tank) {
                tank.bullets = tank.bullets.filter(bullet => 
                    bullet.active && 
                    bullet.x >= 0 && bullet.x < gameField.width &&
                    bullet.y >= 0 && bullet.y < gameField.height
                );
            }
        });
        
        // Очищаем танки
        tanks = tanks.filter(tank => tank && !tank.isDestroyed);
        gameField.tanks = tanks;
        
        // Очищаем текстуры только если игра неактивна
        if (!isGameActive) {
            gameField.clearTextureCache();
        }
    },
    
    fullCleanup() {
        this.stop();
        
        // Очищаем обработчики
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        if (keyupHandler) {
            document.removeEventListener('keyup', keyupHandler);
            keyupHandler = null;
        }
        
        // Очищаем танки
        tanks.forEach(tank => {
            if (tank) tank.cleanup();
        });
        tanks = [];
        gameField.tanks = [];
        
        // Очищаем текстуры
        gameField.clearTextureCache();
        
        // Очищаем состояние
        pressedKeys.clear();
        previousKeys.clear();
        
        // Очищаем canvas
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
};

// Обновляем функцию setGameState
function setGameState(active) {
    isGameActive = active;
    if (active) {
        CleanupSystem.start();
    } else {
        CleanupSystem.fullCleanup();
    }
}

// Добавляем новые глобальные переменные
let currentGame = null;
let currentTeam = null;
let isReady = false;

// Функция для создания игры
function createGame(type) {
    socket.emit('createGame', {
        type: type,
        playerId: tg.initDataUnsafe.user.id,
        playerName: tg.initDataUnsafe.user.first_name
    });
}

// Функция для отображения комнаты ожидания
function showWaitingRoom(game) {
    hideAllMenus();
    const waitingRoom = document.querySelector('.waiting-room');
    waitingRoom.style.display = 'block';

    // Обновляем информцию об игре
    const gameTypeInfo = waitingRoom.querySelector('.game-type-info');
    gameTypeInfo.textContent = `Тип игры: ${game.type}`;
    
    updatePlayersList(game);
}

// Функция обновления списка игроков
function updatePlayersList(game) {
    const playersList = document.querySelector('.players-list');
    playersList.innerHTML = '';
    
    game.players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span>${player.name}</span>
            <span>${player.team === 0 ? '🟢' : player.team === 1 ? '🔴' : '⚪'}</span>
            <span>${player.ready ? '✅' : '⏳'}</span>
        `;
        playersList.appendChild(playerElement);
    });
}

// Функция для присоединения к игре
function joinGame(gameId) {
    socket.emit('joinGame', {
        gameId: gameId,
        playerId: tg.initDataUnsafe.user.id,
        playerName: tg.initDataUnsafe.user.first_name
    });
}

// Функция для обновления списка игр
function refreshGamesList() {
    const gamesContainer = document.querySelector('.games-container');
    gamesContainer.innerHTML = '';

    currentGames.forEach(game => {
        if (game.status === 'waiting') {
            const gameElement = document.createElement('div');
            gameElement.className = 'game-item';
            gameElement.innerHTML = `
                <div class="game-info">
                    <div class="game-type-label">${game.type}</div>
                    <div class="players-count">Игроков: ${game.players.length}/${game.maxPlayers}</div>
                </div>
                <button class="join-button" data-game-id="${game.id}">
                    Присоединиться
                </button>
            `;
            
            gameElement.querySelector('.join-button').addEventListener('click', () => {
                joinGame(game.id);
            });
            
            gamesContainer.appendChild(gameElement);
        }
    });
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    // Существующие обработчики...

    // Обработчик создани�� игры
    document.getElementById('createGame').addEventListener('click', () => {
        hideAllMenus();
        document.querySelector('.game-creation-menu').style.display = 'block';
    });

    // Обработчики типов игр
    document.querySelectorAll('.game-type').forEach(button => {
        button.addEventListener('click', (e) => {
            createGame(e.target.dataset.type);
        });
    });

    // Обработчик для поиска игры
    document.getElementById('selectGame').addEventListener('click', () => {
        hideAllMenus();
        document.querySelector('.game-list-menu').style.display = 'block';
        refreshGamesList();
    });

    // Обработчики выбора команды
    document.querySelectorAll('.team-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const team = e.target.classList.contains('team-green') ? 0 : 1;
            selectTeam(team);
        });
    });

    // Обработчик кнопки готовности
    document.querySelector('.ready-button').addEventListener('click', toggleReady);

    // Обработчик выхода из игры
    document.querySelector('.leave-button').addEventListener('click', leaveGame);
});

// Вспомогательные функции
function hideAllMenus() {
    const menus = [
        '.menu',
        '.game-creation-menu',
        '.game-list-menu',
        '.waiting-room',
        '.tank-selector',
        '.sprite-editor'
    ];
    menus.forEach(menu => {
        document.querySelector(menu).style.display = 'none';
    });
}

function selectTeam(team) {
    if (!currentGame) return;
    
    socket.emit('selectTeam', {
        gameId: currentGame.id,
        playerId: tg.initDataUnsafe.user.id,
        team: team
    });
}

function toggleReady() {
    if (!currentGame) return;
    
    socket.emit('toggleReady', {
        gameId: currentGame.id,
        playerId: tg.initDataUnsafe.user.id
    });
}

function leaveGame() {
    if (!currentGame) return;
    
    socket.emit('leaveGame', {
        gameId: currentGame.id,
        playerId: tg.initDataUnsafe.user.id
    });
    
    currentGame = null;
    currentTeam = null;
    isReady = false;
}

function checkGameStart() {
    if (!currentGame) return;
    
    const allPlayersReady = currentGame.players.every(p => p.ready);
    const teamsBalanced = checkTeamsBalance();
    
    if (allPlayersReady && teamsBalanced) {
        startGame();
    }
}

function checkTeamsBalance() {
    if (!currentGame) return false;
    
    const teamCounts = currentGame.players.reduce((acc, player) => {
        if (player.team === 0) acc.green++;
        if (player.team === 1) acc.red++;
        return acc;
    }, { green: 0, red: 0 });
    
    return teamCounts.green === teamCounts.red;
}

function startGame() {
    // Здесь будет код запуска игры
    console.log('Starting game:', currentGame);
    // Показываем игровое поле
    showMapEditor();
}

document.addEventListener('DOMContentLoaded', async () => {
    tg.expand();
    tg.ready();

    // Устанавливаем спрайт стандартного танка сразу
    const defaultPreview = document.querySelector('.tank-preview.default');
    defaultPreview.style.backgroundImage = `url(${createDefaultTankSprite()})`;
    defaultPreview.style.backgroundSize = 'contain';
    defaultPreview.style.backgroundRepeat = 'no-repeat';
    defaultPreview.style.backgroundPosition = 'center';

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Инициализация игрового поля
    const fieldWidth = Math.floor(canvas.width / gridSize);
    const fieldHeight = Math.floor(canvas.height / gridSize);
    gameField = new GameField(fieldWidth, fieldHeight, gridSize);

    // Убираем загрузку спрайтов пока их нет
    /* await Promise.all([
        spriteManager.loadSprite('wall', 'assets/wall.png'),
        spriteManager.loadSprite('empty', 'assets/empty.png')
    ]); */

    // Обработчики кнопок
    document.getElementById('createGame').addEventListener('click', () => {
        console.log('Создание новой игры');
    });

    document.getElementById('selectGame').addEventListener('click', () => {
        console.log('Выбор существующей игры');
    });

    document.getElementById('selectTank').addEventListener('click', () => {
        document.querySelector('.menu').style.display = 'none';
        document.querySelector('.tank-selector').style.display = 'block';
        
        // Обновляем значения в существующих элементах
        document.querySelector('.tank-stats .stat-row:nth-child(2) label').textContent = 
            `Скорость танка (${upgradeCounters.tankSpeed})`;
        document.querySelector('.tank-stats .stat-row:nth-child(3) label').textContent = 
            `Скорость пули (${upgradeCounters.bulletSpeed})`;
        document.querySelector('.tank-stats .stat-row:nth-child(4) label').textContent = 
            `Скорость стрельбы (${upgradeCounters.reloadTime})`;
        
        // Обновляем прогресс-бары
        document.getElementById('tankSpeedProgress').style.width = 
            `${((GAME_SETTINGS.tank.moveSpeed - GAME_SETTINGS.tank.minMoveSpeed) / (GAME_SETTINGS.tank.maxMoveSpeed - GAME_SETTINGS.tank.minMoveSpeed)) * 100}%`;
        
        document.getElementById('bulletSpeedProgress').style.width = 
            `${((GAME_SETTINGS.bullet.speed - GAME_SETTINGS.bullet.minSpeed) / (GAME_SETTINGS.bullet.maxSpeed - GAME_SETTINGS.bullet.minSpeed)) * 100}%`;
        
        document.getElementById('reloadTimeProgress').style.width = 
            `${((GAME_SETTINGS.bullet.maxReloadTime - GAME_SETTINGS.bullet.reloadTime) / (GAME_SETTINGS.bullet.maxReloadTime - GAME_SETTINGS.bullet.minReloadTime)) * 100}%`;

        // Добавляем обработчики для кнопок улучшения
        document.querySelector('.tank-stats').addEventListener('click', (e) => {
            if (e.target.classList.contains('upgrade-btn')) {
                const upgradeType = e.target.dataset.upgrade;
                
                if (upgradeType === 'tankSpeed') {
                    const currentSpeed = GAME_SETTINGS.tank.moveSpeed;
                    if (currentSpeed < GAME_SETTINGS.tank.maxMoveSpeed) {
                        upgradeCounters.tankSpeed++;
                        const newSpeed = Math.min(currentSpeed + 0.001, GAME_SETTINGS.tank.maxMoveSpeed);
                        GAME_SETTINGS.tank.moveSpeed = newSpeed;
                        document.querySelector('.tank-stats .stat-row:nth-child(2) label').textContent = 
                            `Скорость танка (${upgradeCounters.tankSpeed})`;
                        document.getElementById('tankSpeedProgress').style.width = 
                            `${((newSpeed - GAME_SETTINGS.tank.minMoveSpeed) / (GAME_SETTINGS.tank.maxMoveSpeed - GAME_SETTINGS.tank.minMoveSpeed)) * 100}%`;
                        tanks.forEach(tank => {
                            if (tank) tank.moveSpeed = newSpeed;
                        });
                    }
                }
                
                else if (upgradeType === 'bulletSpeed') {
                    const currentSpeed = GAME_SETTINGS.bullet.speed;
                    if (currentSpeed < GAME_SETTINGS.bullet.maxSpeed) {
                        upgradeCounters.bulletSpeed++;
                        const newSpeed = Math.min(currentSpeed + 0.001, GAME_SETTINGS.bullet.maxSpeed);
                        GAME_SETTINGS.bullet.speed = newSpeed;
                        document.querySelector('.tank-stats .stat-row:nth-child(3) label').textContent = 
                            `Скорость пули (${upgradeCounters.bulletSpeed})`;
                        document.getElementById('bulletSpeedProgress').style.width = 
                            `${((newSpeed - GAME_SETTINGS.bullet.minSpeed) / (GAME_SETTINGS.bullet.maxSpeed - GAME_SETTINGS.bullet.minSpeed)) * 100}%`;
                    }
                }
                
                else if (upgradeType === 'reloadTime') {
                    const currentTime = GAME_SETTINGS.bullet.reloadTime;
                    if (currentTime > GAME_SETTINGS.bullet.minReloadTime) {
                        upgradeCounters.reloadTime++;
                        const newTime = Math.max(currentTime - 10, GAME_SETTINGS.bullet.minReloadTime);
                        GAME_SETTINGS.bullet.reloadTime = newTime;
                        document.querySelector('.tank-stats .stat-row:nth-child(4) label').textContent = 
                            `Скорость стрельбы (${upgradeCounters.reloadTime})`;
                        document.getElementById('reloadTimeProgress').style.width = 
                            `${((GAME_SETTINGS.bullet.maxReloadTime - newTime) / (GAME_SETTINGS.bullet.maxReloadTime - GAME_SETTINGS.bullet.minReloadTime)) * 100}%`;
                        tanks.forEach(tank => {
                            if (tank) {
                                tank.reloadTime = newTime;
                                tank.lastShotTime = Date.now() - newTime;
                            }
                        });
                    }
                }
            }
        });
    });

    document.getElementById('createMap')?.addEventListener('click', () => {
        console.log('Нажата кнопка создания карты');
        try {
            showMapEditor();
        } catch (error) {
            console.error('Ошибка при открытии редактора:', error);
        }
    });

    document.getElementById('createSprite').addEventListener('click', () => {
        console.log('Открываем редактор спрайтов');
        document.querySelector('.menu').style.display = 'none';
        document.querySelector('.sprite-editor').style.display = 'block';
        document.getElementById('gameCanvas').style.display = 'none';
        initSpriteEditor(); // Инициализируем редактор спрайтов
    });

    function showMapEditor() {
        console.log('Открываем редактор карты');
        
        // Активируем игру
        setGameState(true);
        
        // Очищаем массив танков
        tanks = [];
        gameField.tanks = tanks;
        
        // Скрываем меню
        const menu = document.querySelector('.menu');
        if (menu) {
            menu.style.display = 'none';
        }

        // Показываем canvas
        const canvas = document.getElementById('gameCanvas');
        canvas.style.display = 'block';
        
        // Инициализируем размеры canvas
        canvas.width = 368;
        canvas.height = 698;
        
        // Очищаем и инициализируем временный canvas
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Инициализируем игровое поле
        const fieldWidth = Math.floor(canvas.width / gridSize);
        const fieldHeight = Math.floor(canvas.height / gridSize);
        gameField = new GameField(fieldWidth, fieldHeight, gridSize);
        
        // Запускае�� отрисовку
        requestAnimationFrame(draw);
        
        // Удаляем старую панель инструментов, если она есть
        const oldTools = document.querySelector('.editor-tools');
        if (oldTools) {
            oldTools.remove();
        }
        
        // Показываем панель инструментов редактора
        const editorTools = document.createElement('div');
        editorTools.className = 'editor-tools';
        editorTools.innerHTML = `
            <button class="tool-button" data-tool="wall">Стена</button>
            <button class="tool-button" data-tool="empty">Пустота</button>
            <button class="tool-button" data-tool="bush">Куст</button>
            <button class="tool-button" data-tool="water">Вода</button>
            <button class="tool-button" data-tool="spawn">Точка спавна</button>
            <button id="testTank1">Танк 1</button>
            <button id="testTank2">Танк 2</button>
            <button id="saveMap">Сохранить</button>
            <button id="backToMenu">Назад</button>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.appendChild(editorTools);
            
            // Добавляем обработчики для тестовых танков после добавления кнопок в DOM
            document.getElementById('testTank1').addEventListener('click', () => {
                if (!tanks[0]) {
                    const startX = Math.floor(gameField.width / 4) - 2;
                    const startY = Math.floor(gameField.height / 2) - 3;
                    
                    if (gameField.isTankAreaClear(startX, startY, 5, 5)) {
                        const sprite = selectedTankType === 'custom' ? customSprites.tank : null;
                        tanks[0] = new Tank(startX, startY, gameField, '#1B5E20', sprite, '#4CAF50');
                        gameField.tanks = tanks;
                    }
                }
            });

            document.getElementById('testTank2').addEventListener('click', () => {
                if (!tanks[1]) {
                    const startX = Math.floor(gameField.width * 3/4) - 2;
                    const startY = Math.floor(gameField.height / 2) - 3;
                    
                    if (gameField.isTankAreaClear(startX, startY, 5, 5)) {
                        tanks[1] = new Tank(startX, startY, gameField, '#1B5E20', null, '#4CAF50');
                        gameField.tanks = tanks;
                    }
                }
            });
        }
        
        // Добавляем обработчики клавиш
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
        }
        if (keyupHandler) {
            document.removeEventListener('keyup', keyupHandler);
        }
        keydownHandler = handleTankControl;
        keyupHandler = handleKeyUp;
        document.addEventListener('keydown', keydownHandler);
        document.addEventListener('keyup', keyupHandler);
        
        // Обработчики для инструментов
        editorTools.addEventListener('click', (e) => {
            if (e.target.dataset.tool) {
                currentTool = e.target.dataset.tool;
                // Подсвечиваем активный инструмент
                document.querySelectorAll('.tool-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
            }
        });
        
        // Добавляем обработчики для canvas
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        
        // Добавляем танки в gameField для проверки столкновений
        gameField.tanks = tanks;
    }

    function handleCanvasClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / gridSize);
        const y = Math.floor((e.clientY - rect.top) / gridSize);
        
        gameField.setCell(x, y, currentTool);
    }

    function handleCanvasMouseMove(e) {
        if (e.buttons === 1) { // Если нажата левая кнопка мыши
            handleCanvasClick(e);
        }
    }

    // Добавляем throttling для мобильных устройств
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const targetFPS = isMobile ? 30 : 60;
    const frameDelay = 1000 / targetFPS;

    // Оптимизируем функцию draw
    function draw(currentTime) {
        // Не отрисовываем, если игра неактивна
        if (!isGameActive) {
            requestAnimationFrame(draw);
            return;
        }

        // Пропускаем кадр если не прошло достаточно времени
        if (currentTime - lastFrameTime < frameDelay) {
            requestAnimationFrame(draw);
            return;
        }
        lastFrameTime = currentTime;

        // Очищаем canvas
        tempCtx.fillStyle = '#000000';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Отрисовка игрового поля
        gameField.draw(tempCtx);
        
        // Отрисовка танков
        if (tanks && tanks.length > 0) {
            tanks.forEach((tank, index) => {
                if (tank && !tank.isDestroyed) {
                    tempCtx.save();
                    tempCtx.globalAlpha = 1.0;
                    tempCtx.globalCompositeOperation = 'source-over';
                    tank.draw(tempCtx);
                    
                    // Отрисовка пуль танка
                    tank.bullets.forEach(bullet => {
                        if (bullet && bullet.active) {
                            bullet.draw(tempCtx);
                        }
                    });
                    tempCtx.restore();
                }
            });
        }

        // Отрисовка кустов поверх всего
        gameField.drawBushes(tempCtx);

        // Копируем результат на основной canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);

        // Обновляем состояние
        if (isGameActive) {
            updateTanks();
        }

        requestAnimationFrame(draw);
    }

    draw();

    // Добвляем глобальный обработчик для кнопки "Назад"
    document.addEventListener('click', (e) => {
        if (e.target.id === 'backToMenu') {
            // Удаляем панели
            const editorTools = document.querySelector('.editor-tools');
            if (editorTools) {
                editorTools.remove();
            }
            
            const settingsPanel = document.querySelector('.settings-panel');
            if (settingsPanel) {
                settingsPanel.remove();
            }
            
            // Показываем меню и canvas
            document.querySelector('.menu').style.display = 'flex';
            document.getElementById('gameCanvas').style.display = 'block';
            
            // Удаляем обработчики клавиш
            if (keydownHandler) {
                document.removeEventListener('keydown', keydownHandler);
            }
            if (keyupHandler) {
                document.removeEventListener('keyup', keyupHandler);
            }
            
            // Очищаем танки
            tanks = [];
            gameField.tanks = [];
            
            // Очищаем поле
            gameField.initGrid();
            
            // Очищаем временный canvas
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Очищаем основной canvas
            const canvas = document.getElementById('gameCanvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Останав��иваем игровой цикл
            setGameState(false);
        }
    });

    // Добавим обаботчики выбора танка
    document.querySelectorAll('.tank-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.tank-option').forEach(opt => 
                opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedTankType = option.classList.contains('default-tank') ? 'default' : 'custom';
        });
    });

    // Обработчик кнопки "Выбрать"
    document.getElementById('selectTankBtn').addEventListener('click', () => {
        document.querySelector('.tank-selector').style.display = 'none';
        document.querySelector('.menu').style.display = 'flex';
    });

    // бработчик кнопки "Назд"
    document.getElementById('backFromTankSelect').addEventListener('click', () => {
        document.querySelector('.tank-selector').style.display = 'none';
        document.querySelector('.menu').style.display = 'flex';
    });
}); 

// Функция управления танком
function handleTankControl(e) {
    pressedKeys.add(e.key.toLowerCase());
}

function handleKeyUp(e) {
    pressedKeys.delete(e.key.toLowerCase());
}

// Добавляем функцию обновления состояния танка
function updateTanks() {
    tanks.forEach(tank => {
        if (tank && !tank.isDestroyed) {
            // Обновляем пули
            tank.bullets.forEach(bullet => {
                if (bullet.active) {
                    bullet.update();
                }
            });
        }
    });

    // Управление первым танком
    if (tanks[0] && !tanks[0].isDestroyed) {
        if (pressedKeys.has('arrowup')) tanks[0].moveForward();
        if (pressedKeys.has('arrowdown')) tanks[0].moveBackward();
        if (pressedKeys.has('arrowleft') && !previousKeys.has('arrowleft')) {
            tanks[0].rotateLeft();
        }
        if (pressedKeys.has('arrowright') && !previousKeys.has('arrowright')) {
            tanks[0].rotateRight();
        }
        if (pressedKeys.has(' ')) tanks[0].shoot();
    }

    // Управление вторым танком
    if (tanks[1] && !tanks[1].isDestroyed) {
        if (pressedKeys.has('w')) tanks[1].moveForward();
        if (pressedKeys.has('s')) tanks[1].moveBackward();
        if (pressedKeys.has('a') && !previousKeys.has('a')) {
            tanks[1].rotateLeft();
        }
        if (pressedKeys.has('d') && !previousKeys.has('d')) {
            tanks[1].rotateRight();
        }
        if (pressedKeys.has('e')) tanks[1].shoot();
    }

    previousKeys = new Set(pressedKeys);
} 

// Функции для рисования спрайтов
function initSpriteEditor() {
    const canvas = document.getElementById('spriteCanvas');
    const ctx = canvas.getContext('2d');
    
    // Создаем объект для хранения обработчиков
    const handlers = {
        mousedown: handleMouseDown,
        mousemove: handleMouseMove,
        mouseup: handleMouseUp,
        mouseleave: handleMouseUp
    };
    
    // Добавляем об��аботчики
    Object.entries(handlers).forEach(([event, handler]) => {
        canvas.addEventListener(event, handler);
    });
    
    // Функция очистки обработчиков
    function cleanupSpriteEditor() {
        Object.entries(handlers).forEach(([event, handler]) => {
            canvas.removeEventListener(event, handler);
        });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Добавляем очистку при выходе
    document.getElementById('backToMenu').addEventListener('click', () => {
        cleanupSpriteEditor();
        document.querySelector('.sprite-editor').style.display = 'none';
        document.querySelector('.menu').style.display = 'flex';
    });
} 

// �� обраотчики кнопок "Назад" и "Выбрать"
function cleanupTankSelector() {
    document.querySelector('.tank-selector').style.display = 'none';
    document.querySelector('.menu').style.display = 'flex';
    // Удаляем кнопку и панель настроек
    document.querySelector('.toggle-settings')?.remove();
    document.querySelector('.settings-panel')?.remove();
}

document.getElementById('selectTankBtn').addEventListener('click', cleanupTankSelector);
document.getElementById('backFromTankSelect').addEventListener('click', cleanupTankSelector); 

// Обработчик выхода со страницы
window.addEventListener('beforeunload', () => {
    setGameState(false);
});

// При переключении между разделами мню
function switchSection(sectionId) {
    // Скрываем все разделы
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Очищаем canvas если он существует
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Показываем нужный раздел
    document.getElementById(sectionId).style.display = 'block';
}

// Добавляем в начало файла после существующих переменных
let currentGames = [];

// Обновляем обработчики в DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    // ... существующий код ...

    // Обновляем обработчики кнопок
    document.getElementById('createGame').addEventListener('click', () => {
        hideAllMenus();
        document.querySelector('.game-creation-menu').style.display = 'block';
    });

    document.getElementById('selectGame').addEventListener('click', () => {
        hideAllMenus();
        document.querySelector('.game-list-menu').style.display = 'block';
        refreshGamesList();
    });

    // Добавляем обработчики для кнопок "Назад"
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            hideAllMenus();
            document.querySelector('.menu').style.display = 'flex';
        });
    });

    // Добавляем обработчик обновления списка игр
    document.querySelector('.refresh-button').addEventListener('click', refreshGamesList);

    // Добавляем обработчик для кнопки "Покинуть игру"
    document.querySelector('.leave-button').addEventListener('click', () => {
        leaveGame();
        hideAllMenus();
        document.querySelector('.menu').style.display = 'flex';
    });

    // ... остальной существующий код ...
});

// Добавляем функцию для проверки состояния игры
function checkGameState() {
    if (!currentGame) return;

    // Проверяем количество игроков
    if (currentGame.players.length < 2) {
        tg.showAlert('Ожидание других игроков...');
        return;
    }

    // Проверяем готовность игроков
    const allReady = currentGame.players.every(player => player.ready);
    if (!allReady) {
        tg.showAlert('Ожидание готовности всех игроков...');
        return;
    }

    // Проверяем баланс команд
    const teams = currentGame.players.reduce((acc, player) => {
        if (player.team === 0) acc.team0++;
        if (player.team === 1) acc.team1++;
        return acc;
    }, { team0: 0, team1: 0 });

    if (teams.team0 !== teams.team1) {
        tg.showAlert('Команды не сбалансированы!');
        return;
    }

    // Если все условия выполнены, начинаем игру
    startGame();
}

// Обновляем функцию startGame
function startGame() {
    // Скрываем все меню
    hideAllMenus();
    
    // Показываем игровое поле
    const canvas = document.getElementById('gameCanvas');
    canvas.style.display = 'block';
    
    // Инициализируем игровое поле
    const fieldWidth = Math.floor(canvas.width / gridSize);
    const fieldHeight = Math.floor(canvas.height / gridSize);
    gameField = new GameField(fieldWidth, fieldHeight, gridSize);
    
    // Создаем танки для всех игроков
    currentGame.players.forEach((player, index) => {
        const isTeamGreen = player.team === 0;
        const startX = isTeamGreen ? 
            Math.floor(gameField.width / 4) - 2 : 
            Math.floor(gameField.width * 3/4) - 2;
        const startY = Math.floor(gameField.height / 2) - 3;
        
        if (gameField.isTankAreaClear(startX, startY, 5, 5)) {
            const tank = new Tank(
                startX, 
                startY, 
                gameField, 
                isTeamGreen ? '#1B5E20' : '#B71C1C',
                null,
                isTeamGreen ? '#4CAF50' : '#F44336'
            );
            tanks.push(tank);
        }
    });
    
    gameField.tanks = tanks;
    
    // Активируем игру
    setGameState(true);
    
    // Запускаем игровой цикл
    requestAnimationFrame(draw);
}