// --- CONFIGURATION ---
const UNIT_TYPES = {
    warrior: {
        name: "Warrior", 
        label: "🛡️", // Shield Emoji
        color: "#d35400", // Dark Orange
        styles: { borderRadius: "50%" }, // Circle
        stats: { hp: 200, attack: 20, range: 60, hitChance: 0.95, moveSpeed: 1.0, attackCooldown: 1000 }
    },
    archer: {
        name: "Archer", 
        label: "🏹", // Bow Emoji
        color: "#27ae60", // Green
        styles: { borderRadius: "8px" }, // Rounded Square
        stats: { hp: 80, attack: 12, range: 300, hitChance: 0.85, moveSpeed: 0.8, attackCooldown: 800 }
    },
    mage: {
        name: "Mage", 
        label: "🔮", // Crystal Emoji
        color: "#2980b9", // Blue
        styles: { borderRadius: "50%", border: "2px dashed white" }, // Magic Circle
        stats: { hp: 70, attack: 40, range: 180, hitChance: 0.70, moveSpeed: 0.6, attackCooldown: 1500 }
    },
    rogue: {
        name: "Rogue", 
        label: "🗡️", // Dagger Emoji
        color: "#8e44ad", // Purple
        styles: { borderRadius: "4px", transform: "skew(-10deg)" }, // Slightly tilted (agile)
        textStyles: { transform: "skew(10deg)" }, // Fixes emoji tilt
        stats: { hp: 90, attack: 25, range: 50, hitChance: 0.90, moveSpeed: 2.2, attackCooldown: 600 }
    }
};

// --- GLOBAL STATE ---
let draggedType = null;
let isGameRunning = false; // Game starts paused
let gameEnded = false;

const OBJECTIVES = {
    A: { hp: 1000, maxHp: 1000, elBar: null, name: "Blue" },
    B: { hp: 1000, maxHp: 1000, elBar: null, name: "Red" }
};

document.addEventListener('DOMContentLoaded', () => {
    
    // UI References
    const selectionBar = document.getElementById('selection-bar');
    const startBtn = document.getElementById('btn-start');
    const statusTitle = document.querySelector('#controls-panel h2');
    OBJECTIVES.A.elBar = document.querySelector('#hp-a .hp-fill');
    OBJECTIVES.B.elBar = document.querySelector('#hp-b .hp-fill');

    if (!selectionBar) return;

    // 1. Setup Selection Bar
    Object.keys(UNIT_TYPES).forEach(key => {
        const type = UNIT_TYPES[key];
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';

        const el = createUnitVisual(key, type);
        el.setAttribute('draggable', true);
        
        el.addEventListener('dragstart', (e) => { 
            if (isGameRunning) {
                e.preventDefault(); // Block drag if game started
                return;
            }
            draggedType = key; 
            e.dataTransfer.effectAllowed = 'copy';
            el.style.opacity = '0.5';
        });
        el.addEventListener('dragend', () => el.style.opacity = '1');

        const statsInfo = document.createElement('div');
        statsInfo.className = 'stat-tooltip';
        statsInfo.innerHTML = `HP:${type.stats.hp} ⚔️${type.stats.attack}`;

        wrapper.appendChild(el);
        wrapper.appendChild(statsInfo);
        selectionBar.appendChild(wrapper);
    });

    // 2. Setup Dropzones
    document.querySelectorAll('.dropzone').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            if (!isGameRunning && draggedType) { // Only allow drop if not running
                spawnUnit(zone, draggedType, e.clientX, e.clientY);
            }
        });
    });

    // 3. START BUTTON EVENT
    startBtn.addEventListener('click', () => {
        if(isGameRunning) return;
        
        isGameRunning = true;
        
        // Update UI
        startBtn.disabled = true;
        startBtn.innerText = "BATTLE IN PROGRESS...";
        statusTitle.innerText = "COMBAT PHASE";
        selectionBar.classList.add('disabled'); // Visual grey out

        // Start Loop
        requestAnimationFrame(gameLoop);
    });

    // 4. REMOVE UNIT ON CLICK (DURING PLANNING)
    document.getElementById('game-board').addEventListener('click', (e) => {
        // Only works if game is not running
        if (isGameRunning) return;

        // Checks if target is a placed unit
        if (e.target.classList.contains('placed-unit')) {
            e.target.remove(); // Remove unit from DOM
        }
    });
});

