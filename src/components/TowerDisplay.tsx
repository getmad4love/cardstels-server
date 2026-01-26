
import React from 'react';
import { 
    WIN_TOWER, MAX_WALL, WIN_KING_MAX 
} from '../utils/constants';
import { 
    BORDER_KING, BORDER_TOWER, BORDER_WALL, 
    COLOR_KING, COLOR_TOWER, COLOR_WALL, 
    getTierColor 
} from '../utils/constants';
import { ArcherIcon } from './GameUI';

export const TowerDisplay = React.memo(({ height, wall, king, shield, idPrefix, mirror = false, isDestroyed = false, label, colorProfile, isBurning }: any) => {
    const towerH = Math.min(100, Math.max(0, (height / WIN_TOWER) * 100));
    const wallH = Math.min(100, Math.max(0, (wall / MAX_WALL) * 100));
    const kingH = Math.min(100, Math.max(0, (king / WIN_KING_MAX) * 100));
    
    const statBoxStyle = "bg-stone-900/90 border-t-2 w-20 py-1 flex flex-col items-center justify-center rounded-b-md shadow-xl backdrop-blur-md mt-1 transition-transform hover:scale-105";
    const towerColor = getTierColor(height);
    const wallColor = getTierColor(wall);

    const kingWidth = "w-20";
    const towerWidth = "w-24";
    const wallWidth = "w-20";

    // --- COLOR APPLICATION ---
    // Default fallback
    const defaultColor = mirror ? 
        { tower: 'from-red-700 to-red-900', border: 'border-red-500', wall: 'bg-stone-800', king: 'bg-red-900', text: 'text-red-500', roof: 'bg-red-700' } :
        { tower: 'from-lime-500 to-lime-700', border: 'border-lime-400', wall: 'bg-stone-800', king: 'bg-red-900', text: 'text-lime-500', roof: 'bg-lime-500' };

    const activeColor = colorProfile || defaultColor;

    const towerBodyClass = `${activeColor.tower} ${activeColor.border}`;
    const towerRoofClass = activeColor.roof || 'bg-stone-600'; 
    const towerRoofInnerClass = "bg-white/20";
    const wallBodyClass = activeColor.wall;
    const kingBgClass = activeColor.king;

    const totalHP = height + wall + king;
    let hpColor = 'text-red-500';
    if (totalHP >= 50) hpColor = 'text-white';
    else if (totalHP >= 30) hpColor = 'text-yellow-400';
    else if (totalHP >= 15) hpColor = 'text-orange-500';

    return (
        <div className={`flex flex-col items-center h-full justify-end relative mx-2 group ${isDestroyed ? 'crumbled-castle' : ''}`}>
            {isBurning && <div className="burn-overlay"></div>}

            {/* SHIELD OVERLAY (Glass Effect) */}
            {shield > 0 && (
                <div className="absolute bottom-20 w-[160%] h-[300px] z-50 pointer-events-none shield-visual">
                    {/* Glass Dome */}
                    <div className="absolute inset-0 bg-cyan-400/10 border-t border-x border-cyan-200/40 rounded-t-[10rem] shadow-[0_0_50px_rgba(34,211,238,0.2),inset_0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-[2px] animate-pulse-glow">
                        <div className="absolute top-4 right-10 w-20 h-10 bg-white/20 blur-xl rounded-full transform rotate-12"></div>
                    </div>
                    {/* Badge */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyan-950/80 px-3 py-1 rounded-full border border-cyan-400 text-cyan-300 font-black text-sm tracking-widest shadow-[0_0_15px_cyan] flex items-center gap-2">
                        <span className="text-lg">🛡️</span> {shield}
                    </div>
                </div>
            )}

            <div className={`flex items-end h-64 gap-1.5 relative w-full justify-center bg-transparent ${mirror ? 'flex-row' : 'flex-row'}`}>
                {isBurning && <div className="absolute inset-0 z-40 pointer-events-none burn-particles"></div>}
                
                {/* KING TOWER */}
                <div className={`relative z-0 flex flex-col justify-end h-full ${kingWidth} items-center ${mirror ? 'order-3' : 'order-1'}`}>
                    <div id={`${idPrefix}-king`} className="absolute top-16 w-full h-full pointer-events-none"></div>
                    <div className={`w-full flex flex-col items-center justify-end z-0 transition-all duration-300 pb-1 ${king <= 0 ? 'opacity-30 grayscale blur-sm' : ''}`}>
                        <div className="text-3xl animate-bounce drop-shadow-lg filter drop-shadow-[0_0_5px_gold] mb-0.5">👑</div>
                        <div className={`w-12 h-16 ${kingBgClass} rounded-t-lg border-2 border-yellow-600 relative overflow-hidden shadow-2xl`}>
                            <div className="absolute bottom-0 w-full bg-black/40" style={{height: `${100 - kingH}%`, transition: 'height 0.5s'}}></div>
                            <div className="absolute inset-0 bg-yellow-500/10"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl opacity-50">🏰</div>
                        </div>
                    </div>
                </div>

                {/* MAIN TOWER */}
                <div className={`relative z-10 ${towerWidth} flex flex-col justify-end h-full px-0.5 ${mirror ? 'order-2' : 'order-2'}`}>
                    <div id={`${idPrefix}-tower`} className="absolute top-0 w-full h-full pointer-events-none"></div>
                    <div className={`w-full bg-gradient-to-b ${towerBodyClass} relative tower-transition shadow-2xl rounded-t-sm border-x-2 border-t-2 z-10`} style={{ height: `${towerH}%`, minHeight: '4px' }}>
                        <div className={`absolute -top-7 left-1/2 -translate-x-1/2 w-20 h-7 ${towerRoofClass} tower-roof shadow-lg z-20 flex items-center justify-center`}><div className={`w-1.5 h-full ${towerRoofInnerClass}`}></div></div>
                        <div className="absolute inset-0 pattern-bricks-texture mix-blend-overlay opacity-30"></div>
                        {height >= 50 && towerColor && (
                            <div className="absolute -top-[70px] left-1/2 -translate-x-1/2 w-0.5 h-12 bg-stone-300 z-0 shadow-sm flex flex-col justify-end items-center">
                                <div className="absolute bottom-5 left-0.5 w-10 h-6 flag-wave rounded-r-md shadow-sm origin-left" style={{ backgroundColor: towerColor, boxShadow: `0 0 5px ${towerColor}` }}></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* WALL */}
                <div className={`relative z-20 ${wallWidth} flex flex-col justify-end h-full ${mirror ? 'order-1' : 'order-3'}`}>
                    <div id={`${idPrefix}-wall`} className="absolute bottom-0 w-full h-1/2 pointer-events-none"></div>
                    <div className={`w-full ${wallBodyClass} relative tower-transition shadow-xl border-2 border-b-0 border-stone-600 rounded-t-sm`} style={{ height: `${wallH}%`, minHeight: '4px' }}>
                        <div className="absolute inset-0 pattern-bricks-texture mix-blend-overlay opacity-20 pointer-events-none"></div>
                        {wall >= 50 && <ArcherIcon isCpu={mirror} color={wallColor ?? ""} />}
                        <div className="absolute -top-2.5 w-full h-2.5 flex justify-between px-0.5">{Array.from({length: 3}).map((_,i) => (<div key={i} className="w-3 h-full bg-stone-700"></div>))}</div>
                    </div>
                </div>
            </div>

            <div className={`flex items-start gap-1.5 justify-center ${mirror ? 'flex-row' : 'flex-row'}`}>
                <div className={`${statBoxStyle} ${BORDER_KING} ${mirror ? 'order-3' : 'order-1'}`}>
                    <span className="text-[10px] text-yellow-500 uppercase font-black tracking-widest leading-none mb-0.5">KING</span>
                    <span className={`text-lg font-black ${COLOR_KING} font-mono leading-none`}>{king}</span>
                </div>
                <div className={`${statBoxStyle} ${BORDER_TOWER} ${towerWidth} ${mirror ? 'order-2' : 'order-2'}`}>
                    <span className="text-[10px] text-blue-400 uppercase font-black tracking-widest leading-none mb-0.5">TOWER</span>
                    <span className={`text-lg font-black ${COLOR_TOWER} font-mono leading-none`}>{height}</span>
                </div>
                <div className={`${statBoxStyle} ${BORDER_WALL} ${mirror ? 'order-1' : 'order-3'}`}>
                    <span className="text-[10px] text-red-500 uppercase font-black tracking-widest leading-none mb-0.5">WALL</span>
                    <span className={`text-lg font-black ${COLOR_WALL} font-mono leading-none`}>{wall}</span>
                </div>
            </div>
            <div className="mt-3 text-base font-extrabold uppercase tracking-widest text-slate-400 drop-shadow-md">{label}</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 font-chivo text-xl font-black tracking-wider">
                <span className={activeColor.text}>HP</span>
                <span className={hpColor}>{totalHP}</span>
            </div>
        </div>
    );
});
