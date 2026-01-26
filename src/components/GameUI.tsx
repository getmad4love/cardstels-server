
import React from 'react';
import { 
    COLOR_BRICKS, COLOR_WEAPONS, COLOR_CRYSTALS, BORDER_WALL, BORDER_WEAPONS, BORDER_TOWER, 
    COLOR_KING, COLOR_TOWER, COLOR_WALL, COLOR_PRODUCTION_FLOAT, COLOR_ARCHER_FLOAT 
} from '../utils/constants';
import { FloatingTextData } from '../types';

export const ResourceIndicator = React.memo(({ label, value, production, icon, id, type }: any) => {
    const effectiveType = type || label;
    let valueColorClass = '';
    let borderColorClass = '';
    if (effectiveType === 'BRICKS') { valueColorClass = COLOR_BRICKS; borderColorClass = BORDER_WALL; }
    else if (effectiveType === 'WEAPONS') { valueColorClass = COLOR_WEAPONS; borderColorClass = BORDER_WEAPONS; }
    else if (effectiveType === 'CRYSTALS') { valueColorClass = COLOR_CRYSTALS; borderColorClass = BORDER_TOWER; }

    return (
        <div id={id} className={`relative flex items-center bg-slate-900/90 rounded-lg shadow-md border-2 ${borderColorClass} py-1 px-3 min-w-[95px] transition-all hover:scale-105`}>
            <div className={`text-2xl w-7 h-7 flex items-center justify-center mr-2 rounded-full ${borderColorClass.replace('border-', 'bg-').replace('-500', '-900').replace('-600', '-900')}`}>{icon}</div>
            <div className="flex flex-col flex-1">
                {label && <span className="text-[10px] text-slate-400 uppercase font-black leading-none mb-0.5 tracking-wider">{label}</span>}
                <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-extrabold ${valueColorClass} leading-none font-mono drop-shadow-md`}>{value}</span>
                    <span className={`text-lg font-black px-1 py-0.5 rounded-sm ${production >= 0 ? 'bg-lime-700/40 text-lime-300' : 'bg-red-700/40 text-red-300'} leading-none`}>{production >= 0 ? '+' : ''}{production}</span>
                </div>
            </div>
        </div>
    );
});

export const HpIndicator = React.memo(({ label, value }: any) => {
    let valueColorClass = '';
    let labelColorClass = '';
    if (label === 'KING') { valueColorClass = COLOR_KING; labelColorClass = 'text-yellow-300'; }
    else if (label === 'TOWER') { valueColorClass = COLOR_TOWER; labelColorClass = 'text-blue-300'; }
    else if (label === 'WALL') { valueColorClass = COLOR_WALL; labelColorClass = 'text-red-300'; }

    return (
        <div className={`text-center px-3 py-1 rounded-full bg-slate-800/50`}>
            <span className={`text-[10px] font-bold uppercase leading-none ${labelColorClass} tracking-wide`}>{label}</span>
            <span className={`text-base font-extrabold ml-1.5 ${valueColorClass}`}>{value}</span>
        </div>
    );
});

export const ArcherIcon = ({ isCpu, color }: { isCpu: boolean, color: string }) => (
    <div className={`absolute -top-7 left-1/2 -translate-x-1/2 text-3xl filter z-30 transition-all duration-300 ${isCpu ? 'scale-x-[-1]' : ''}`} style={{ color: 'transparent', textShadow: `0 0 0 ${color || 'white'}` }}>🏹</div>
);

export const FloatingText = React.memo(({ text }: { text: FloatingTextData }) => {
    let colorClass = "text-white";
    let symbol = text.val > 0 ? "+" : "";
    let sizeClass = "text-4xl";
    let customStyle = {};

    if (text.type === 'PROD') {
        sizeClass = "text-[22px] font-black";
        colorClass = "text-lime-300";
        const key = text.key ? text.key.toLowerCase() : '';
        let strokeColor = 'transparent';
        if (key.includes('brick')) strokeColor = '#ef4444';
        else if (key.includes('weapon')) strokeColor = '#22c55e';
        else if (key.includes('crystal')) strokeColor = '#3b82f6';
        customStyle = { WebkitTextStroke: `0.5px ${strokeColor}`, textShadow: 'none' };
    } else if (text.val < 0) {
        colorClass = "text-black font-black";
        // Logic to detect resource type for colored outline on negative values
        const key = text.key ? text.key.toLowerCase() : '';
        let strokeColor = '#ef4444'; // Default Red (Bricks or generic)
        if (key.includes('weapon')) strokeColor = '#22c55e'; // Green
        else if (key.includes('crystal')) strokeColor = '#3b82f6'; // Blue
        else if (key.includes('tower')) strokeColor = '#06b6d4'; // Cyan
        else if (key.includes('king')) strokeColor = '#eab308'; // Gold
        
        customStyle = { WebkitTextStroke: `1.5px ${strokeColor}`, textShadow: `0 0 2px ${strokeColor}` };
    } else {
        const key = text.key ? text.key.replace('prod', '').toLowerCase() : null;
        const isArcherDamage = text.type === 'ARCHER_DAMAGE';
        const FloatingColorMap: any = { 'PROD': COLOR_PRODUCTION_FLOAT, 'king': COLOR_KING, 'tower': COLOR_TOWER, 'wall': COLOR_WALL, 'bricks': COLOR_BRICKS, 'weapons': COLOR_WEAPONS, 'crystals': COLOR_CRYSTALS };
        if (isArcherDamage) { colorClass = COLOR_ARCHER_FLOAT; }
        else if (key && key in FloatingColorMap) { colorClass = FloatingColorMap[key]; }
        else { if (text.val > 0) colorClass = "text-green-400"; }
    }

    const direction = text.isDown ? 'down-' : '';
    const animClass = `floating-text-${direction}${text.variant}`;
    
    return (<div className={`floating-text ${animClass} ${sizeClass} ${colorClass}`} style={{ left: `${text.x}px`, top: `${text.y}px`, ...customStyle }}>{symbol}{text.val}</div>);
});

export const AnimationOverlay = React.memo(({ animations }: { animations: any[] }) => (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {animations.map(anim => {
            if (anim.type === 'PROJECTILE') { return (<div key={anim.id} className={`absolute w-10 h-3 bg-white rounded-full shadow-[0_0_15px_white] ${anim.direction === 'RIGHT' ? 'projectile-right bg-gradient-to-r from-transparent to-cyan-400' : 'projectile-left bg-gradient-to-l from-transparent to-red-500'}`} style={{ top: '45%' }}></div>); }
            if (anim.type === 'ARROW_LOB') { return (<div key={anim.id} className={`absolute text-4xl shadow-[0_0_10px_lime] rounded-full px-1 ${anim.direction === 'RIGHT' ? 'arrow-lob-right' : 'arrow-lob-left'}`}>➵</div>); }
            return null;
        })}
    </div>
));
