import React from 'react';
import { CardType, PlayerStats, GameContext } from "../types";
import { 
    activeKingBuff, 
    canAfford,
    playCardAction,
    getEffectiveCardCost,
} from "../data/cards";
import { WIN_KING_MAX, MAX_WALL, getTowerProductionBonus, MAX_HAND_SIZE } from "../utils/constants";
import { Logger } from "./Logger";

// Helper for delays inside AI logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const payCost = (card: CardType, stats: PlayerStats, kingCards: CardType[]) => {
    let cost = getEffectiveCardCost(card, kingCards);
    return {
        ...stats,
        bricks: stats.bricks - cost.costB,
        weapons: stats.weapons - cost.costW,
        crystals: stats.crystals - cost.costC
    };
};

interface AiTurnProps {
    opponent: PlayerStats;
    setOpponent: React.Dispatch<React.SetStateAction<PlayerStats>>;
    player: PlayerStats;
    setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
    aiHand: CardType[];
    setAiHand: React.Dispatch<React.SetStateAction<CardType[]>>;
    deck: CardType[];
    setDeck: React.Dispatch<React.SetStateAction<CardType[]>>;
    opponentKingCards: CardType[];
    playerKingCards: CardType[];
    addLog: (msg: string, type: string, isRawHtml?: boolean) => void;
    playSFX: (type: string) => void;
    showPlayedCard: (card: CardType, who: string) => void;
    setActiveCard: (card: any) => void;
    setDealingCards: (cards: any[]) => void;
    returnCardToBottom: (card: CardType, isPlayer: boolean, action: string) => void;
    triggerAnimation: (type: string, direction: string) => void;
    spawnParticles: (x: number, y: number, scale: number, type: string) => void;
    updateGameStats: (playerKey: string, category: string, amount: number) => void;
    triggerKingPowerSequence: (isPlayer: boolean) => Promise<void>;
    triggerArcherDamage: (source: any, target: any, dir: string, setT: any, log: any, kc: any) => Promise<void>;
    setIsProcessingTurn: (val: boolean) => void;
    setPlayerTurn: (val: boolean) => void;
    setTurnCounts: (val: any) => void;
    playDamageSoundIfAny: (prev: PlayerStats, next: PlayerStats) => void;
    P1_LABEL: string;
    P2_LABEL: string;
}

