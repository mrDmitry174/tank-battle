class SpriteManager {
    constructor() {
        this.sprites = new Map();
        this.loadPromises = [];
    }

    loadSprite(name, url) {
        const sprite = new Image();
        const promise = new Promise((resolve, reject) => {
            sprite.onload = () => {
                this.sprites.set(name, sprite);
                resolve();
            };
            sprite.onerror = reject;
        });
        sprite.src = url;
        this.loadPromises.push(promise);
        return promise;
    }

    getSprite(name) {
        return this.sprites.get(name);
    }

    async waitForLoad() {
        await Promise.all(this.loadPromises);
    }
}

const spriteManager = new SpriteManager(); 