class GameField {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.grid = [];
        this.wallHealth = {};
        this.bushes = new Set();
        this.water = new Set();
        this.initGrid();

        // Кэшируем часто используемые текстуры
        this._textureCache = {
            wall: this._createWallTexture(),
            bush: this._createBushTexture(),
            water: this._createWaterTexture()
        };

        // Добавляем кэш для всего поля
        this._fieldCache = document.createElement('canvas');
        this._fieldCtx = this._fieldCache.getContext('2d');
        this._fieldCache.width = width * cellSize;
        this._fieldCache.height = height * cellSize;
        
        // Флаг необходимости обновления кэша
        this._needFieldUpdate = true;
    }

    initGrid() {
        for(let y = 0; y < this.height; y++) {
            this.grid[y] = [];
            for(let x = 0; x < this.width; x++) {
                if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
                    this.grid[y][x] = 'wall';
                    this.wallHealth[`${x},${y}`] = 3;
                } else {
                    this.grid[y][x] = 'empty';
                }
            }
        }
    }

    isWall(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return true;
        }
        return this.grid[y][x] === 'wall';
    }

    isWater(x, y) {
        return this.water.has(`${x},${y}`);
    }

    setCell(x, y, type) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }
        if ((x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) && type !== 'wall') {
            return false;
        }

        this.bushes.delete(`${x},${y}`);
        this.water.delete(`${x},${y}`);
        delete this.wallHealth[`${x},${y}`];
        this.grid[y][x] = 'empty';

        if (type === 'bush') {
            this.bushes.add(`${x},${y}`);
        } else if (type === 'wall') {
            this.grid[y][x] = 'wall';
            this.wallHealth[`${x},${y}`] = 3;
        } else if (type === 'water') {
            this.water.add(`${x},${y}`);
        } else {
            this.grid[y][x] = type;
        }

        this._needFieldUpdate = true;
        return true;
    }

    getCell(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }
        return this.grid[y][x];
    }

    draw(ctx) {
        // Рисуем поле
        this._renderField(ctx);
    }

    isTankAreaClear(x, y, width = 5, height = 5) {
        if (x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
            return false;
        }
        
        for (let i = x; i < x + width; i++) {
            for (let j = y; j < y + height; j++) {
                if (this.grid[j][i] !== 'empty') {
                    return false;
                }
            }
        }
        
        for (const tank of this.tanks) {
            if (tank && !tank.isDestroyed) {
                if (!(x + width <= tank.x || tank.x + 5 <= x || 
                      y + height <= tank.y || tank.y + 5 <= y)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    damageWall(x, y, damage) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }

        const key = `${x},${y}`;
        if (this.grid[y][x] === 'wall' && this.wallHealth[key] !== undefined) {
            this.wallHealth[key] -= damage;
            if (this.wallHealth[key] <= 0) {
                this.grid[y][x] = 'empty';
                delete this.wallHealth[key];
                return true;
            }
        }
        return false;
    }

    isBush(x, y) {
        return this.bushes.has(`${x},${y}`);
    }

    drawBushes(ctx) {
        ctx.fillStyle = '#0A5F0A';
        ctx.globalAlpha = 1.0;
        
        this.bushes.forEach(coord => {
            const [x, y] = coord.split(',').map(Number);
            const cellX = x * this.cellSize;
            const cellY = y * this.cellSize;
            
            ctx.fillRect(cellX, cellY, this.cellSize, this.cellSize);
            
            ctx.fillStyle = '#084F08';
            ctx.fillRect(cellX + this.cellSize/4, cellY + this.cellSize/4, 
                        this.cellSize/2, this.cellSize/2);
            
            ctx.fillStyle = '#0A5F0A';
        });
    }

    _createWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = this.cellSize;
        canvas.height = this.cellSize;
        const ctx = canvas.getContext('2d');
        // Рисуем текстуру стены
        ctx.fillStyle = '#666';
        ctx.fillRect(0, 0, this.cellSize, this.cellSize);
        return canvas;
    }

    _createBushTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = this.cellSize;
        canvas.height = this.cellSize;
        const ctx = canvas.getContext('2d');
        // Рисуем текстуру куста
        ctx.fillStyle = '#0A5F0A';
        ctx.fillRect(0, 0, this.cellSize, this.cellSize);
        ctx.fillStyle = '#084F08';
        ctx.fillRect(this.cellSize/4, this.cellSize/4, this.cellSize/2, this.cellSize/2);
        return canvas;
    }

    _createWaterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = this.cellSize;
        canvas.height = this.cellSize;
        const ctx = canvas.getContext('2d');
        // Рисуем текстуру воды
        ctx.fillStyle = '#0077BE';
        ctx.fillRect(0, 0, this.cellSize, this.cellSize);
        ctx.fillStyle = '#0099CC';
        ctx.fillRect(this.cellSize/4, this.cellSize/4, this.cellSize/2, this.cellSize/2);
        return canvas;
    }

    clearTextureCache() {
        Object.keys(this._textureCache).forEach(key => {
            const canvas = this._textureCache[key];
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
        });
        this._textureCache = {};

        // Очищаем кэш поля
        if (this._fieldCache) {
            this._fieldCtx.clearRect(0, 0, this._fieldCache.width, this._fieldCache.height);
            this._needFieldUpdate = true;
        }
    }

    _renderField(ctx) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, this.width * this.cellSize, this.height * this.cellSize);
        
        for(let y = 0; y < this.height; y++) {
            for(let x = 0; x < this.width; x++) {
                const cellX = x * this.cellSize;
                const cellY = y * this.cellSize;
                
                if (this.grid[y][x] === 'wall') {
                    const health = this.wallHealth[`${x},${y}`] || 3;
                    ctx.drawImage(this._textureCache.wall, cellX, cellY);
                }
                
                if (this.water.has(`${x},${y}`)) {
                    ctx.drawImage(this._textureCache.water, cellX, cellY);
                }
                
                ctx.strokeStyle = '#333';
                ctx.strokeRect(cellX, cellY, this.cellSize, this.cellSize);
            }
        }
    }
} 