export const executeAiTurn = async (props: AiTurnProps) => {
    const {
        opponent, setOpponent, player, setPlayer, aiHand, setAiHand, deck, setDeck,
        opponentKingCards, playerKingCards, addLog, playSFX, showPlayedCard, setActiveCard,
        setDealingCards, returnCardToBottom, triggerAnimation, spawnParticles, updateGameStats,
        triggerKingPowerSequence, triggerArcherDamage, setIsProcessingTurn, setPlayerTurn, setTurnCounts,
        playDamageSoundIfAny, P1_LABEL, P2_LABEL
    } = props;

    try {
        let currentStats = opponent;
        let newAiHand = [...aiHand];
        
        // 1. SELECT CARD TO PLAY
        const playableCards = newAiHand.filter(card => canAfford(card, currentStats, opponentKingCards));
        let cardToPlay: CardType | null = null;
        
        if (playableCards.length > 0) {
            const scoredCards = playableCards.map(card => {
                let score = 0;
                const cardId = Number(card.id);

                // --- 1. SPECIAL CARDS (Type 4) LOGIC ---
                if (card.type === 4) {
                    if (card.name === 'PROTECTION') {
                        // Highest Priority: Cure Burn or Emergency Shield
                        if (currentStats.burn > 0) score += 1000; 
                        else if (currentStats.shield === 0) score += 250;
                        else score -= 100; 
                    } 
                    else if (card.name === 'ANGEL') {
                        if (currentStats.king < WIN_KING_MAX) score += 200 + (WIN_KING_MAX - currentStats.king);
                        else score -= 50;
                    } 
                    else if (card.name === 'MADNESS') {
                        score += 220; 
                    }
                    else if (card.name === 'FARM') {
                        score += 210; 
                    }
                    else {
                        score += 200; 
                    }
                }

                // --- 2. ATTACK CARDS (Type 1) LOGIC ---
                else if (card.type === 1) {
                    const isHeavyAttack = [12, 16, 17, 20, 31, 36, 37, 40].includes(cardId); 
                    
                    // ENEMY SHIELD LOGIC
                    if (player.shield > 0) {
                        if (isHeavyAttack) {
                            score -= 150; 
                        } else {
                            score += 50; 
                        }
                    } else {
                        score += 30;
                        if (isHeavyAttack) score += 40;
                        if (player.king < 30) score += 50;
                    }

                    if (activeKingBuff(opponentKingCards, 'k_sab') && !player.shield) score += 20;
                    if (activeKingBuff(opponentKingCards, 'k_war') && cardId === 9) score += 50;
                    if (activeKingBuff(opponentKingCards, 'k_snip') && cardId === 10) score += 25;
                }

                // --- 3. CONSTRUCTION / ECONOMY (Type 0 & 2) ---
                else {
                    if (card.type === 0) {
                        if (currentStats.wall < 40) score += 60; 
                        else if (currentStats.wall > 100) score += 5; 
                        else score += 25;
                        
                        if (activeKingBuff(opponentKingCards, 'k_build') && cardId === 1) score += 50;
                    }
                    else if (card.type === 2) {
                        if (card.desc.includes("PROD")) {
                            if (currentStats.wall < 30) score -= 10; 
                            else score += 35;
                        } else {
                            score += 20;
                        }
                        
                        if (activeKingBuff(opponentKingCards, 'k_rich') && cardId === 41) score += 30;
                        if (activeKingBuff(opponentKingCards, 'k_wiz') && cardId === 18) score += 50;
                        if (activeKingBuff(opponentKingCards, 'k_sungo') && cardId === 32) score += 50;
                    }
                }

                if (cardId === 42) score += 150; 
                if (card.name === 'METAMORPH') score += 40; 

                return { card, score };
            });

            scoredCards.forEach(sc => sc.score += Math.random() * 10);
            
            scoredCards.sort((a, b) => b.score - a.score);
            cardToPlay = scoredCards[0].card;
        }

        // 2. PLAY CARD ACTION
        if (cardToPlay) {
            // Visualize
            showPlayedCard(cardToPlay, 'opponent');
            await delay(1200);
            setActiveCard(null);

            // Log cost
            const paidStats = payCost(cardToPlay, currentStats, opponentKingCards);
            const costString = Logger.formatCost(currentStats, paidStats);
            addLog(Logger.cardPlayed(P2_LABEL, cardToPlay, costString), 'OPPONENT', true);

            // Construct Context for playCardAction
            const context: GameContext = {
                me: opponent,
                opponent: player,
                setMe: setOpponent,
                setOpponent: setPlayer,
                myHand: aiHand,
                setMyHand: setAiHand,
                myKingCards: opponentKingCards,
                opponentKingCards: playerKingCards,
                addLog: (msg, type, isHtml) => addLog(msg, type || 'OPPONENT', isHtml),
                playSFX,
                triggerAnimation,
                spawnParticles,
                updateStats: updateGameStats,
                triggerKingPowerSequence: (isP) => triggerKingPowerSequence(isP),
                returnCardToBottom,
                isP1: false, // AI is Player 2
                labels: { p1: P1_LABEL, p2: P2_LABEL },
                setDeck: setDeck
            };

            // Execute logic centrally
            await playCardAction(cardToPlay, context);

            // Wait for visual effects (like projectiles) which are handled inside playCardAction now
            
            await delay(500);
            
            newAiHand = aiHand.filter(c => c.uniqueId !== cardToPlay!.uniqueId);
            currentStats = paidStats; 

        } else {
            // 3. DISCARD LOGIC
            if (newAiHand.length >= MAX_HAND_SIZE) {
                const scoredForDiscard = newAiHand.map(c => { 
                    let keepScore = 0; 
                    if (c.id === 41) keepScore += 1000; 
                    if (c.id === 42) keepScore += 800; 
                    if (c.type === 4) keepScore += 600;
                    if (c.name === 'METAMORPH') keepScore += 600;
                    
                    if (c.desc && c.desc.includes("PROD") && currentStats.prodBricks < 5) keepScore += 200; 
                    if (currentStats.wall < 30 && c.type === 0) keepScore += 100; 
                    
                    if (player.shield > 0 && c.type === 1 && (c.costW || 0) < 15) keepScore += 150; // Keep weak attacks to break shield

                    const cost = Math.max(c.costB || 0, c.costW || 0, c.costC || 0); 
                    if (cost > 50 && currentStats.bricks < 20) keepScore -= 50;

                    return { card: c, score: keepScore }; 
                });
                
                scoredForDiscard.sort((a, b) => a.score - b.score); 
                const disc = scoredForDiscard[0].card;

                addLog(Logger.cardDiscarded(P2_LABEL, disc), 'OPPONENT', true);
                
                if (activeKingBuff(opponentKingCards, 'k_necro') && Math.random() < 0.25) { 
                    playSFX('magic'); 
                    setPlayer(prev => { 
                        let t = { ...prev }; 
                        let dmg = 3; 
                        let actualDmg = 0; 
                        let hitType = "KING"; 
                        if (t.wall > 0) { const take = Math.min(t.wall, dmg); t.wall -= take; actualDmg += take; hitType = "WALL"; } 
                        else if (t.tower > 0) { const take = Math.min(t.tower, dmg); t.tower -= take; actualDmg += take; hitType = "TOWER"; } 
                        else { t.king = Math.max(0, t.king - dmg); actualDmg = dmg; } 
                        addLog(Logger.passive(P2_LABEL, `HAUNT DRAINED ${actualDmg} ${hitType}!`), 'OPPONENT', true); 
                        return t; 
                    }); 
                }
                newAiHand = newAiHand.filter(c => c.uniqueId !== disc.uniqueId); 
                setAiHand(newAiHand); 
                returnCardToBottom(disc, false, 'DISCARD'); 
                await delay(1000);
            } else {
                addLog(`${P2_LABEL}: FARMING RESOURCES...`, 'OPPONENT'); 
                await delay(800);
            }
        }

        // 4. DRAW NEW CARD (Standard turn end draw)
        await aiDrawCard(setDealingCards, playSFX, deck, setDeck, newAiHand, setAiHand, showPlayedCard, addLog, triggerKingPowerSequence, P2_LABEL, setOpponent);

        // 5. PRODUCTION
        // --- LABOR CARD LOGIC FIX ---
        // Originally Labor added +5 on top. Now it overrides the tier bonus.
        let towerBonus = getTowerProductionBonus(currentStats.tower, opponentKingCards); 
        if (activeKingBuff(opponentKingCards, 'k_labor') && currentStats.tower >= 50) {
            towerBonus = 5; // Override
        }
        
        const totalB = (currentStats.prodBricks || 0) + towerBonus; 
        const totalW = (currentStats.prodWeapons || 0) + towerBonus; 
        const totalC = (currentStats.prodCrystals || 0) + towerBonus;
        
        setOpponent(prev => {
            let next = { ...prev, bricks: prev.bricks + totalB, crystals: prev.crystals + totalC, weapons: prev.weapons + totalW };
            
            if (activeKingBuff(opponentKingCards, 'k_mine')) { 
                const r = Math.random(); 
                if (r < 0.33) next.bricks += 2; else if (r < 0.66) next.weapons += 2; else next.crystals += 2; 
            }
            if (activeKingBuff(opponentKingCards, 'k_bob') && next.wall < MAX_WALL) { 
                next.wall = Math.min(MAX_WALL, next.wall + 2); 
            }
            if (prev.burn > 0) { 
                let dmg = 0; 
                if (next.king > 0) { next.king = Math.max(0, next.king - 3); dmg += Math.min(3, prev.king); } 
                if (next.wall > 0) { next.wall = Math.max(0, next.wall - 6); dmg += Math.min(6, prev.wall); } 
                if (next.tower > 0) { next.tower = Math.max(0, next.tower - 6); dmg += Math.min(6, prev.tower); } 
                
                const burnReduc = activeKingBuff(opponentKingCards, 'k_fire') ? 3 : 1; 
                next.burn = Math.max(0, prev.burn - burnReduc); 
                
                if (dmg > 0) updateGameStats('p2', 'taken', dmg); 
            }
            return next;
        });

        // Bandit Logic
        if (activeKingBuff(opponentKingCards, 'k_ban') && Math.random() < 0.20) { 
            setPlayer(prevTarget => { 
                const stealAmount = 5; 
                const r = Math.random(); 
                let stolen = {b:0, w:0, c:0}; 
                if (r < 0.33) stolen.b = Math.min(prevTarget.bricks, stealAmount); 
                else if (r < 0.66) stolen.w = Math.min(prevTarget.weapons, stealAmount); 
                else stolen.c = Math.min(prevTarget.crystals, stealAmount); 
                
                if (stolen.b + stolen.w + stolen.c > 0) { 
                    setOpponent(me => ({ ...me, bricks: me.bricks + stolen.b, weapons: me.weapons + stolen.w, crystals: me.crystals + stolen.c })); 
                    let logSt = []; 
                    if (stolen.b > 0) logSt.push(`${Logger.formatLabel('bricks')} ${stolen.b}`); 
                    if (stolen.w > 0) logSt.push(`${Logger.formatLabel('weapons')} ${stolen.w}`); 
                    if (stolen.c > 0) logSt.push(`${Logger.formatLabel('crystals')} ${stolen.c}`); 
                    addLog(Logger.passive(P2_LABEL, `BANDIT STOLE ${logSt.join(' ')}`), 'OPPONENT', true); 
                    return { ...prevTarget, bricks: prevTarget.bricks - stolen.b, weapons: prevTarget.weapons - stolen.w, crystals: prevTarget.crystals - stolen.c }; 
                } 
                return prevTarget; 
            }); 
        }
        
        addLog(Logger.production(P2_LABEL, totalB, totalW, totalC, false), 'OPPONENT', true);
        
        const afterProd = { ...currentStats, bricks: currentStats.bricks + totalB, crystals: currentStats.crystals + totalC, weapons: currentStats.weapons + totalW };
        
        // 6. ARCHER DAMAGE
        await triggerArcherDamage(afterProd, player, 'LEFT', setPlayer, addLog, opponentKingCards);
        
        // 7. END TURN
        await delay(600);
        
        // --- End Turn Sequence ---
        props.setTurnCounts((prev: any) => {
            const next = prev.p + 1;
            addLog(Logger.turnStart(P1_LABEL, next), 'PLAYER', true);
            return { ...prev, p: next };
        });
        
        setIsProcessingTurn(false);
        setPlayerTurn(true);
        
    } catch (e) { 
        console.error("AI CRASH RECOVERED:", e); 
        addLog(Logger.warning("CPU ERRORED - PASSING TURN"), "WARNING", true); 
        setIsProcessingTurn(false);
        setPlayerTurn(true); 
    }
};