// --- SPAWN AND VISUALS ---

function createUnitVisual(key, config) {
    const div = document.createElement('div');
    div.className = 'unit';
    div.dataset.type = key;
    div.style.backgroundColor = config.color;
    if (config.styles) Object.assign(div.style, config.styles);
    
    const span = document.createElement('span');
    span.innerText = config.label;
    if (config.textStyles) Object.assign(span.style, config.textStyles);
    
    div.appendChild(span);
    return div;
}

function spawnUnit(zone, type, clientX, clientY) {
    const board = document.getElementById('game-board');
    const boardRect = board.getBoundingClientRect();

    const el = createUnitVisual(type, UNIT_TYPES[type]);
    el.classList.add('placed-unit');
    const team = zone.id === 'zone-1' ? '1' : '2';
    el.dataset.team = team;

    let posX = clientX - boardRect.left - 20; 
    let posY = clientY - boardRect.top - 20;
    posX = Math.max(0, Math.min(posX, boardRect.width - 40));
    posY = Math.max(0, Math.min(posY, boardRect.height - 40));

    el.style.left = posX + 'px';
    el.style.top = posY + 'px';
    
    // Units start with stats and position saved
    el.gameStats = { 
        ...UNIT_TYPES[type].stats,
        currentHp: UNIT_TYPES[type].stats.hp,
        maxHp: UNIT_TYPES[type].stats.hp,
        lastAttackTime: 0,
        x: posX, 
        y: posY
    }; 

    board.appendChild(el);
}

// --- GAME LOOP ---

function gameLoop(timestamp) {
    if (gameEnded) return; // Stop loop if ended

    const board = document.getElementById('game-board');
    const allUnits = Array.from(document.querySelectorAll('.placed-unit'));
    const targetA = document.getElementById('target-a');
    const targetB = document.getElementById('target-b');

    allUnits.forEach(unit => {
        if (!unit.isConnected) return;

        const team = unit.dataset.team;
        const enemyTeam = team === '1' ? '2' : '1';
        
        const enemies = allUnits.filter(u => u.dataset.team === enemyTeam);
        const mainObjective = team === '1' ? targetB : targetA;
        
        updateUnitBehavior(unit, enemies, mainObjective, timestamp);
    });

    requestAnimationFrame(gameLoop);
}

function updateUnitBehavior(me, enemies, mainObjective, time) {
    const stats = me.gameStats;
    let target = null;
    let minDist = Infinity;

    enemies.forEach(enemy => {
        const d = getDistance(me, enemy);
        if (d < minDist) { minDist = d; target = enemy; }
    });

    const distToObjective = getDistance(me, mainObjective);
    if (distToObjective < minDist) { minDist = distToObjective; target = mainObjective; }

    if (!target) return;

    if (minDist > stats.range) {
        moveTowards(me, target, stats.moveSpeed);
    } else {
        if (time - stats.lastAttackTime > stats.attackCooldown) {
            performAttack(me, target);
            stats.lastAttackTime = time;
        }
    }
}

function moveTowards(unit, target, speed) {
    const uRect = unit.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const ux = uRect.left + uRect.width / 2;
    const uy = uRect.top + uRect.height / 2;
    const tx = tRect.left + tRect.width / 2;
    const ty = tRect.top + tRect.height / 2;

    const dx = tx - ux;
    const dy = ty - uy;
    const distance = Math.sqrt(dx*dx + dy*dy);
    if (distance === 0) return;

    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;

    unit.gameStats.x += vx;
    unit.gameStats.y += vy;
    unit.style.left = unit.gameStats.x + 'px';
    unit.style.top = unit.gameStats.y + 'px';
}

function performAttack(attacker, target) {
    const team = attacker.dataset.team;
    const color = team === '1' ? 'var(--zone1-color)' : 'var(--zone2-color)';
    const stats = attacker.gameStats;

    fireProjectile(attacker, target, color, () => {
        if (Math.random() <= stats.hitChance) {
            takeDamage(target, stats.attack);
        } else {
            showFloatingText(target, "MISS", "#95a5a6");
        }
    });
}

