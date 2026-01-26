
import { PlayerStats, CardType, GameContext } from "../types";
import { Logger } from "../utils/Logger";
import { getTowerProductionBonus, MAX_WALL, WIN_KING_MAX, WIN_TOWER, MAX_SHIELD } from "../utils/constants";

// 1. HELPERS
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const calculateDamage = (target: PlayerStats, dmg: number): PlayerStats => {
    if (!target) return target;
    
    // Shield Logic: Absorbs damage up to its value
    if (target.shield > 0) {
        const damageToShield = Math.min(target.shield, dmg);
        const newShield = target.shield - damageToShield;
        // If shield breaks, it shatters (visuals handled in Game.tsx via state diff or here if we have context)
        return { ...target, shield: newShield };
    }

    let remaining = dmg;
    let newWall = target.wall || 0;
    let newTower = target.tower || 0;
    let newKing = target.king || 0;

    if (newWall >= remaining) {
        newWall -= remaining;
        remaining = 0;
    } else {
        remaining -= newWall;
        newWall = 0;
    }

    if (remaining > 0) {
        if (newTower >= remaining) {
            newTower -= remaining;
            remaining = 0;
        } else {
            remaining -= newTower;
            newTower = 0;
        }
    }

    if (remaining > 0) {
        newKing -= remaining;
    }

    return {
        ...target,
        wall: Math.max(0, newWall),
        tower: Math.max(0, newTower),
        king: Math.max(0, newKing)
    };
};

// --- KING CARDS DB ---
export const KING_CARDS_DB: CardType[] = [
    { id: 'k_big', name: 'BIG', desc: 'START:, 40 KING', img: '👑', type: 3 },
    { id: 'k_son', name: 'SONOFDAD', desc: 'START:, 40 WALL, 20 TOWER, 10 KING', img: '🏰', type: 3 },
    { id: 'k_hoard', name: 'HOARDER', desc: 'START:, +20 ALL RES', img: '💰', type: 3 },
    { id: 'k_ind', name: 'INDUSTRY', desc: 'START:, +1 ALL PROD, 10 ALL RES', img: '🏭', type: 3 },
    { id: 'k_bunk', name: 'BUNKER', desc: 'START:, 60 WALL, 0 TOWER, 10 KING', img: '🛡️', type: 3 },
    { id: 'k_build', name: 'FREEMASON', desc: 'MASON CARDS:, FREE', img: '🔨', type: 3 },
    { id: 'k_war', name: 'WARLORD', desc: 'RECRUIT CARDS:, FREE', img: '⚔️', type: 3 },
    { id: 'k_wiz', name: 'WIZARD', desc: 'MAGE CARDS:, FREE', img: '💎', type: 3 },
    { id: 'k_sungo', name: 'SUNGO', desc: 'METAMORPH CARDS:, FREE', img: '🎭', type: 3 },
    { id: 'k_rich', name: 'RICHIUS', desc: 'SELF STUDY CARDS:, GIVES +4 ALL PROD', img: '🎓', type: 3 },
    { id: 'k_know', name: 'KNOWLEDGE', desc: 'SCHOOL CARDS:, GIVES +2 ALL PROD, COSTS 25/25/25', img: '📚', type: 3 },
    // REPLACED BARGAIN
    { id: 'k_bigboy', name: 'BIGBOY', desc: 'BUILD CARDS:, COST -20%', img: '🏗️', type: 3 },
    { id: 'k_conq', name: 'CONQUEROR', desc: 'WEAPON CARDS:, COST -20%', img: '⚔️', type: 3 },
    { id: 'k_wizz', name: 'WIZZARD', desc: 'MAGIC CARDS:, COST -20%', img: '🧙‍♂️', type: 3 },
    
    { id: 'k_mine', name: 'MINER', desc: 'END TURN:, +2 RANDOM RES', img: '⛏️', type: 3 },
    { id: 'k_recy', name: 'RECYCLER', desc: 'COST >= 40:, REFUND 10 BRICKS', img: '♻️', type: 3 },
    { id: 'k_snip', name: 'SNIPER', desc: 'ARCHER CARDS:, DEALS +5 DAMAGE', img: '🎯', type: 3 },
    { id: 'k_cmd', name: 'COMMANDER', desc: 'ATTACK CARDS:, GIVE +3 WALL', img: '🎖️', type: 3 },
    { id: 'k_drag', name: 'DRAGONLORD', desc: 'DRAGON CARDS:, COSTS -15 CRYSTALS', img: '🐉', type: 3 },
    { id: 'k_sab', name: 'SABOTEUR', desc: 'DEAL =>15 DMG:, ENEMY, -5 RANDOM RES', img: '💣', type: 3 },
    { id: 'k_wal', name: 'WALLIE', desc: 'WALL CARDS:, DEAL 3 DAMAGE', img: '💥', type: 3 },
    { id: 'k_ban', name: 'BANDIT', desc: 'END TURN:, 20% CHANCE, STEAL 5 RES', img: '🗡️', type: 3 },
    { id: 'k_spike', name: 'SPIKES', desc: 'WALL > 0:, IF ENEMY ATTACKS, DEAL 3 DMG', img: '🌵', type: 3 },
    { id: 'k_arch', name: 'ARCHITECT', desc: 'WALL CARDS:, GIVE +2 TOWER', img: '📐', type: 3 },
    { id: 'k_bob', name: 'BOB', desc: 'END TURN:, BUILD +2 WALL', img: '👷', type: 3 },
    { id: 'k_last', name: 'LAST STAND', desc: 'TOTAL HP < 15:, DEAL 2X DAMAGE', img: '🩸', type: 3 },
    { id: 'k_ins', name: 'INSURANCE', desc: 'IF TOWER DESTROYED:, +50 BRICKS, +50 CRYSTALS', img: '📝', type: 3 },
    { id: 'k_fire', name: 'FIREFIGHTER', desc: 'BURN DURATION:, REDUCED BY 3', img: '🚒', type: 3 },
    { id: 'k_luck', name: 'LUCKY', desc: 'PROD CARDS:, 25% CHANCE, RETURN TO HAND', img: '🍀', type: 3 },
    { id: 'k_necro', name: 'HAUNT', desc: 'DISCARD:, 25% CHANCE, DEAL 3 DMG', img: '💀', type: 3 },
    { id: 'k_wsnip', name: 'WALL SNIPER', desc: 'WALL ARCHER (50+):, ALWAYS DEALS 5 DAMAGE', img: '🏹', type: 3 },
    { id: 'k_labor', name: 'LABOR', desc: 'TOWER PROD (50+):, ALWAYS +5 ALL RES', img: '⚒️', type: 3 }
];

