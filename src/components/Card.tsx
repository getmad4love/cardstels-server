
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { CardType } from '../types';

interface CardProps {
  card: CardType;
  bigMode?: boolean;
  isVisual?: boolean;
  canAfford?: boolean;
  onPlay?: (card: CardType) => void;
  onDiscard?: (card: CardType) => void;
  isBack?: boolean;
  forceDiscard?: boolean;
  cardPlayedInTurn?: number;
  isLocked?: boolean;
  isKingCard?: boolean;
  onClick?: (card: CardType) => void;
  activeKingBuff?: string[];
  enable3D?: boolean;
  effectiveCost?: { costB: number; costW: number; costC: number };
  tintColor?: string; // Hex or tailwind class for owner tint
}

export const COLOR_BRICKS = 'text-red-500';
export const COLOR_WEAPONS = 'text-green-500';
export const COLOR_CRYSTALS = 'text-blue-400';

export const CardBackContent = React.memo(() => (
    <div className="w-full h-full relative overflow-hidden bg-stone-950">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(190, 242, 100, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(190, 242, 100, 0.3) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <div className="absolute top-0 right-0 w-20 h-[200%] bg-lime-500/10 -rotate-45 transform origin-top-right translate-x-10"></div>
        <div className="absolute top-0 left-0 w-10 h-[200%] bg-lime-500/10 -rotate-45 transform origin-top-left -translate-x-10"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 border-2 border-lime-400/80 rotate-45 flex items-center justify-center bg-black/60 backdrop-blur-sm shadow-[0_0_20px_rgba(163,230,53,0.5)]">
                <div className="w-16 h-16 border border-lime-400/40 flex items-center justify-center">
                    <div className="text-3xl -rotate-45 filter drop-shadow-[0_0_8px_rgba(163,230,53,0.8)]">🏰</div>
                </div>
            </div>
        </div>
        <div className="absolute top-2 w-full text-center">
            <span className="text-[10px] font-black text-lime-300 tracking-[0.3em] uppercase drop-shadow-[0_0_2px_lime]">Cardstels</span>
        </div>
        <div className="absolute bottom-2 w-full text-center">
            <span className="text-[10px] font-black text-lime-300 tracking-[0.3em] uppercase drop-shadow-[0_0_2px_lime]">Cardstels</span>
        </div>
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-lime-400 rounded-tl-sm shadow-[0_0_5px_lime]"></div>
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-lime-400 rounded-tr-sm shadow-[0_0_5px_lime]"></div>
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-lime-400 rounded-bl-sm shadow-[0_0_5px_lime]"></div>
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-lime-400 rounded-br-sm shadow-[0_0_5px_lime]"></div>
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-0.5 h-12 bg-lime-400/80 shadow-[0_0_5px_lime]"></div>
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-0.5 h-12 bg-lime-400/80 shadow-[0_0_5px_lime]"></div>
    </div>
));

export const KingCardBackContent = React.memo(() => (
    <div className="w-full h-full relative overflow-hidden bg-stone-950">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255, 200, 50, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 200, 50, 0.2) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 border-2 border-yellow-500/80 rotate-45 flex items-center justify-center bg-black/60 backdrop-blur-sm shadow-[0_0_20px_rgba(234,179,8,0.5)]">
                <div className="w-12 h-12 border border-yellow-500/40 flex items-center justify-center">
                    <div className="text-3xl -rotate-45 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]">👑</div>
                </div>
            </div>
        </div>
        <div className="absolute top-2 w-full text-center">
            <span className="text-[9px] font-black text-yellow-500 tracking-[0.2em] uppercase drop-shadow-[0_0_2px_gold]">Cardstels</span>
        </div>
        <div className="absolute bottom-2 w-full text-center">
            <span className="text-[9px] font-black text-yellow-500 tracking-[0.2em] uppercase drop-shadow-[0_0_2px_gold]">King Cards</span>
        </div>
    </div>
));

