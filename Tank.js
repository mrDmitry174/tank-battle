// Определяем класс Bullet в начале файла
class Bullet {
    constructor(x, y, direction, gameField, owner) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.gameField = gameField;
        this.speed = GAME_SETTINGS.bullet.speed;
        this.active = true;
        this.owner = owner; // Танк, который выпустил пулю
        this.damage = 1;  // Урон пули
    }

    update() {
        if (!this.active) return;

        // Сохраняем старые координаты
        const oldX = this.x;
        const oldY = this.y;

        // Движение пули
        switch(this.direction) {
            case 0: // вверх
                this.y -= this.speed;
                break;
            case 1: // вправо
                this.x += this.speed;
                break;
            case 2: // вниз
                this.y += this.speed;
                break;
            case 3: // влево
                this.x -= this.speed;
                break;
        }

        // Проверяем все точ на пути пули с маленьким шагом
        const steps = 10; // Количество проверок между старой и новой позицией
        for (let i = 0; i <= steps; i++) {
            const checkX = oldX + (this.x - oldX) * (i / steps);
            const checkY = oldY + (this.y - oldY) * (i / steps);
            
            // Проверяем стену в текущей точке
            if (this.gameField.isWall(Math.floor(checkX), Math.floor(checkY))) {
                // Наносим урон стене
                this.gameField.damageWall(Math.floor(checkX), Math.floor(checkY), this.damage);
                this.active = false;
                return;
            }
        }

        // Проверка попадания в танки
        const tanks = this.gameField.tanks || [];
        for (let tank of tanks) {
            if (tank !== this.owner && !tank.isDestroyed && 
                tank.checkHit(Math.floor(this.x), Math.floor(this.y))) {
                this.active = false;
                break;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;

        const cellSize = this.gameField.cellSize;
        ctx.fillStyle = '#FF0000';
        
        // Используем размер пули в половину клетки
        const bulletSize = cellSize / 2;
        
        // Центрируем пулю
        ctx.fillRect(
            this.x * cellSize + (cellSize - bulletSize) / 2,
            this.y * cellSize + (cellSize - bulletSize) / 2,
            bulletSize,
            bulletSize
        );
    }
}

// Затем идет класс Tank
class Tank {
    constructor(x, y, gameField, bodyColor, sprite = null, towerColor = null) {
        this.x = x;
        this.y = y;
        this.width = 5;
        this.height = 5;
        this.gameField = gameField;
        this.bodyColor = bodyColor;      // Цвет корпуса
        this.towerColor = towerColor || bodyColor;  // Цвет башни (если не указан, используем цвет корпуса)
        this.direction = 0;
        this.moveSpeed = GAME_SETTINGS.tank.moveSpeed;
        this.reloadTime = GAME_SETTINGS.bullet.reloadTime;
        this.lastShotTime = Date.now() - this.reloadTime;
        this.isDestroyed = false;
        
        // Добавляем необходимые свойства
        this.bullets = [];
        this.accumulatedX = 0;
        this.accumulatedY = 0;

        // Возвращаем систему брони
        this.armor = {
            front: 10,
            right: 10,
            back: 10,
            left: 10
        };
        this.maxArmor = 10;
        
        // Возвращаем систему отображения шкал брони (по умолчанию скрыты)
        this.showArmorBars = {
            front: false,
            right: false,
            back: false,
            left: false
        };
        
        // Инициализируем таймеры для скрытия индикаторов
        this.armorBarsTimers = {
            front: null,
            right: null,
            back: null,
            left: null
        };
        
        this.ARMOR_BARS_SHOW_TIME = 2000; // 2 секунды показа при попадании

        this.sprite = sprite; // Добавляем спрайт

        // Кэшируем часто используемые значения
        this._cellSize = gameField.cellSize;
        this._lastDrawnX = null;
        this._lastDrawnY = null;
        this._lastDirection = null;
        
        // Создаем кэш для спрайта танка с правильными размерами
        this._spriteCache = document.createElement('canvas');
        this._spriteCacheCtx = this._spriteCache.getContext('2d', { alpha: true });
        this._spriteCache.width = this._cellSize * 5;
        this._spriteCache.height = this._cellSize * 5;
        
        // Предварительно рендерим базовый спрайт
        this._renderBaseSprite();

        // Добавляем кэш для статусных баров
        this._statusBarCache = document.createElement('canvas');
        this._statusBarCtx = this._statusBarCache.getContext('2d');
        this._statusBarCache.width = this._cellSize * 8;  // Увеличим размер
        this._statusBarCache.height = this._cellSize * 8; // Увеличим размер
        
        // Добавляем флаг для перерисовки статуса
        this._needStatusUpdate = true;
    }

    _renderBaseSprite() {
        // Рендерим базовую версию танка в кэш
        const ctx = this._spriteCacheCtx;
        
        // Очищаем canvas перед рисованием
        ctx.clearRect(0, 0, this._spriteCache.width, this._spriteCache.height);
        
        // Гусеницы (делаем их чуть меньше общего размера)
        ctx.fillStyle = '#000000'; // Чёрный цвет для гусениц
        ctx.fillRect(
            this._cellSize * 0.1,  // Отступ слева
            0,                     // Сверху
            this._cellSize * 0.8,  // Ширина левой гусеницы
            this._cellSize * 5     // Полная высота
        );
        ctx.fillRect(
            this._cellSize * 4.1,  // Отступ справа
            0,                     // Сверху
            this._cellSize * 0.8,  // Ширина правой гусеницы
            this._cellSize * 5     // Полная высота
        );
        
        // Корпус (делаем его чуть меньше, чтобы были видны гусеницы)
        ctx.fillStyle = this.bodyColor;
        ctx.fillRect(
            this._cellSize * 0.5,  // Отступ от края
            this._cellSize * 0.5,  // Отступ сверху
            this._cellSize * 4,    // Ширина корпуса
            this._cellSize * 4     // Высота корпуса
        );
        
        // Башня (по центру корпуса)
        ctx.fillStyle = this.towerColor;
        ctx.fillRect(
            this._cellSize * 1.5,  // Отступ от края
            this._cellSize * 1.5,  // Отступ сверху
            this._cellSize * 2,    // Ширина башни
            this._cellSize * 2     // Высота башни
        );
    }

    // Изменяем метод проверки попадания
    checkHit(x, y) {
        if (this.isDestroyed) return false;
        
        const hitX = Math.floor(x);
        const hitY = Math.floor(y);
        
        // Проверяем попадание в танк
        const hit = hitX >= this.x && hitX < this.x + this.width &&
                   hitY >= this.y && hitY < this.y + this.height;
        
        if (hit) {
            let hitSide;
            
            // Определяем сторону попадания
            if (hitX === this.x) {
                hitSide = 'left';
            }
            else if (hitX === this.x + this.width - 1) {
                hitSide = 'right';
            }
            else if (hitY === this.y) {
                hitSide = 'front';
            }
            else if (hitY === this.y + this.height - 1) {
                hitSide = 'back';
            }

            if (hitSide) {
                // Показываем индикатор брони для поврежденной стороны
                this.showArmorBars[hitSide] = true;
                if (this.armorBarsTimers[hitSide]) {
                    clearTimeout(this.armorBarsTimers[hitSide]);
                }
                this.armorBarsTimers[hitSide] = setTimeout(() => {
                    this.showArmorBars[hitSide] = false;
                    this._needStatusUpdate = true;
                }, this.ARMOR_BARS_SHOW_TIME);

                // Наносим урон
                this.armor[hitSide]--;
                if (this.armor[hitSide] < 0) this.armor[hitSide] = 0;
                this.isDestroyed = Object.values(this.armor).some(value => value <= 0);
                
                // Обновляем статус
                this._needStatusUpdate = true;
            }
        }
        
        return hit;
    }

    // Проверка коллизий с уетом размера танка
    canMove(newX, newY) {
        // Проверяем все клетки, которые заним��ет танк
        for(let y = 0; y < this.height; y++) {
            for(let x = 0; x < this.width; x++) {
                const checkX = newX + x;
                const checkY = newY + y;
                
                // Проверка стен и воды
                if (this.gameField.isWall(checkX, checkY) || this.gameField.isWater(checkX, checkY)) {
                    return false;
                }

                // Проверка столкновений с другими танками
                const tanks = this.gameField.tanks || [];
                for (let tank of tanks) {
                    if (tank !== this && !tank.isDestroyed) {
                        if (checkX >= tank.x && checkX < tank.x + tank.width &&
                            checkY >= tank.y && checkY < tank.y + tank.height) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    // Попытка движения
    tryMove(dx, dy) {
        this.accumulatedX += dx * this.moveSpeed;
        this.accumulatedY += dy * this.moveSpeed;

        const newX = this.x + Math.floor(this.accumulatedX);
        const newY = this.y + Math.floor(this.accumulatedY);

        if (newX !== this.x || newY !== this.y) {
            if (this.canMove(newX, newY)) {
                this.x = newX;
                this.y = newY;
                this.accumulatedX -= Math.floor(this.accumulatedX);
                this.accumulatedY -= Math.floor(this.accumulatedY);
                return true;
            } else {
                this.accumulatedX = 0;
                this.accumulatedY = 0;
            }
        }
        return false;
    }

    // Поворот танка
    rotate(newDirection) {
        if (this.isDestroyed) return false;
        
        this.direction = newDirection;
        this._needStatusUpdate = true; // Обновляем статус при любом повороте
        return true;
    }

    // Отрисовка танка
    draw(ctx) {
        if (this.isDestroyed) return;

        const drawX = this.x * this._cellSize;
        const drawY = this.y * this._cellSize;

        ctx.save();
        ctx.translate(
            drawX + (this._cellSize * 2.5),
            drawY + (this._cellSize * 2.5)
        );
        ctx.rotate((this.direction * 90) * Math.PI / 180);

        // спользуем кэшированный спрайт
        ctx.drawImage(
            this._spriteCache,
            -this._cellSize * 2.5,
            -this._cellSize * 2.5
        );

        ctx.restore();

        // Отрисовка статуса
        this.drawStatus(ctx);
    }

    _drawHealthAndReload(ctx) {
        // Отдельный метод для отрисовки UI танка
        // ... код отрисовки здоровья и перезарядки ...
    }

    // Движение впере/назад с учетом направления
    moveForward() {
        switch(this.direction) {
            case 0: // вверх
                return this.tryMove(0, -1);
            case 1: // вправо
                return this.tryMove(1, 0);
            case 2: // вниз
                return this.tryMove(0, 1);
            case 3: // влево
                return this.tryMove(-1, 0);
        }
    }

    moveBackward() {
        switch(this.direction) {
            case 0: // вверх
                return this.tryMove(0, 1);
            case 1: // вправо
                return this.tryMove(-1, 0);
            case 2: // вниз
                return this.tryMove(0, -1);
            case 3: // вл��во
                return this.tryMove(1, 0);
        }
    }

    // Поворот влево
    rotateLeft() {
        const newDirection = (this.direction + 3) % 4; // +3 это -1 по модулю 4
        const result = this.rotate(newDirection);
        if (result) {
            this._needStatusUpdate = true; // Обновляем статус при повороте
        }
        return result;
    }

    // Поворот вправо
    rotateRight() {
        const newDirection = (this.direction + 1) % 4;
        const result = this.rotate(newDirection);
        if (result) {
            this._needStatusUpdate = true; // Обновляем статус при повороте
        }
        return result;
    }

    shoot() {
        if (this.isDestroyed) return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime < this.reloadTime) {
            return;
        }
        
        let bulletX, bulletY;
        
        switch(this.direction) {
            case 0: // вверх
                bulletX = this.x + 2;      // Центр по горизонтали
                bulletY = this.y - 0.1;    // Чуть выше танка (ыло -1)
                break;
            case 2: // вниз
                bulletX = this.x + 2;      // Центр по горизонтали
                bulletY = this.y + this.height - 0.9;  // Чуть ниже танка (было +this.height)
                break;
            case 1: // вправо
                bulletX = this.x + this.width - 0.9;  // Чуть равее танка (было +this.width)
                bulletY = this.y + 2;      // Центр по вертикали
                break;
            case 3: // влево
                bulletX = this.x - 0.1;    // Чуть левее танка (было -1)
                bulletY = this.y + 2;      // Цент по вертали
                break;
        }

        const bullet = new Bullet(bulletX, bulletY, this.direction, this.gameField, this);
        this.bullets.push(bullet);
        this.lastShotTime = currentTime;
    }

    // Добавим метод для отображения состояния танка
    drawStatus(ctx) {
        if (this.isDestroyed) return;

        // Всегда перерисовываем статус из-за индикатора перезарядки
        this._statusBarCtx.clearRect(0, 0, this._statusBarCache.width, this._statusBarCache.height);
        this._renderStatus(this._statusBarCtx);

        // Копируем из кэша
        ctx.drawImage(
            this._statusBarCache,
            (this.x - 1) * this._cellSize,
            (this.y - 1) * this._cellSize
        );
    }

    // При изменении брони или перезарядки
    updateStatus() {
        this._needStatusUpdate = true;
    }

    cleanup() {
        // Очищаем таймеры
        Object.keys(this.armorBarsTimers).forEach(key => {
            if (this.armorBarsTimers[key]) {
                clearTimeout(this.armorBarsTimers[key]);
                this.armorBarsTimers[key] = null;
            }
        });

        // Очищаем кэш спрайта
        if (this._spriteCache) {
            this._spriteCacheCtx.clearRect(0, 0, this._spriteCache.width, this._spriteCache.height);
            this._spriteCache.width = 0;
            this._spriteCache.height = 0;
            this._spriteCacheCtx = null;
            this._spriteCache = null;
        }

        // Очищаем пули
        this.bullets = [];

        // Очищаем кэш статусных баров
        if (this._statusBarCache) {
            this._statusBarCtx.clearRect(0, 0, this._statusBarCache.width, this._statusBarCache.height);
            this._statusBarCache.width = 0;
            this._statusBarCache.height = 0;
            this._statusBarCtx = null;
            this._statusBarCache = null;
        }
    }

    _renderStatus(ctx) {
        const cellSize = this._cellSize;
        const totalWidth = this.width * cellSize;
        const totalHeight = this.height * cellSize;
        
        // Определяем центр танка
        let centerX = (this.width + 2) * cellSize / 2;
        let centerY = (this.height + 2) * cellSize / 2;
        
        // Определяем конец дула в зависимости от направления танка
        let reloadEndX = centerX;
        let reloadEndY = centerY;
        const reloadLength = cellSize * 2; // длина дула

        switch(this.direction) {
            case 0: // вверх
                reloadEndY = centerY - reloadLength;
                break;
            case 2: // вниз
                reloadEndY = centerY + reloadLength;
                break;
            case 1: // вправо
                reloadEndX = centerX + reloadLength;
                break;
            case 3: // влево
                reloadEndX = centerX - reloadLength;
                break;
        }
        
        // Отрисовка индикатора перезарядки
        const reloadProgress = Math.min(1, (Date.now() - this.lastShotTime) / this.reloadTime);
        
        // Рисуем фон шкалы перезарядки
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = cellSize / 2;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(reloadEndX, reloadEndY);
        ctx.stroke();
        
        // Рисуем прогресс перезарядки
        ctx.strokeStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        const progressX = centerX + (reloadEndX - centerX) * reloadProgress;
        const progressY = centerY + (reloadEndY - centerY) * reloadProgress;
        ctx.lineTo(progressX, progressY);
        ctx.stroke();

        // Отрисовка шкал брони (только видимых)
        ['front', 'right', 'back', 'left'].forEach(side => {
            if (!this.showArmorBars[side]) return;
            
            const progress = this.armor[side] / this.maxArmor;
            const color = progress > 0.5 ? '#00FF00' : 
                         progress > 0.25 ? '#FFFF00' : '#FF0000';

            ctx.fillStyle = '#000000';
            
            switch(side) {
                case 'front': // Верхняя шкала
                    ctx.fillRect(cellSize, cellSize * 0.8, totalWidth, cellSize * 0.2);
                    ctx.fillStyle = color;
                    const frontStart = cellSize + (totalWidth * (1 - progress)) / 2;
                    ctx.fillRect(frontStart, cellSize * 0.8, totalWidth * progress, cellSize * 0.2);
                    break;

                case 'back': // Нижняя шкала
                    ctx.fillRect(cellSize, totalHeight + cellSize, totalWidth, cellSize * 0.2);
                    ctx.fillStyle = color;
                    const backStart = cellSize + (totalWidth * (1 - progress)) / 2;
                    ctx.fillRect(backStart, totalHeight + cellSize, totalWidth * progress, cellSize * 0.2);
                    break;

                case 'left': // Левая шкала
                    ctx.fillRect(cellSize * 0.8, cellSize, cellSize * 0.2, totalHeight);
                    ctx.fillStyle = color;
                    const leftStart = cellSize + (totalHeight * (1 - progress)) / 2;
                    ctx.fillRect(cellSize * 0.8, leftStart, cellSize * 0.2, totalHeight * progress);
                    break;

                case 'right': // Правая шкала
                    ctx.fillRect(totalWidth + cellSize, cellSize, cellSize * 0.2, totalHeight);
                    ctx.fillStyle = color;
                    const rightStart = cellSize + (totalHeight * (1 - progress)) / 2;
                    ctx.fillRect(totalWidth + cellSize, rightStart, cellSize * 0.2, totalHeight * progress);
                    break;
            }
        });
    }
} 