export const activeKingBuff = (cards: CardType[], id: string) => cards && cards.some(c => c.id === id);

// --- MAIN LOGIC EXECUTION ---
export const playCardAction = async (card: CardType, ctx: GameContext) => {
    const { 
        me, setMe, setOpponent, opponent, myKingCards, 
        addLog, playSFX, triggerAnimation, spawnParticles, updateStats,
        myHand, setMyHand, isP1, labels, triggerKingPowerSequence, returnCardToBottom, setDeck
    } = ctx;

    const playerLabel = isP1 ? labels.p1 : labels.p2;
    const opponentLabel = isP1 ? labels.p2 : labels.p1;
    const logType = isP1 ? 'PLAYER' : 'OPPONENT';
    const opLogType = isP1 ? 'OPPONENT' : 'PLAYER';

    // 1. Pay Cost (Calculation)
    let { costB, costW, costC } = getEffectiveCardCost(card, myKingCards);
    
    // Apply payment immediately to local stats copy for logic
    let afterPay = {
        ...me,
        bricks: me.bricks - costB,
        weapons: me.weapons - costW,
        crystals: me.crystals - costC
    };

    // 2. Visual Effects
    const isAttackAction = (card.desc && card.desc.includes("ATTACK"));
    
    if (isAttackAction) {
        playSFX('projectile_launch');
        triggerAnimation('PROJECTILE', isP1 ? 'RIGHT' : 'LEFT');
        await delay(600); 
        playSFX('hit_wall'); 
        spawnParticles(isP1 ? window.innerWidth * 0.8 : window.innerWidth * 0.2, window.innerHeight * 0.6, 1, 'SPARK');
    } else if (card.type === 0) {
        playSFX('build_grow');
    } else {
        playSFX('magic');
    }

    // 3. INTERCEPT STATE UPDATES
    
    // Intercept Me Update
    const updateMe = (newState: PlayerStats) => {
        // Check Shield Break on Self
        const prevShield = me.shield;
        const newShield = newState.shield;
        if (prevShield > 0 && newShield <= 0) {
            playSFX('hit_wall'); // Glass shatter sound fallback
            addLog(Logger.special(playerLabel, "SHIELD SHATTERED!"), "WARNING", true);
            spawnParticles(isP1 ? window.innerWidth * 0.2 : window.innerWidth * 0.8, window.innerHeight * 0.5, 1, 'GLASS');
        }

        const diff = Logger.diff(afterPay, newState, isP1); // Diff from POST-PAYMENT state to NEW state
        if (diff) addLog(`${playerLabel}: ${diff}`, logType, true);
        
        // Track built stats
        let built = 0;
        if (newState.king > me.king) built += (newState.king - me.king);
        if (newState.tower > me.tower) built += (newState.tower - me.tower);
        if (newState.wall > me.wall) built += (newState.wall - me.wall);
        if (built > 0) updateStats(isP1 ? 'p1' : 'p2', 'built', built);

        setMe(newState);
        afterPay = newState; // Keep tracking for multiple updates in one card
    };

    // Intercept Opponent Update (Usually damage)
    const updateOpponent = (cb: (prev: PlayerStats) => PlayerStats) => {
        setOpponent(prevOp => {
            const newOp = cb(prevOp);
            
            // Check Shield Break
            const prevShield = prevOp.shield;
            const newShield = newOp.shield;
            if (prevShield > 0 && newShield <= 0) {
                playSFX('hit_wall'); // Glass shatter sound fallback
                addLog(Logger.special(opponentLabel, "SHIELD SHATTERED!"), "WARNING", true);
                spawnParticles(isP1 ? window.innerWidth * 0.8 : window.innerWidth * 0.2, window.innerHeight * 0.5, 1, 'GLASS');
            }

            const diff = Logger.diff(prevOp, newOp, !isP1);
            if (diff) addLog(`${opponentLabel}: ${diff}`, opLogType, true);

            // Track Damage
            let dealt = 0;
            if (newOp.king < prevOp.king) dealt += (prevOp.king - newOp.king);
            if (newOp.tower < prevOp.tower) dealt += (prevOp.tower - newOp.tower);
            if (newOp.wall < prevOp.wall) dealt += (prevOp.wall - newOp.wall);
            
            if (dealt > 0) {
                updateStats(isP1 ? 'p1' : 'p2', 'dmg', dealt);
                updateStats(isP1 ? 'p2' : 'p1', 'taken', dealt);

                // SABOTEUR EFFECT LOGIC
                // "DEAL => 15 DMG: ENEMY, -5 RANDOM RES"
                // Fix: Exclude Special Cards (Type 4)
                if (dealt >= 15 && activeKingBuff(myKingCards, 'k_sab') && card.type !== 4) {
                    // We modify newOp directly before returning
                    let stealCount = 5;
                    // Attempt to steal randomly from available pools
                    for(let i=0; i<stealCount; i++) {
                        const pools = [];
                        if (newOp.bricks > 0) pools.push('bricks');
                        if (newOp.weapons > 0) pools.push('weapons');
                        if (newOp.crystals > 0) pools.push('crystals');
                        
                        if (pools.length === 0) break;
                        const targetRes = pools[Math.floor(Math.random() * pools.length)];
                        
                        (newOp as any)[targetRes]--;
                    }
                    addLog(Logger.special(playerLabel, `SABOTEUR DESTROYED 5 RESOURCES!`), logType, true);
                }
            }

            return newOp;
        });
    };

    // Wrapper for card effect functions that expect a setter
    const wrappedSetOp = (cb: (prev: PlayerStats) => PlayerStats) => {
        updateOpponent(cb);
    };

    // --- CARD EFFECT EXECUTION ---
    let newMe = { ...afterPay };

    // A. SPECIAL CARDS
    if (card.type === 4) {
        if (card.name === 'FARM') {
            const towerBonus = getTowerProductionBonus(me.tower, myKingCards);
            let laborBonus = 0; if (activeKingBuff(myKingCards, 'k_labor') && me.tower >= 50) laborBonus = 5;
            const b = me.prodBricks + towerBonus + laborBonus;
            const w = me.prodWeapons + towerBonus + laborBonus;
            const c = me.prodCrystals + towerBonus + laborBonus;
            newMe.bricks += b; newMe.weapons += w; newMe.crystals += c;
            addLog(Logger.special(playerLabel, "FARMING..."), logType, true);
        } 
        else if (card.name === 'PROTECTION') {
            newMe.shield = MAX_SHIELD;
            newMe.burn = 0;
            addLog(Logger.special(playerLabel, "SHIELD UP!"), logType, true);
        }
        else if (card.name === 'ANGEL') {
            newMe.king = Math.min(WIN_KING_MAX, newMe.king + 10);
            addLog(Logger.special(playerLabel, "DIVINE HEALING"), logType, true);
        }
        else if (card.name === 'HARVEST') {
            newMe.bricks *= 2; newMe.weapons *= 2; newMe.crystals *= 2;
            addLog(Logger.special(playerLabel, "HARVEST TIME!"), logType, true);
        }
        else if (card.name === 'JOKER') {
            addLog(Logger.special(playerLabel, "JOKER!"), logType, true);
        }
        else if (card.name === 'TORNADO') {
            if (setDeck) {
                const count = 6;
                setDeck(prev => {
                    const deckCopy = [...prev];
                    const drew: CardType[] = [];
                    for(let i=0; i<count; i++) if (deckCopy.length) drew.push({...deckCopy.shift()!, uniqueId: Math.random().toString()});
                    setMyHand(drew);
                    return deckCopy;
                });
                addLog(Logger.special(playerLabel, "TORNADO!"), logType, true);
            }
        }
        else if (card.name === 'MADNESS') {
            newMe.madnessActive = true;
            addLog(Logger.special(playerLabel, "MADNESS!"), logType, true);
        }
    } 
    // B. STANDARD CARDS
    else {
        if (card.effect) {
            const result = card.effect(afterPay, opponent, wrappedSetOp, (msg: string) => addLog(msg, logType, true));
            if (result && typeof result !== 'function') {
                newMe = { ...newMe, ...result };
            }
        }
    }

    // Special Handling: Metamorph
    if (card.name === 'METAMORPH') {
        const goldCards = CARDS_DB_BASE.filter(c => (c.count || 0) <= 2);
        const randomGold = goldCards[Math.floor(Math.random() * goldCards.length)];
        const newGoldCard = { ...randomGold, uniqueId: Math.random().toString() };
        setMyHand(prev => prev.map(c => c.uniqueId === card.uniqueId ? newGoldCard : c));
        addLog(Logger.special(playerLabel, "METAMORPHOSIS!"), logType, true);
        playSFX('buff');
        updateMe(newMe); // Apply stats
        return; 
    }

    // King Power Trigger
    if (card.id === 42) {
        await triggerKingPowerSequence(isP1);
    }

    // King Buffs Modifiers (IGNORE TYPE 4)
    if (card.type !== 4) {
        if (activeKingBuff(myKingCards, 'k_rich') && card.id === 41) { 
            newMe.prodBricks += 1; newMe.prodWeapons += 1; newMe.prodCrystals += 1; 
        }
        if (activeKingBuff(myKingCards, 'k_know') && card.id === 27) { 
            newMe.prodBricks += 1; newMe.prodWeapons += 1; newMe.prodCrystals += 1; 
        }
        
        // Fix: Allow magic cards (Type 2) to trigger Architect if they mention WALL. 
        // FIX: Explicitly check for WALL in description for Type 0 (excluding Mason/etc which are prod)
        // OR simply verify card.id !== 1 (Mason) if using Type 0 generic check.
        // Better: Check if description contains WALL to apply Architect.
    if (activeKingBuff(myKingCards, 'k_arch') && card.type === 0 && card.desc.includes("WALL")) { 
    newMe.tower = Math.min(WIN_TOWER, newMe.tower + 2); 
}

// FIX: COMMANDER - Allow magic (type 2) attacks.
if (activeKingBuff(myKingCards, 'k_cmd') && isAttackAction) { 
    newMe.wall = Math.min(MAX_WALL, newMe.wall + 3); 
}

// WALLIE - Pouze cihly (type 0)
if (activeKingBuff(myKingCards, 'k_wal') && card.type === 0 && card.desc.includes("WALL")) {
    wrappedSetOp(prev => calculateDamage(prev, 3));
}

        // FIX: SNIPER - Add extra damage logic explicitly
        if (activeKingBuff(myKingCards, 'k_snip') && card.id === 10) {
            wrappedSetOp(prev => calculateDamage(prev, 5));
        }

        // King Buffs: Spikes (On Me -> Reflects on Opponent if they attacked me)
        if (activeKingBuff(ctx.opponentKingCards, 'k_spike') && isAttackAction && opponent.wall > 0) {
            setTimeout(() => {
                playSFX('hit_wall');
                addLog(Logger.warning(`${playerLabel}: SPIKED!`), logType, true);
                updateMe(calculateDamage(newMe, 3));
            }, 800);
        } else {
            // Apply normal stat update if no spike delay intervention
            updateMe(newMe);
        }

        // Recycler
        const baseCard = CARDS_DB_BASE.find(c => c.id === card.id);
        const maxCost = Math.max(baseCard?.costB || 0, baseCard?.costW || 0, baseCard?.costC || 0);
        if (activeKingBuff(myKingCards, 'k_recy') && maxCost >= 40) {
            setMe(prev => {
                const recycled = { ...prev, bricks: prev.bricks + 10 };
                addLog(`${playerLabel}: ${Logger.formatLabel('bricks')} ${Logger.formatValue(10, isP1)} (RECYCLE)`, logType, true);
                return recycled;
            });
        }
    } else {
        // Just apply stats for Type 4
        updateMe(newMe);
    }

    // Standard Cleanup
    let returnedToHand = false;
    // Fix: Exclude Special Cards (Type 4) from Lucky effect
    if (activeKingBuff(myKingCards, 'k_luck') && card.desc.includes("PROD") && card.type !== 4) {
        if (Math.random() < 0.25) {
            returnedToHand = true;
            addLog(Logger.passive(playerLabel, "LUCKY! CARD RETURNED."), "INFO", true);
            playSFX('buff');
        }
    }

    if (!returnedToHand) {
        setMyHand(prev => prev.filter(c => c.uniqueId !== card.uniqueId));
        returnCardToBottom(card, isP1, 'PLAY');
    }
};