const Card = React.memo(({ card, canAfford, onPlay, onDiscard, bigMode = false, isBack = false, forceDiscard = false, cardPlayedInTurn, isVisual = false, isLocked, isKingCard = false, onClick, activeKingBuff, enable3D = false, effectiveCost, tintColor }: CardProps) => {
    const [hoverStyle, setHoverStyle] = useState<React.CSSProperties>({});
    const [discardArmed, setDiscardArmed] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const isKingPower = card && card.id === 42;
    const isSpecial = card && card.type === 4; // Special Cards (Type 4)
    const isProdCard = card && [1, 9, 18, 27, 41].includes(Number(card.id));

    const showB = effectiveCost ? effectiveCost.costB : (card ? card.costB || 0 : 0);
    const showW = effectiveCost ? effectiveCost.costW : (card ? card.costW || 0 : 0);
    const showC = effectiveCost ? effectiveCost.costC : (card ? card.costC || 0 : 0);

    const getCostClass = (val: number, baseVal: number, typeColor: string) => {
        if (effectiveCost) {
            if (val < baseVal) return "text-lime-400 font-black scale-110 drop-shadow-[0_0_5px_rgba(163,230,53,0.8)]";
            if (val > baseVal) return "text-red-400 font-black";
        }
        return typeColor;
    };

    // Corrected isPlayable logic: Special cards respect turn actions too.
    const isPlayable = isKingCard ? true : (canAfford && cardPlayedInTurn === 0 && !forceDiscard && !isLocked); 
    const cardClickable = isPlayable || onClick;

    // GRAYSCALE LOGIC
    let isGray = false;
    if (!isKingCard && !isKingPower && !bigMode) {
        if (forceDiscard) isGray = true;
        else if (!isVisual && !canAfford) isGray = true;
        else if (!cardClickable && !isVisual) isGray = true;
    }

    // --- RARITY & FOIL LOGIC ---
    let foilClass = "foil-common";
    let isRareOrBetter = false;

    if (isKingCard || isKingPower) {
        foilClass = "foil-king";
        isRareOrBetter = true;
    } else if (isSpecial) {
        foilClass = "foil-special"; 
        isRareOrBetter = true;
    } else if (card) {
        if (isProdCard) {
            foilClass = "foil-lime";
            isRareOrBetter = true;
        } else {
            const count = card.count || 0;
            if (count < 3) { foilClass = "foil-king"; isRareOrBetter = true; }
            else if (count < 5) { foilClass = "foil-epic"; isRareOrBetter = true; }
            else if (count < 8) { foilClass = "foil-rare"; isRareOrBetter = true; }
            else { foilClass = "foil-common"; isRareOrBetter = false; }
        }
    }

    const idleVars = useMemo(() => {
        const r = (min: number, max: number) => Math.random() * (max - min) + min;
        return {
            '--idle-dur': `${r(4, 7).toFixed(2)}s`,
            '--idle-delay': `${r(-5, 0).toFixed(2)}s`
        } as React.CSSProperties;
    }, []);

    const handleWrapperMouseLeave = useCallback(() => {
        setDiscardArmed(false);
    }, []);

    const handleCardFaceMouseLeave = useCallback(() => {
        setHoverStyle({});
        if (cardRef.current) {
            cardRef.current.classList.remove('interacting');
        }
    }, []);

    if (isBack) {
        return (
            <div className={`rounded-xl ${isKingCard ? 'king-card-back-pattern king-card-size' : 'card-back-pattern card-size'} m-1 flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform relative overflow-hidden bg-stone-950`}>
                {isKingCard ? <KingCardBackContent /> : <CardBackContent />}
            </div>
        );
    }

    const isSpecialKingStyle = isKingPower || isKingCard;

    let bgColor = isSpecialKingStyle ? "bg-amber-500 king-power-gold" : "bg-slate-800";
    let borderColor = isSpecialKingStyle ? "border-yellow-300 shadow-[0_0_20px_gold]" : "border-slate-600";
    let icon = "";

    if (isSpecialKingStyle) {
        icon = card.img || "👑";
    } else {
        if (isSpecial) {
            bgColor = "bg-white"; 
            borderColor = "border-teal-400 shadow-[0_0_20px_#2dd4bf]";
            icon = card.img || "✨";
        }
        else if (card.type === 0) { bgColor = "bg-red-950"; borderColor = "border-red-600"; icon = "🧱"; }
        else if (card.type === 1) { bgColor = "bg-green-950"; borderColor = "border-green-600"; icon = "⚔️"; }
        else if (card.type === 2) { bgColor = "bg-blue-950"; borderColor = "border-blue-600"; icon = "💎"; }

        if (!isSpecial && isProdCard) {
            borderColor = "border-lime-400 shadow-[0_0_15px_rgba(163,230,53,0.8)]";
        } else if (!isSpecial) {
            let rarityClass = "";
            const count = card.count || 0;
            if (count < 3) rarityClass = "border-yellow-400 shadow-[0_0_15px_gold]";
            else if (count < 5) rarityClass = "border-red-500 shadow-[0_0_10px_red]";
            else if (count < 8) rarityClass = "border-pink-500 shadow-[0_0_10px_#FF4FA3]";
            
            if (rarityClass) borderColor = rarityClass;
        }
    }

    // Logic for grayed out state styling
    if (isGray) {
        // Inner content is handled by a wrapper with grayscale class.
        // Border:
        if (isRareOrBetter) {
            // Rare cards keep their border color but might be slightly dimmer, inner is B&W
            // No changes needed to borderColor string, but we won't apply grayscale to the border div.
        } else {
            // Common cards lose their frame in gray state
            borderColor = "border-stone-800";
        }
    }

    const title = card.name.toUpperCase();
    const descLines = card.desc ? card.desc.split(',').map(s => s.trim()) : [];
    const isDiscardable = !isKingCard && cardPlayedInTurn === 0 && !isLocked;

    const opacityClass = (forceDiscard && !bigMode) ? 'opacity-80' : 'opacity-100';

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if ((isVisual || forceDiscard) && !enable3D) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xPct = (x / rect.width);
        const yPct = (y / rect.height);
        
        const rotateX = (yPct - 0.5) * -30;
        const rotateY = (xPct - 0.5) * 30;

        if (cardRef.current) {
            cardRef.current.classList.add('interacting');
        }

        setHoverStyle({
            transform: `perspective(1000px) translateY(${enable3D ? '-20px' : '-50px'}) scale(${enable3D ? '1.1' : '1.25'}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            // Keep this zIndex for inner element, but outer wrapper handles the main stack
            zIndex: 200, 
            boxShadow: `0 30px 60px -10px rgba(0,0,0,0.6), 0 0 20px rgba(${canAfford ? '96, 165, 250' : '0,0,0'}, 0.4)`,
            transition: 'transform 0.1s ease-out',
            '--rot-x': rotateX, 
            '--rot-y': rotateY
        } as React.CSSProperties);
    }, [isVisual, forceDiscard, canAfford, enable3D]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if ((isVisual || forceDiscard) && !enable3D) return;
    }, [isVisual, forceDiscard, enable3D]);

    const hasHoverStyle = Object.keys(hoverStyle).length > 0;
    const allowAnimations = !bigMode && (!isVisual || enable3D);
    const hoverClass = (allowAnimations && !hasHoverStyle) ? 'card-hover' : '';
    
    const idleClass = (allowAnimations && !hasHoverStyle) 
        ? (forceDiscard ? 'card-static-holo' : 'card-idle') 
        : '';

    const sizeClass = bigMode ? "big-card-size-adjusted" : (isKingCard ? "king-card-size" : "card-size");
    const textSize = isKingCard ? "text-sm" : "text-base";
    const iconSize = isKingCard ? "text-5xl" : (bigMode ? 'text-4xl' : 'text-3xl');
    
    // Increased text size for mobile readability
    const smallTextSize = isKingCard ? "text-[10px]" : "text-xs";

    const textColorClass = isSpecial ? 'text-slate-900' : (isKingPower ? 'text-amber-900' : 'text-white');
    const descColorClass = isSpecial ? 'text-slate-700' : (isKingPower ? 'text-amber-950 font-black' : 'text-gray-200');
    const bgContainerClass = isSpecial ? 'bg-slate-100/50' : (isKingPower ? 'bg-amber-100/40' : 'bg-black/40');
    const descContainerClass = isSpecial ? 'bg-slate-200/50' : (isKingPower ? 'bg-amber-900/10' : 'bg-black/50');
    const borderInternalClass = isSpecial ? 'border-teal-500/20' : 'border-white/5';

    const plasticTextClass = isSpecial ? '' : 'text-plastic';
    const plasticIconClass = isSpecial ? '' : 'icon-plastic';

    return (
        // ADDED: hover:z-[1000] to break out of stacking context when hovered
        <div className={`relative ${sizeClass} group select-none ${enable3D ? 'pointer-events-auto' : ''} hover:z-[1000] transition-all`}
            onMouseLeave={handleWrapperMouseLeave}>

            <div className={`absolute inset-0 rounded-xl bg-red-600 blur-2xl transition-opacity duration-300 pointer-events-none z-0 ${discardArmed ? 'opacity-100' : 'opacity-0'}`}></div>

            <div 
                ref={cardRef}
                className={`relative w-full h-full rounded-xl transition-all duration-300 ${hoverClass} ${idleClass} card-face-target`}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleCardFaceMouseLeave}
                onTouchMove={handleTouchMove}
                style={hasHoverStyle ? hoverStyle : idleVars}>

                <div className={`w-full h-full rounded-xl shadow-xl transition-all duration-300 ${opacityClass} ${!bigMode ? (cardClickable && !isVisual ? 'cursor-pointer shadow-lg' : 'cursor-default shadow-none') : 'cursor-default shadow-lg'} relative overflow-hidden` }
                    onClick={(e) => {
                        if (onClick) { e.stopPropagation(); onClick(card); }
                        else if (!bigMode && isPlayable && !isVisual && onPlay) { e.stopPropagation(); onPlay(card); }
                    }}>

                    {/* CONTENT CONTAINER - Applies Grayscale to inner elements if isGray */}
                    <div className={`absolute inset-0 rounded-[inherit] overflow-hidden flex flex-col p-2 ${bgColor} ${isKingPower ? 'king-power-gold' : ''} ${isGray ? 'grayscale brightness-50 contrast-125' : ''}`}>
                        
                        {/* GLASS PANEL TINT - Only if not gray */}
                        {!isSpecial && !isKingCard && !isKingPower && tintColor && !isGray && (
                            <div className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay opacity-30" style={{ backgroundColor: tintColor }}></div>
                        )}

                        <div className={`${textSize} font-black ${textColorClass} mb-1.5 leading-tight text-center border-b ${isSpecial ? 'border-slate-300' : (isKingPower ? 'border-amber-900/30' : 'border-white/10')} pb-1.5 uppercase tracking-wider truncate drop-shadow-md z-30 relative ${plasticTextClass}`}>
                            {title}
                        </div>

                        <div className={`flex-1 ${bgContainerClass} rounded m-1 flex items-center justify-center mb-1.5 border ${borderInternalClass} shadow-inner relative overflow-hidden z-30`}>
                            <span className={`${iconSize} drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-500 ${plasticIconClass}`}>{icon}</span>
                        </div>

                        <div className={`h-1/3 flex flex-col items-center justify-center ${descContainerClass} rounded p-1 mb-1 border ${borderInternalClass} overflow-hidden z-30`}>
                            {descLines.map((line, i) => (
                                <p key={i} className={`${smallTextSize} text-center ${descColorClass} leading-tight font-bold uppercase tracking-tight ${plasticTextClass}`}>
                                    {line}
                                </p>
                            ))}
                        </div>

                        {!isKingCard && (
                            <div className={`mt-auto flex justify-center items-center border-t ${isSpecial ? 'border-slate-300' : 'border-white/10'} pt-1.5 pb-1 z-30 ${isGray ? 'grayscale' : ''}`}>
                                <div className="flex items-center gap-1.5 justify-center w-full px-1">
                                    {(showB > 0) && (
                                        <div className={`cost-display-item text-plastic ${isGray ? 'text-stone-500 border-stone-800' : ''}`}>
                                            <span className="text-[13px] mb-0.5 opacity-90">🧱</span>
                                            <span className={`text-[14px] font-black tracking-tighter ${isGray ? 'text-stone-500' : getCostClass(showB, card.costB || 0, COLOR_BRICKS)}`}>
                                                {showB}
                                            </span>
                                        </div>
                                    )}
                                    {(showW > 0) && (
                                        <div className={`cost-display-item text-plastic ${isGray ? 'text-stone-500 border-stone-800' : ''}`}>
                                            <span className="text-[13px] mb-0.5 opacity-90">⚔️</span>
                                            <span className={`text-[14px] font-black tracking-tighter ${isGray ? 'text-stone-500' : getCostClass(showW, card.costW || 0, COLOR_WEAPONS)}`}>
                                                {showW}
                                            </span>
                                        </div>
                                    )}
                                    {(showC > 0) && (
                                        <div className={`cost-display-item text-plastic ${isGray ? 'text-stone-500 border-stone-800' : ''}`}>
                                            <span className="text-[13px] mb-0.5 opacity-90">💎</span>
                                            <span className={`text-[14px] font-black tracking-tighter ${isGray ? 'text-stone-500' : getCostClass(showC, card.costC || 0, COLOR_CRYSTALS)}`}>
                                                {showC}
                                            </span>
                                        </div>
                                    )}
                                    {(!isKingCard && card.id !== 42 && !isSpecial && showB === 0 && showW === 0 && showC === 0 && ((card.costB || 0) > 0 || (card.costW || 0) > 0 || (card.costC || 0) > 0)) && (
                                        <span className={`text-[14px] font-black cost-display-item px-2 border ${isGray ? 'text-stone-400 border-stone-600 bg-stone-800/40 shadow-none' : 'text-lime-400 border-lime-500 bg-lime-900/40 shadow-[0_0_10px_lime]'} text-plastic`}>FREE</span>
                                    )}
                                    {isSpecial && <span className="text-[12px] font-black text-teal-600 uppercase tracking-wider">SPECIAL</span>}
                                </div>
                            </div>
                        )}
                        
                        {forceDiscard && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                                <div className="absolute bg-red-900/40 w-[200%] h-12 rotate-45 flex items-center justify-center border-y-2 border-red-500/50 backdrop-blur-[2px]">
                                    <span className="text-red-300 font-black text-lg tracking-[0.2em] shadow-black drop-shadow-md text-plastic">DISCARDED</span>
                                </div>
                            </div>
                        )}
                        
                        {card.isMadness && !forceDiscard && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-purple-600/90 border-2 border-fuchsia-400 shadow-[0_0_15px_purple] px-2 py-1 rounded z-50 animate-pulse">
                                <div className="text-[10px] font-black text-white uppercase tracking-widest text-center leading-none">MADNESS<br/>-30% COST</div>
                            </div>
                        )}
                    </div>

                    <div className={`holo-foil-layer ${isGray ? 'foil-common' : foilClass} rounded-[inherit] ${isGray ? 'grayscale opacity-[0.15] mix-blend-luminosity brightness-50' : ''}`}></div>

                    {/* BORDER CONTAINER - REMOVED PLAYER TINT OVERRIDE ON BORDER */}
                    <div className={`absolute inset-0 rounded-xl border-[4px] ${borderColor} pointer-events-none z-40`}></div>

                </div>

                {!isKingCard && !isVisual && activeKingBuff && activeKingBuff.length > 0 && (
                    <div className="absolute top-0 right-0 w-full h-full pointer-events-none z-50">
                        {activeKingBuff.map((buffText, index) => {
                            const parts = buffText.includes(':') ? buffText.split(':') : [buffText];
                            const isTwoLine = parts.length > 1;
                            const isHauntEffect = buffText.includes("DISCARD") || buffText.includes("HAUNT");
                            
                            const shouldGrayLabel = isGray && !isHauntEffect;

                            let labelClasses = "absolute -right-4 backdrop-blur-md border rounded-l-md shadow-lg flex items-center px-2 py-1 transform transition-transform hover:scale-110 origin-right opacity-100 ";
                            let iconBgClass = "bg-purple-900";
                            let iconBorderClass = "border-white";
                            let textColorClass = "text-yellow-950";
                            let headColorClass = "text-yellow-900";

                            if (shouldGrayLabel) {
                                labelClasses += "bg-stone-800/90 border-stone-600 grayscale brightness-75";
                                iconBgClass = "bg-stone-700";
                                iconBorderClass = "border-stone-500";
                                textColorClass = "text-stone-400";
                                headColorClass = "text-stone-500";
                            } else {
                                labelClasses += "bg-gradient-to-r from-yellow-100/80 via-yellow-300/90 to-yellow-500/80 border-yellow-600 filter-none";
                            }

                            return (
                                <div
                                    key={index}
                                    className={labelClasses}
                                    style={{ top: `${2.7 + (index * 2.4)}rem`, zIndex: 60 + index, maxWidth: '140%' }}
                                >
                                    <div className={`absolute -left-3 top-1/2 -translate-y-1/2 ${iconBgClass} rounded-full w-6 h-6 border-2 ${iconBorderClass} shadow-sm flex items-center justify-center z-10`}>
                                        <span className="text-xs">👑</span>
                                    </div>
                                    <div className="flex flex-col ml-2 leading-none">
                                        {isTwoLine ? (
                                            <>
                                                <span className={`text-[9px] font-bold ${headColorClass} uppercase tracking-wider opacity-80 mb-0.5`}>{parts[0]}:</span>
                                                <span className={`text-xs font-black ${textColorClass} uppercase tracking-wide drop-shadow-sm whitespace-nowrap`}>{parts[1]}</span>
                                            </>
                                        ) : (
                                            <span className={`text-xs font-black ${textColorClass} uppercase tracking-wide whitespace-nowrap drop-shadow-sm`}>
                                                {buffText}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!bigMode && !forceDiscard && !isVisual && isDiscardable && onDiscard && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!discardArmed) {
                            setDiscardArmed(true);
                        } else {
                            onDiscard(card);
                            setDiscardArmed(false);
                        }
                    }}
                    disabled={!isDiscardable}
                    className={`absolute bottom-[-4.3rem] left-1/2 -translate-x-1/2 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white border-2 transition-all font-extrabold shadow-lg
                        ${discardArmed
                            ? 'bg-gradient-to-b from-red-600 to-red-800 border-red-400 scale-110 shadow-[0_0_20px_red] animate-pulse ring-2 ring-red-500/50'
                            : isDiscardable
                                ? 'bg-slate-800 border-slate-600 hover:bg-red-900 hover:border-red-500 hover:scale-105 hover:shadow-[0_0_15px_rgba(239,68,68,0.6)]'
                                : 'bg-red-950/50 border-red-900/30 opacity-50 cursor-not-allowed'
                        }`}
                    title={discardArmed ? "CONFIRM DISCARD" : "DISCARD (Uses turn action)"}
                >
                    {discardArmed ? "🗑️" : "❌"}
                </button>
            )}
        </div>
    );
});

export default Card;