// --- DAMAGE AND VICTORY ---

function takeDamage(targetEl, damage) {
    // Logic for OBJECTIVES (Base)
    if (targetEl.id === 'target-a' || targetEl.id === 'target-b') {
        const id = targetEl.id === 'target-a' ? 'A' : 'B';
        const obj = OBJECTIVES[id];
        obj.hp -= damage;
        
        const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
        if (obj.elBar) obj.elBar.style.width = pct + '%';
        
        showFloatingText(targetEl, `-${damage}`, "#e74c3c");

        // CHECK GAME OVER
        if (obj.hp <= 0 && !gameEnded) {
            endGame(id === 'A' ? '2' : '1'); // If A died, team 2 wins
        }
        return;
    }

    // Logic for UNITS
    if (targetEl.gameStats) {
        targetEl.gameStats.currentHp -= damage;
        showFloatingText(targetEl, `-${damage}`, "#e74c3c");
        if (targetEl.gameStats.currentHp <= 0) {
            createExplosion(targetEl);
            targetEl.remove();
        }
    }
}

function endGame(winningTeam) {
    gameEnded = true;
    const modal = document.getElementById('game-over-modal');
    const winnerText = document.getElementById('winner-text');
    
    modal.classList.remove('hidden');
    
    if (winningTeam === '1') {
        winnerText.innerText = "BLUE TEAM WINS!";
        winnerText.style.color = "cyan";
    } else {
        winnerText.innerText = "RED TEAM WINS!";
        winnerText.style.color = "orangered";
    }
}

// --- UTILITIES ---

function getDistance(el1, el2) {
    const r1 = el1.getBoundingClientRect();
    const r2 = el2.getBoundingClientRect();
    return Math.sqrt(Math.pow((r2.left + r2.width/2) - (r1.left + r1.width/2), 2) + Math.pow((r2.top + r2.height/2) - (r1.top + r1.height/2), 2));
}

function fireProjectile(from, to, color, onHit) {
    const board = document.getElementById('game-board');
    if(!board || !from.isConnected || !to.isConnected) return; // Safety check

    const bRect = board.getBoundingClientRect();
    const fRect = from.getBoundingClientRect();
    const tRect = to.getBoundingClientRect();

    const p = document.createElement('div');
    p.className = 'projectile';
    p.style.backgroundColor = color;
    
    const startX = fRect.left + fRect.width/2 - bRect.left;
    const startY = fRect.top + fRect.height/2 - bRect.top;
    
    p.style.left = startX + 'px';
    p.style.top = startY + 'px';
    board.appendChild(p);

    const destX = (tRect.left + tRect.width/2 - bRect.left);
    const destY = (tRect.top + tRect.height/2 - bRect.top);

    const anim = p.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${destX - startX}px, ${destY - startY}px)` }
    ], { duration: 200, easing: 'linear' });

    anim.onfinish = () => {
        p.remove();
        if (to.isConnected) onHit(); // Only apply damage if target still exists
    };
}

function showFloatingText(target, text, color) {
    const board = document.getElementById('game-board');
    if(!target.isConnected) return;
    const rect = target.getBoundingClientRect();
    const bRect = board.getBoundingClientRect();
    const floatEl = document.createElement('div');
    floatEl.className = 'floating-text';
    floatEl.innerText = text;
    floatEl.style.color = color;
    floatEl.style.left = (rect.left + rect.width/2 - bRect.left) + 'px';
    floatEl.style.top = (rect.top - bRect.top) + 'px';
    board.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 800);
}

function createExplosion(el) {
    const board = document.getElementById('game-board');
    const rect = el.getBoundingClientRect();
    const bRect = board.getBoundingClientRect();
    const exp = document.createElement('div');
    exp.innerText = "💀";
    exp.style.position = "absolute";
    exp.style.fontSize = "30px";
    exp.style.left = (rect.left - bRect.left) + "px";
    exp.style.top = (rect.top - bRect.top) + "px";
    board.appendChild(exp);
    setTimeout(() => exp.remove(), 1000);
}