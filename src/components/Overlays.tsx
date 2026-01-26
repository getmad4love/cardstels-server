
import React, { useEffect, useState } from 'react';
import Card, { CardBackContent, KingCardBackContent } from './Card';
import { CardType, GameStats, PlayerColorProfile } from '../types';
import { HpIndicator, ResourceIndicator } from './GameUI';

export const KingSelectionOverlay = ({ state, onShuffle, onDraw, onSelect, isMultiplayer }: any) => {
    if (state.phase === 'IDLE') return null;
    
    // States where we show the face-up choices
    const showCardsToSelect = (state.phase === 'P1_VIEW') || (state.phase === 'P2_VIEW');
    const isShuffling = state.phase.includes('SHUFFLING');
    const isChoicePhase = (state.phase === 'P1_CHOICE') || (state.phase === 'P2_CHOICE' && isMultiplayer);
    
    // States where opponent is choosing (show card backs)
    const isWaitingForOpponent = (state.phase === 'P1_WAITING' || state.phase === 'P2_WAITING');

    const currentPlayerLabel = state.phase.includes('P1') ? "PLAYER 1" : (isMultiplayer ? "PLAYER 2" : "CPU");
    const labelColor = state.phase.includes('P1') ? "text-lime-400 drop-shadow-[0_0_10px_rgba(163,230,53,0.8)]" : "text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]";
    const canShuffle = state.shufflesLeft > 0;
    
    let instructionText = "";
    if (isShuffling) instructionText = "SHUFFLING...";
    else if (isChoicePhase) instructionText = "CLICK DECK TO DRAW";
    else if (isWaitingForOpponent) instructionText = "OPPONENT IS CHOOSING...";
    else instructionText = "CHOOSE ONE CARD";

    const dealAnimClass = state.phase === 'P1_VIEW' ? 'animate-deal-p1' : 'animate-deal-p2';

    return (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in select-none overflow-hidden"
             style={{ background: 'radial-gradient(circle at center, #1c1917 0%, #020617 100%)' }}>
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)' }}></div>
            <div className="flex flex-col items-center justify-center z-10 mb-4 mt-8">
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-300 to-yellow-600 tracking-widest uppercase drop-shadow-[0_0_25px_rgba(234,179,8,0.5)] font-chivo leading-none">KING SELECTION</h1>
                <div className={`text-2xl font-black uppercase tracking-[0.3em] ${labelColor} mt-2 filter brightness-125`}>— {currentPlayerLabel} TURN —</div>
            </div>
            <div className={`mb-8 font-black uppercase tracking-[0.3em] text-xl text-stone-300 z-10 border-y border-white/5 py-3 w-full text-center bg-black/40 backdrop-blur-sm transition-all duration-300 min-h-[60px] flex items-center justify-center shadow-lg`}>
                <span className={isShuffling || isWaitingForOpponent ? "animate-pulse" : "animate-fade-in"}>{instructionText}</span>
            </div>
            <div className="relative h-96 w-full flex items-center justify-center mb-4 z-10">
                {(isChoicePhase || isShuffling) && (
                    <div className="flex flex-col items-center justify-center gap-6">
                        <div className={`relative group transform scale-[1.6] ${isChoicePhase ? 'cursor-pointer' : ''}`} onClick={isChoicePhase ? onDraw : undefined}>
                            <div className={`absolute inset-0 bg-yellow-500 rounded-xl blur-3xl transition-opacity duration-500 ${isShuffling ? 'opacity-40' : 'opacity-10 group-hover:opacity-50'}`}></div>
                            <div className={`transform transition-all duration-300 ${isChoicePhase ? 'hover:scale-105 hover:-translate-y-2' : ''} ${isShuffling ? 'shuffling-deck' : ''}`}>
                                    <div className="king-card-size king-card-back-pattern rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] relative overflow-hidden bg-red-950 border-2 border-yellow-500 z-20"><KingCardBackContent /></div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* SHOW CARDS TO SELECT (YOUR TURN) */}
                {showCardsToSelect && (
                    <div className="flex gap-4 z-20 items-center justify-center pb-8 perspective-1000">
                        {state.drawn.map((card: any, index: number) => (
                            <div key={card.id} className={`relative group cursor-pointer mx-12 transition-all duration-200 ${dealAnimClass} hover:z-[100]`} style={{ animationDelay: `${index * 0.15}s`, opacity: 0 }} onClick={() => onSelect(card)}>
                                <div className="transform transition-transform duration-300 scale-[1.2] hover:scale-[1.3] hover:-translate-y-4">
                                    <div className="shadow-2xl"><Card card={card} isKingCard={true} bigMode={false} isVisual={true} enable3D={true} /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {/* OPPONENT OR CPU THINKING / DRAW VISUAL (CARD BACKS) */}
                {(isWaitingForOpponent || (!isMultiplayer && state.phase === 'P2_CHOICE')) && (
                    <div className="flex gap-8 items-center justify-center mt-0 animate-pulse perspective-1000">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="king-card-size king-card-back-pattern rounded-xl shadow-2xl animate-fade-in-down" style={{ animationDelay: `${i * 0.3}s`, animationFillMode: 'both', transform: 'rotateY(180deg)' }}>
                                <KingCardBackContent />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="mt-2 flex flex-col items-center justify-start h-24 z-10 w-full">
                {isChoicePhase && (
                    <button onClick={canShuffle ? onShuffle : undefined} disabled={!canShuffle} className={`mt-4 px-8 py-3 font-bold rounded border uppercase tracking-[0.2em] transition-all text-xs flex items-center gap-3 backdrop-blur-md ${canShuffle ? 'bg-amber-600/20 border-amber-500/50 text-amber-100 hover:bg-amber-500/40 hover:scale-105 shadow-[0_0_20px_rgba(245,158,11,0.2)] cursor-pointer' : 'bg-stone-900/50 border-stone-800 text-stone-600 cursor-not-allowed'}`}>
                        <span>SHUFFLE DECK</span><span className={`px-1.5 py-0.5 rounded text-[10px] ${canShuffle ? 'bg-amber-500 text-black' : 'bg-stone-800 text-stone-600'}`}>{canShuffle ? '1/1' : '0/1'}</span>
                    </button>
                )}
                {isShuffling && (
                     <div className="flex flex-col items-center gap-3 mt-4"><div className="loading-spinner w-8 h-8 border-yellow-500 border-t-transparent"></div></div>
                )}
            </div>
            <style>{`
                @keyframes dealFromDeck {
                    0% { opacity: 0; transform: translateY(50px) scale(0.5); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-deal-p1 { animation: dealFromDeck 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
                .animate-deal-p2 { animation: dealFromDeck 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
            `}</style>
        </div>
    );
};

export const KingLootOverlay = ({ lootState, onAccept, onDecline, onReplace, onPickEnemy, onBackToPick }: any) => {
    if (!lootState || !lootState.active) return null;
    const { card, phase, currentDeck, enemyCards } = lootState;
    const canGoBack = enemyCards && enemyCards.length > 1;

    if (phase === 'PICK_ENEMY') {
        return (
             <div className="absolute inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center animate-fade-in">
                <h1 className="text-4xl font-black text-amber-500 mb-2 tracking-widest uppercase drop-shadow-[0_0_15px_gold]">VICTORY!</h1>
                <div className="text-white font-bold mb-8 text-sm uppercase tracking-wider animate-pulse">Choose a card to steal from the Enemy King</div>
                <div className="flex flex-wrap gap-8 items-center justify-center max-w-5xl px-4">
                    {enemyCards.map((c: CardType) => (
                        <div key={c.uniqueId || c.id} className="cursor-pointer hover:scale-110 transition-transform relative group" onClick={() => onPickEnemy(c)}>
                            <div className="absolute inset-0 bg-lime-500/0 group-hover:bg-lime-500/20 z-50 rounded-xl transition-colors flex items-center justify-center"><span className="opacity-0 group-hover:opacity-100 text-lime-400 font-black text-sm tracking-widest bg-black/60 px-2 py-1 rounded border border-lime-500">STEAL</span></div>
                            <Card card={c} isKingCard={true} bigMode={false} />
                        </div>
                    ))}
                </div>
                <button onClick={onDecline} className="mt-12 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold rounded border border-slate-600 uppercase tracking-widest transition-transform hover:scale-105">SKIP LOOTING</button>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center animate-fade-in">
            <h1 className="text-4xl font-black text-amber-500 mb-2 tracking-widest uppercase drop-shadow-[0_0_15px_gold]">VICTORY LOOT</h1>
            <div className="text-white font-bold mb-6 text-sm uppercase tracking-wider">{phase === 'REPLACE' ? 'Inventory Full! Choose card to DISCARD or CANCEL.' : 'You obtained a new King Card!'}</div>
            <div className="flex gap-12 items-center justify-center mb-8">
                <div className="flex flex-col items-center">
                     <div className="text-lime-400 font-black mb-2 text-xs uppercase tracking-widest">NEW CARD</div>
                     <div className="transform scale-110 shadow-[0_0_30px_rgba(255,255,0,0.3)]"><Card card={card} isKingCard={true} bigMode={false} /></div>
                </div>
                {phase === 'REPLACE' && (
                    <div className="flex flex-col items-center ml-8 p-6 bg-red-950/30 rounded-2xl border border-red-900/50 animate-fade-in">
                        <div className="text-red-400 font-black mb-4 text-xs uppercase tracking-widest animate-pulse">CLICK CARD TO DISCARD</div>
                        <div className="flex gap-4">
                            {currentDeck.map((c: CardType) => (
                                <div key={c.id} className="cursor-pointer hover:scale-110 transition-transform relative group" onClick={() => onReplace(c)}>
                                    <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 z-50 rounded-xl transition-colors flex items-center justify-center"><span className="opacity-0 group-hover:opacity-100 text-red-500 font-black text-2xl drop-shadow-md">✕</span></div>
                                    <Card card={c} isKingCard={true} bigMode={false} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div className="flex gap-4">
                {phase === 'CHOICE' && (
                    <>
                        {canGoBack && <button onClick={onBackToPick} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded border border-slate-600 uppercase tracking-widest transition-transform hover:scale-105 mr-4">← BACK</button>}
                        <button onClick={onAccept} className="px-8 py-3 bg-lime-600 hover:bg-lime-500 text-white font-black rounded border-2 border-lime-400 uppercase tracking-widest transition-transform hover:scale-105 shadow-[0_0_15px_lime]">TAKE IT</button>
                        <button onClick={onDecline} className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border-2 border-slate-500 uppercase tracking-widest transition-transform hover:scale-105">DISCARD IT</button>
                    </>
                )}
                {phase === 'REPLACE' && (
                    <button onClick={onDecline} className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border-2 border-slate-500 uppercase tracking-widest transition-transform hover:scale-105 flex items-center gap-2"><span>CANCEL SWAP</span><span className="text-xs font-normal opacity-60">(KEEP DECK)</span></button>
                )}
            </div>
        </div>
    );
};

export const KingPowerShuffleVisual = React.memo(({ onAnimationEnd }: { onAnimationEnd: () => void }) => {
    const [phase, setPhase] = useState('FLY_IN');
    useEffect(() => {
        const t1 = setTimeout(() => setPhase('SHUFFLE'), 1200);
        const t2 = setTimeout(() => onAnimationEnd(), 3500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [onAnimationEnd]);

    return (
        <div className="absolute inset-0 z-[3000] bg-black/95 flex flex-col items-center justify-center animate-fade-in pointer-events-auto">
            <div className="absolute top-1/4 flex flex-col items-center z-50">
                <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 tracking-[0.2em] uppercase drop-shadow-[0_0_25px_rgba(245,158,11,0.6)] font-chivo animate-pulse mb-4">{phase === 'FLY_IN' ? 'THE KINGS ARRIVE' : 'SHUFFLING DESTINY'}</div>
                <div className="text-amber-500/50 text-sm tracking-[0.5em] font-bold uppercase">PREPARING GAME DECK</div>
            </div>
            {phase === 'FLY_IN' && [0, 1, 2, 3].map(i => (
                <div key={i} className="absolute z-40" style={{ top: '50%', left: '50%', transform: `translate(-50%, -50%)`, animation: `kingFallIn 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards ${i * 0.15}s` }}>
                    <div className="king-card-size king-power-gold rounded-xl shadow-[0_0_50px_rgba(234,179,8,0.6)] flex items-center justify-center border-2 border-amber-200 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 mix-blend-overlay"></div><span className="text-6xl drop-shadow-md">👑</span>
                    </div>
                </div>
            ))}
            {phase === 'SHUFFLE' && (
                <div className="relative z-40 mt-10">
                    <div className="relative shuffling-deck transform scale-125">
                        <div className="card-size card-back-pattern rounded-xl shadow-2xl bg-stone-900 border-2 border-stone-700"><CardBackContent /></div>
                        <div className="absolute inset-0 rounded-xl shadow-[0_0_80px_rgba(245,158,11,0.4)] animate-pulse mix-blend-screen"></div>
                    </div>
                </div>
            )}
            <style>{`@keyframes kingFallIn { 0% { transform: translate(-50%, -50%) translate(0, -800px) scale(2) rotate(45deg); opacity: 0; } 60% { transform: translate(-50%, -50%) translate(0, 50px) scale(1) rotate(-10deg); opacity: 1; } 100% { transform: translate(-50%, -50%) translate(0, 0) scale(0) rotate(0deg); opacity: 1; } }`}</style>
        </div>
    );
});

export const CardModal = React.memo(({ hand, activePlayer, p1Stats, p2Stats, onPlay, onDiscard, showCards, onClose, canAffordFn, cardPlayedInTurn, isLocked, p1Name, p2Name, kingCards, playSFX, getKingBuffs, getEffectiveCardCost, p1Color, p2Color, activeColor }: any) => {
    if (!showCards) return null;
    
    // Updated Tint Logic: Use activeColor background with specific opacity instead of white
    const bgTintClass = activeColor ? `${activeColor.bg} bg-opacity-10` : 'bg-stone-900 bg-opacity-90';
    
    return (
        <div className={`card-modal-container ${bgTintClass} backdrop-blur-md`}>
            <div className="w-full flex justify-end px-6 pt-0 pb-0"><button onClick={() => { playSFX('button_click'); onClose(); }} className="text-white text-5xl font-bold hover:text-red-500 transition" title="CLOSE CARDS">&times;</button></div>
            
            {/* UPDATED HEADER LAYOUT - FIXED STATS SIDE */}
            <div className="w-full max-w-7xl mx-auto grid grid-cols-[1fr_auto_1fr] gap-8 px-0 py-2 border-b border-t border-white/20 items-center">
                
                {/* LEFT: ALWAYS P1 */}
                <div className="flex flex-col items-start gap-1">
                    <div className={`text-sm font-black uppercase tracking-widest ${p1Color ? p1Color.text : 'text-lime-400'}`}>{p1Name}</div>
                    <div className="flex items-center gap-3">
                        <ResourceIndicator type="BRICKS" label="" value={p1Stats.bricks} production={p1Stats.prodBricks} icon="🧱" />
                        <ResourceIndicator type="WEAPONS" label="" value={p1Stats.weapons} production={p1Stats.prodWeapons} icon="⚔️" />
                        <ResourceIndicator type="CRYSTALS" label="" value={p1Stats.crystals} production={p1Stats.prodCrystals} icon="💎" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <HpIndicator label="KING" value={p1Stats.king} />
                        <HpIndicator label="TOWER" value={p1Stats.tower} />
                        <HpIndicator label="WALL" value={p1Stats.wall} />
                    </div>
                </div>

                {/* CENTER SPACER / TITLE */}
                <div className="text-white/20 font-bold text-xs uppercase tracking-[0.3em]">VS</div>

                {/* RIGHT: ALWAYS P2/CPU */}
                <div className="flex flex-col items-end gap-1">
                    <div className={`text-sm font-black uppercase tracking-widest ${p2Color ? p2Color.text : 'text-red-500'}`}>{p2Name}</div>
                    <div className="flex items-center gap-3">
                        <ResourceIndicator type="BRICKS" label="" value={p2Stats.bricks} production={p2Stats.prodBricks} icon="🧱" />
                        <ResourceIndicator type="WEAPONS" label="" value={p2Stats.weapons} production={p2Stats.prodWeapons} icon="⚔️" />
                        <ResourceIndicator type="CRYSTALS" label="" value={p2Stats.crystals} production={p2Stats.prodCrystals} icon="💎" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <HpIndicator label="WALL" value={p2Stats.wall} />
                        <HpIndicator label="TOWER" value={p2Stats.tower} />
                        <HpIndicator label="KING" value={p2Stats.king} />
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-6 px-16 overflow-visible pt-16 pb-8 card-list-container custom-scrollbar justify-center items-start">
                {hand.map((card: any) => (
                    <Card key={card.uniqueId} card={card} canAfford={canAffordFn(card, activePlayer, kingCards)} onPlay={onPlay} onDiscard={onDiscard} forceDiscard={false} cardPlayedInTurn={cardPlayedInTurn} isLocked={isLocked} activeKingBuff={getKingBuffs(card, kingCards, p1Stats, p2Stats)} effectiveCost={getEffectiveCardCost(card, kingCards)} enable3D={true} tintColor={activeColor ? activeColor.text.replace('text-', '').replace('-500', '').replace('-400', '') : null} />
                ))}
            </div>
        </div>
    );
});

export const KingDeckOverlay = React.memo(({ visible, drawingState }: any) => {
    if (!visible) return null;
    return (
        <div className="absolute inset-0 z-[400] bg-black/90 backdrop-blur-md flex items-center justify-center animate-fade-in">
            <div className="absolute top-24 w-full text-center"><div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 uppercase tracking-[0.3em] drop-shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse font-chivo">KING'S TREASURY</div></div>
            <div className="relative transform scale-125">
                <div className="absolute inset-0 bg-amber-500 rounded-xl blur-2xl opacity-30 animate-pulse"></div>
                <div className="relative">{[0, 1, 2].map(i => (<div key={i} className="absolute inset-0 rounded-xl bg-red-950 border border-amber-900/50" style={{ transform: `translate(${i*2}px, ${i*2}px)` }}></div>))}<div className="king-card-size king-card-back-pattern rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden bg-red-950 border-2 border-yellow-500 z-20"><KingCardBackContent /></div></div>
                {drawingState !== 'IDLE' && (<div className={`absolute inset-0 z-50 pointer-events-none ${drawingState === 'DRAWING_P1' ? 'animate-king-draw-p1' : 'animate-king-draw-p2'}`}><div className="king-card-size king-card-back-pattern rounded-xl shadow-[0_0_30px_rgba(255,215,0,0.8)] border-2 border-yellow-400 overflow-hidden"><KingCardBackContent /></div></div>)}
            </div>
            <style>{`@keyframes kingDrawP1 { 0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; } 20% { transform: translate(0, -20px) scale(1.1) rotate(2deg); opacity: 1; z-index: 100; } 100% { transform: translate(0px, 800px) scale(1.5) rotate(-5deg); opacity: 0; } } @keyframes kingDrawP2 { 0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; } 20% { transform: translate(0, 20px) scale(1.1) rotate(-2deg); opacity: 1; z-index: 100; } 100% { transform: translate(0px, -800px) scale(1.5) rotate(5deg); opacity: 0; } } .animate-king-draw-p1 { animation: kingDrawP1 0.7s cubic-bezier(0.5, 0, 0.2, 1) forwards; } .animate-king-draw-p2 { animation: kingDrawP2 0.7s cubic-bezier(0.5, 0, 0.2, 1) forwards; }`}</style>
        </div>
    );
});

export const PlayedCardShowcase = React.memo(({ activeCard, isMultiplayer, activeKingBuff }: any) => {
    if (!activeCard) return null;
    const isPlayer = activeCard.playedBy === 'player';
    const isKingAction = activeCard.isKing;
    const displayName = isPlayer ? (isMultiplayer ? "P1 ACTION" : "PLAYER ACTION") : (isMultiplayer ? "P2 ACTION" : "CPU ACTION");
    const textGradient = isPlayer ? 'from-lime-300 to-lime-600' : 'from-red-300 to-red-600';
    // Z-INDEX FIX: Increased to 2000 to be above deck
    const containerClass = isKingAction ? "z-[2000] bg-slate-950/90 backdrop-blur-2xl" : "z-[2000] bg-black/60 backdrop-blur-[2px]";
    const glowColor = isPlayer ? 'rgba(132, 204, 22, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    
    // Scale up specifically for King Cards to be huge and readable
    const scaleClass = isKingAction ? "scale-[3.5]" : "scale-[2.2]";

    return (
        <div className={`absolute inset-0 flex items-center justify-center transition-all animate-fade-in overflow-hidden ${containerClass}`}>
            {isKingAction && (<><div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at center, ${glowColor} 0%, transparent 70%)`, opacity: 0.6 }}></div><div className="absolute inset-0 opacity-10 pattern-grid-fading"></div></>)}
            <div className="flex flex-col items-center justify-center relative z-10">
                <div className={`font-black mb-12 drop-shadow-lg uppercase tracking-[0.2em] font-chivo text-transparent bg-clip-text bg-gradient-to-b ${textGradient} w-screen text-center ${isKingAction ? 'text-6xl border-y border-white/10 py-6 bg-black/40' : 'text-3xl'}`} style={isKingAction ? { textShadow: '0 0 20px rgba(0,0,0,0.8)' } : {}}>{displayName}</div>
                {/* Increased Scale to 3.5 for King Cards */}
                <div className={`pop-in-3d pointer-events-none transform ${scaleClass} ${isKingAction ? 'drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] filter brightness-110 z-50' : ''}`}>
                    <Card card={activeCard.card} canAfford={true} bigMode={false} cardPlayedInTurn={0} isVisual={true} isLocked={true} isKingCard={activeCard.isKing} activeKingBuff={activeKingBuff} enable3D={true} />
                </div>
            </div>
        </div>
    );
});

export const DealingCardVisual = React.memo(({ startPlayer, card, delayTime, onAnimationEnd, isReturning }: any) => {
    const isPlayer = startPlayer === 'player';
    if (isReturning) {
        return (
            <div className="returning-card-visual card-size" style={{ animationDelay: `${delayTime}ms` }} onAnimationEnd={() => onAnimationEnd(card.uniqueId)}>
                <div className="w-full h-full relative" style={{ transformStyle: 'preserve-3d' }}><div className="absolute inset-0 backface-hidden"><Card card={card} canAfford={false} bigMode={false} isVisual={true} /></div><div className="absolute inset-0 backface-hidden" style={{ transform: 'rotateY(180deg)' }}><div className="w-full h-full rounded-xl card-back-pattern shadow-lg overflow-hidden bg-stone-950"><CardBackContent /></div></div></div>
            </div>
        );
    }
    return (<div className={`dealing-card ${isPlayer ? 'dealing-card-player' : 'dealing-card-opponent'} card-size rounded-xl card-back-pattern flex items-center justify-center shadow-lg overflow-hidden bg-stone-950`} style={{ animationDelay: `${delayTime}ms`, animationDuration: '2.0s' }} onAnimationEnd={(e) => { if (e.animationName === 'dealToPlayer') onAnimationEnd(card.uniqueId); }}><CardBackContent /></div>);
});