// --- DATA DEFINITIONS ---

export const CARDS_DB_BASE: CardType[] = [
    { id: 1, name: "MASON", costB: 5, costC: 10, type: 0, count: 9, desc: "BRICK PROD +1", effect: (me: PlayerStats) => ({ ...me, prodBricks: me.prodBricks + 1 }) },
    { id: 2, name: "SHIELD", costB: 10, type: 0, count: 10, desc: "WALL +5", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 5) }) },
    { id: 3, name: "FORTIFY", costB: 15, type: 0, count: 8, desc: "WALL +10", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 10) }) },
    { id: 4, name: "GREAT WALL", costB: 30, type: 0, count: 5, desc: "WALL +20", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 20) }) },
    { id: 5, name: "BARRICADES", costB: 150, costC: 30, type: 0, count: 1, desc: "WALL +50, TOWER +50, KING +10", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 50), tower: Math.min(WIN_TOWER, me.tower + 50), king: Math.min(WIN_KING_MAX, me.king + 10) }) },
    { id: 6, name: "TOWER UP", costB: 15, type: 0, count: 10, desc: "TOWER +5", effect: (me: PlayerStats) => ({ ...me, tower: Math.min(WIN_TOWER, me.tower + 5) }) },
    { id: 7, name: "REINFORCE", costB: 60, costC: 10, type: 0, count: 3, desc: "WALL +15, TOWER +15, KING +5", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 15), tower: Math.min(WIN_TOWER, me.tower + 15), king: Math.min(WIN_KING_MAX, me.king + 5) }) },
    { id: 8, name: "BASTION", costB: 30, type: 0, count: 8, desc: "TOWER +10", effect: (me: PlayerStats) => ({ ...me, tower: Math.min(WIN_TOWER, me.tower + 10) }) },
    { id: 43, name: "HOME", costB: 40, type: 0, count: 5, desc: "WALL +10, TOWER +10", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 10), tower: Math.min(WIN_TOWER, me.tower + 10) }) },
    { id: 44, name: "BIG TOWER", costB: 55, type: 0, count: 5, desc: "TOWER +20", effect: (me: PlayerStats) => ({ ...me, tower: Math.min(WIN_TOWER, me.tower + 20) }) },
    { id: 9, name: "RECRUIT", costW: 5, costC: 10, type: 1, count: 9, desc: "WEAPON PROD +1", effect: (me: PlayerStats) => ({ ...me, prodWeapons: me.prodWeapons + 1 }) },
    { id: 10, name: "ARCHER", costW: 10, type: 1, count: 10, desc: "ATTACK 5", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 5)); return me; } },
    { id: 11, name: "KNIGHT", costW: 20, type: 1, count: 8, desc: "ATTACK 10", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 10)); return me; } },
    { id: 12, name: "CATAPULT", costW: 90, type: 1, count: 4, desc: "ATTACK 45", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 45)); return me; } },
    { id: 13, name: "SKIRMISHER", costW: 30, type: 1, count: 6, desc: "ATTACK 15", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 15)); return me; } },
    { id: 14, name: "SIEGE", costW: 50, type: 1, count: 5, desc: "ATTACK 25", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 25)); return me; } },
    { id: 15, name: "GUARD", costW: 70, type: 1, count: 4, desc: "ATTACK 35", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 35)); return me; } },
    { id: 16, name: "RAID", costW: 140, type: 1, count: 3, desc: "ATTACK 70", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 70)); return me; } },
    { id: 17, name: "HORDE", costW: 200, type: 1, count: 2, desc: "ATTACK 100", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 100)); return me; } },
    { id: 45, name: "BURGLAR", costB: 30, costW: 30, costC: 30, type: 1, count: 2, desc: "STEAL TO ENEMY:, 40 BRICKS, 40 WEAPONS, 40 CRYSTALS", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { const sB = Math.min(op.bricks, 40); const sW = Math.min(op.weapons, 40); const sC = Math.min(op.crystals, 40); setOp((prev: PlayerStats) => ({ ...prev, bricks: prev.bricks - sB, weapons: prev.weapons - sW, crystals: prev.crystals - sC })); return { ...me, bricks: me.bricks + sB, weapons: me.weapons + sW, crystals: me.crystals + sC }; } },
    { id: 18, name: "MAGE", costC: 15, type: 2, count: 9, desc: "CRYSTAL PROD +1", effect: (me: PlayerStats) => ({ ...me, prodCrystals: me.prodCrystals + 1 }) },
    { id: 19, name: "POTION", costC: 40, type: 2, count: 2, desc: "KING HP +10", effect: (me: PlayerStats) => ({ ...me, king: Math.min(WIN_KING_MAX, me.king + 10) }) },
    { id: 20, name: "DRAGON", costC: 35, type: 2, count: 5, desc: "ATTACK 20", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 20)); return me; } },
    { id: 21, name: "DARKNESS", costW: 80, costB: 80, costC: 80, type: 2, count: 2, desc: "DARKENS ENEMY:, WALL 50%, TOWER 50%, KING 50%", effect: (me: PlayerStats, _op: PlayerStats, setOp: any) => { setOp((prev: PlayerStats) => ({ ...prev, wall: Math.max(1, Math.floor(prev.wall * 0.5)), tower: Math.max(1, Math.floor(prev.tower * 0.5)), king: Math.max(1, Math.floor(prev.king * 0.5)) })); return me; } },
    { id: 22, name: "HEAL", costC: 20, type: 2, count: 3, desc: "KING HP +5", effect: (me: PlayerStats) => ({ ...me, king: Math.min(WIN_KING_MAX, me.king + 5) }) },
    { id: 23, name: "FOCUS", costC: 40, type: 2, count: 3, desc: "WALL +10, TOWER +5, KING +5", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 10), tower: Math.min(WIN_TOWER, me.tower + 5), king: Math.min(WIN_KING_MAX, me.king + 5) }) },
    { id: 24, name: "SURGE", costC: 50, type: 2, count: 3, desc: "ATTACK 15, WALL +10", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 15)); return { ...me, wall: Math.min(MAX_WALL, me.wall + 10) }; } },
    { id: 25, name: "REVIVE", costC: 70, type: 2, count: 2, desc: "WALL +20, TOWER +10, KING +10,", effect: (me: PlayerStats) => ({ ...me, king: Math.min(WIN_KING_MAX, me.king + 10), wall: Math.min(MAX_WALL, me.wall + 20), tower: Math.min(WIN_TOWER, me.tower + 10) }) },
    { id: 26, name: "THIEF", costB: 5, costW: 5, costC: 5, type: 1, count: 3, desc: "STEAL TO ENEMY:, 10 BRICKS, 10 WEAPONS, 10 CRYSTALS", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { const sB = Math.min(op.bricks, 10); const sW = Math.min(op.weapons, 10); const sC = Math.min(op.crystals, 10); setOp((prev: PlayerStats) => ({ ...prev, bricks: prev.bricks - sB, weapons: prev.weapons - sW, crystals: prev.crystals - sC })); return { ...me, bricks: me.bricks + sB, weapons: me.weapons + sW, crystals: me.crystals + sC }; } },
    { id: 27, name: "SCHOOL", costB: 15, costW: 15, costC: 15, type: 2, count: 10, desc: "ALL PROD +1", effect: (me: PlayerStats) => ({ ...me, prodBricks: me.prodBricks + 1, prodWeapons: me.prodWeapons + 1, prodCrystals: me.prodCrystals + 1 }) },
    { id: 28, name: "TAX", costB: 5, costW: 5, costC: 5, type: 2, count: 3, desc: "ENEMY PAYS:, 10 BRICKS, 10 WEAPONS, 10 CRYSTALS", effect: (me: PlayerStats, _op: PlayerStats, setOp: any) => { setOp((prev: PlayerStats) => ({ ...prev, bricks: Math.max(0, prev.bricks - 10), weapons: Math.max(0, prev.weapons - 10), crystals: Math.max(0, prev.crystals - 10) })); return me; } },
    { id: 29, name: "BLESSING", costC: 55, type: 2, count: 2, desc: "WALL +15, TOWER +10, KING +5", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 15), tower: Math.min(WIN_TOWER, me.tower + 10), king: Math.min(WIN_KING_MAX, me.king + 5) }) },
    { id: 30, name: "POISON", costC: 200, type: 2, count: 1, desc: "ENEMY:, KING HP 1, CRYSTALS 0", effect: (me: PlayerStats, _op: PlayerStats, setOp: any, log: any) => { setOp((prev: PlayerStats) => { if(prev.shield > 0) { if(log) log("SHIELD BLOCKED POISON!"); return prev; } return { ...prev, king: 1, crystals: 0 }; }); return me; } },
    { id: 31, name: "TROJAN", costW: 200, costB: 50, type: 1, count: 1, desc: "ATTACK 80, ENEMY ALL RES 50%", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => { let d = calculateDamage(prev, 80); return {...d, bricks: Math.floor(d.bricks * 0.5), weapons: Math.floor(d.weapons * 0.5), crystals: Math.floor(d.crystals * 0.5)}; }); return me; } },
    { id: 32, name: "METAMORPH", costC: 30, type: 2, count: 4, desc: "TRANSFORM, TO GOLD CARD", effect: (me: PlayerStats) => me },
    { id: 33, name: "INFERNO", costB: 100, costW: 100, type: 1, count: 1, desc: "BURN ENEMY CASTLE, (5 TURNS)", effect: (me: PlayerStats, _op: PlayerStats, setOp: any, log: any) => { setOp((prev: PlayerStats) => { if(prev.shield > 0) { if(log) log("SHIELD BLOCKED FIRE!"); return prev; } return { ...prev, burn: 5 }; }); return me; } },
    { id: 34, name: "HOLY", costC: 100, type: 2, count: 3, desc: "WALL +20, TOWER +20, KING +10, CURE BURN", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 20), tower: Math.min(WIN_TOWER, me.tower + 20), king: Math.min(WIN_KING_MAX, me.king + 10), burn: 0 }) },
    { id: 35, name: "EMPIRE", costB: 300, type: 0, count: 1, desc: "WALL +100, TOWER +30", effect: (me: PlayerStats) => ({ ...me, wall: Math.min(MAX_WALL, me.wall + 100), tower: Math.min(WIN_TOWER, me.tower + 30) }) },
    { id: 36, name: "FIREBALL", costC: 250, type: 2, count: 1, desc: "ATTACK 50, BURN ENEMY CASTLE, (5 TURNS)", effect: (me: PlayerStats, op: PlayerStats, setOp: any, log: any) => { setOp((prev:any) => { let d = calculateDamage(prev, 50); if(d.shield > 0) return d; return {...d, burn: 5}; }); return me; } },
    { id: 37, name: "SLAYER", costC: 100, type: 2, count: 2, desc: "ATTACK 60", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 60)); return me; } },
    { id: 38, name: "ALIBABA", costB: 65, costW: 65, costC: 65, type: 1, count: 1, desc: "STEAL TO ENEMY:, 80 BRICKS, 80 WEAPONS, 80 CRYSTALS", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { const sB = Math.min(op.bricks, 80); const sW = Math.min(op.weapons, 80); const sC = Math.min(op.crystals, 80); setOp((prev: PlayerStats) => ({ ...prev, bricks: prev.bricks - sB, weapons: prev.weapons - sW, crystals: prev.crystals - sC })); return { ...me, bricks: me.bricks + sB, weapons: me.weapons + sW, crystals: me.crystals + sC }; } },
    { id: 39, name: "SABOTAGE", costC: 200, costW: 200, type: 1, count: 1, desc: "ENEMY:, ALL RES 0%, ALL PROD -5", effect: (me: PlayerStats, _op: PlayerStats, setOp: any) => { setOp((prev: PlayerStats) => ({ ...prev, bricks: 0, weapons: 0, crystals: 0, prodBricks: Math.max(1, prev.prodBricks - 5), prodWeapons: Math.max(1, prev.prodWeapons - 5), prodCrystals: Math.max(1, prev.prodCrystals - 5) })); return me; } },
    { id: 40, name: "WRATH", costW: 300, type: 1, count: 1, desc: "ATTACK 150", effect: (me: PlayerStats, op: PlayerStats, setOp: any) => { setOp((prev:any) => calculateDamage(prev, 150)); return me; } },
    { id: 41, name: "SELF STUDY", costB: 40, costW: 40, costC: 40, type: 2, count: 8, desc: "ALL PROD +3", effect: (me: PlayerStats) => ({ ...me, prodBricks: me.prodBricks + 3, prodWeapons: me.prodWeapons + 3, prodCrystals: me.prodCrystals + 3 }) },
    { id: 42, name: "KING POWER", costB: 0, costW: 0, costC: 0, type: 2, count: 4, desc: "BOTH PLAYERS DRAW 1 KING CARD", effect: (me: PlayerStats) => me },
    // NEW SPECIAL CARDS (Type 4)
    { id: 101, name: "FARM", costB: 0, costW: 0, costC: 0, type: 4, count: 4, desc: "INSTANT PRODUCTION", img: '🌾', effect: (me: PlayerStats) => me }, 
    { id: 102, name: "PROTECTION", costB: 0, costW: 0, costC: 0, type: 4, count: 2, desc: "10HP SHIELD BLOCKS:, WALL ARCHER,FIRE,POISON", img: '🛡️', effect: (me: PlayerStats) => ({...me, shield: MAX_SHIELD, burn: 0}) },
    { id: 103, name: "ANGEL", costB: 0, costW: 0, costC: 0, type: 4, count: 1, desc: "KING HP +10", img: '☀️', effect: (me: PlayerStats) => ({...me, king: Math.min(WIN_KING_MAX, me.king + 10)}) },
    { id: 107, name: "MADNESS", costB: 0, costW: 0, costC: 0, type: 4, count: 6, desc: "NEXT DRAW COST -30%", img: '⭐', effect: (me: PlayerStats) => ({...me, madnessActive: true}) },
];