async function aiDrawCard(
    setDealingCards: any, playSFX: any, deck: CardType[], setDeck: any, 
    newAiHand: CardType[], setAiHand: any, showPlayedCard: any, addLog: any, 
    triggerKingPowerSequence: any, P2_LABEL: string, setOpponent: React.Dispatch<React.SetStateAction<PlayerStats>>
) {
    if (newAiHand.length < MAX_HAND_SIZE && deck.length > 0) {
        let currentDeck = [...deck]; 
        let topCard = currentDeck[0];
        
        while (topCard && topCard.id === 42) { 
            currentDeck.shift(); 
            setDeck([...currentDeck]); 
            playSFX('magic'); 
            showPlayedCard({ ...topCard, isKing: true }, 'opponent'); 
            addLog(Logger.kingPowerFound(P2_LABEL), 'INFO', true); 
            await delay(1500); 
            setActiveCard(null); 
            await triggerKingPowerSequence(false); 
            if (currentDeck.length === 0) { topCard = null as any; break; } 
            topCard = currentDeck[0]; 
        }
        
        if (topCard) { 
            const draw = topCard; 
            const temp = { ...draw, uniqueId: Math.random().toString() }; 
            
            // Madness Logic for AI
            setOpponent(prev => {
                if (prev.madnessActive) {
                    // FIX: Type 4 (SPECIAL) does not consume madness
                    if (temp.type !== 4) {
                        temp.isMadness = true;
                        return { ...prev, madnessActive: false };
                    }
                }
                return prev;
            });

            setDealingCards([{ card: temp, player: 'opponent', delay: 0 }]); 
            playSFX('play_card'); 
            await delay(800); 
            currentDeck.shift(); 
            setDeck(currentDeck); 
            newAiHand = [...newAiHand, temp]; 
            setAiHand(newAiHand); 
            setDealingCards([]); 
        }
    }
}

function setActiveCard(arg0: null) {
    // Placeholder to satisfy typescript if needed
}