export const getEffectiveCardCost = (card: CardType, kingCards: CardType[]) => {
    if (!card || card.id === 42 || card.isKing) return { costB: 0, costW: 0, costC: 0 };
    let { costB = 0, costW = 0, costC = 0 } = card;
    
    // Type 4 (SPECIAL) cards ignore all King Buffs
    if (card.type === 4) return { costB, costW, costC };

    if (kingCards && kingCards.length > 0) {
        if (activeKingBuff(kingCards, 'k_sungo') && card.id === 32) return { costB: 0, costW: 0, costC: 0 };
        if (activeKingBuff(kingCards, 'k_build') && card.id === 1) return { costB: 0, costW: 0, costC: 0 };
        if (activeKingBuff(kingCards, 'k_war') && card.id === 9) return { costB: 0, costW: 0, costC: 0 };
        if (activeKingBuff(kingCards, 'k_wiz') && card.id === 18) return { costB: 0, costW: 0, costC: 0 };
        if (activeKingBuff(kingCards, 'k_know') && card.id === 27) { costB = 25; costW = 25; costC = 25; }
        if (activeKingBuff(kingCards, 'k_thief') && [26, 38, 45].includes(Number(card.id))) { costB = Math.ceil(costB * 1.25); costW = Math.ceil(costW * 1.25); costC = Math.ceil(costC * 1.25); }
        if (activeKingBuff(kingCards, 'k_drag') && card.id === 20) { costC = Math.max(0, costC - 15); }
    }

    // --- ADDITIVE DISCOUNT LOGIC ---
    let discountPercent = 0;

    if (kingCards && kingCards.length > 0) {
        if (activeKingBuff(kingCards, 'k_bigboy') && card.type === 0) discountPercent += 0.2;
        if (activeKingBuff(kingCards, 'k_conq') && card.type === 1) discountPercent += 0.2;
        if (activeKingBuff(kingCards, 'k_wizz') && card.type === 2) discountPercent += 0.2;
    }

    if (card.isMadness) {
        discountPercent += 0.3;
    }

    // Apply additive discount (capped at 100% or 0%, practically)
    if (discountPercent > 0) {
        const multiplier = Math.max(0, 1 - discountPercent);
        costB = Math.ceil(costB * multiplier);
        costW = Math.ceil(costW * multiplier);
        costC = Math.ceil(costC * multiplier);
    }

    return { costB, costW, costC };
};

export const canAfford = (card: CardType, stats: PlayerStats, kingCards: CardType[]) => {
    if (card.id === 42) return true;
    const { costB, costW, costC } = getEffectiveCardCost(card, kingCards);
    return (stats.bricks >= costB) && (stats.weapons >= costW) && (stats.crystals >= costC);
};

export const getKingBuffs = (card: CardType, kingCards: CardType[], stats?: PlayerStats, enemyStats?: PlayerStats) => {
    if (!kingCards || kingCards.length === 0 || !card) return [];
    if (card.type === 4) return []; // Specials ignore buffs

    const buffs: string[] = [];
    if (activeKingBuff(kingCards, 'k_rich') && card.id === 41) buffs.push("+4 ALL PROD");
    if ((activeKingBuff(kingCards, 'k_build') && card.id === 1) || (activeKingBuff(kingCards, 'k_war') && card.id === 9) || (activeKingBuff(kingCards, 'k_wiz') && card.id === 18) || (activeKingBuff(kingCards, 'k_sungo') && card.id === 32)) buffs.push("COST: FREE");
    if (activeKingBuff(kingCards, 'k_know') && card.id === 27) buffs.push("+2 PROD (COST 25)");
    if (activeKingBuff(kingCards, 'k_thief') && [26, 38, 45].includes(Number(card.id))) buffs.push("STEAL +50% (COST +25%)");
    if (activeKingBuff(kingCards, 'k_drag') && card.id === 20) buffs.push("-15 CRYSTAL COST");
    
    // Additive Discounts
    if (activeKingBuff(kingCards, 'k_bigboy') && card.type === 0) buffs.push("-20% COST");
    if (activeKingBuff(kingCards, 'k_conq') && card.type === 1) buffs.push("-20% COST");
    if (activeKingBuff(kingCards, 'k_wizz') && card.type === 2) buffs.push("-20% COST");

    if (activeKingBuff(kingCards, 'k_snip') && card.id === 10) buffs.push("+5 DMG");
    
    const isAttackAction = (card.type === 1 || (card.type === 2 && card.desc.includes("ATTACK")));
    if (activeKingBuff(kingCards, 'k_cmd') && isAttackAction) buffs.push("BUILD +3 WALL");
    
    // Fix: Exclude Darkness (ID 21) from Wallie + Check Description for Wall
    if (activeKingBuff(kingCards, 'k_wal') && (
        (card.type === 0 && card.desc.includes("WALL")) || 
        (card.type === 2 && card.id !== 21 && card.desc.includes("WALL"))
    )) buffs.push("DEAL 3 DMG");
    
    // Fix: Architect logic updated (Only for cards affecting Wall)
    if (activeKingBuff(kingCards, 'k_arch') && (
        (card.type === 0 && card.desc.includes("WALL")) || 
        (card.type === 2 && card.id !== 21 && card.desc.includes("WALL"))
    )) buffs.push("BUILD +2 TOWER");
    
    if (activeKingBuff(kingCards, 'k_sab') && isAttackAction) { const m = card.desc.match(/ATTACK (\d+)/); if(m && parseInt(m[1])>=15) buffs.push("SABOTAGE: -5 PROD"); }
    
    if (activeKingBuff(kingCards, 'k_last') && isAttackAction && stats && (stats.wall + stats.tower + stats.king) < 15) buffs.push("CRIT: 2x DAMAGE!");
    if (activeKingBuff(kingCards, 'k_over') && isAttackAction && stats && enemyStats) { if (stats.prodBricks > enemyStats.prodBricks && stats.prodWeapons > enemyStats.prodWeapons && stats.prodCrystals > enemyStats.prodCrystals) buffs.push("OVERLORD: +5 DMG"); }
    
    if (activeKingBuff(kingCards, 'k_luck') && card.desc.includes("PROD")) buffs.push("25% RETURN CHANCE");
    
    if (activeKingBuff(kingCards, 'k_recy')) { const maxCost = Math.max(card.costB || 0, card.costW || 0, card.costC || 0); if (maxCost >= 40) buffs.push("REFUND 10 BRICKS"); }
    if (activeKingBuff(kingCards, 'k_necro')) buffs.push("DISCARD: 25% CHANCE 3 DMG");
    return buffs;
};
