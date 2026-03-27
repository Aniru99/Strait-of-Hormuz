/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Zap, Play, RotateCcw, ShoppingCart, X, Trophy, AlertTriangle, Home, Target, Skull } from 'lucide-react';

// --- Types & Constants ---

type GameState = 'INTRO' | 'CINEMATIC_INTRO' | 'DIFFICULTY_SELECT' | 'STORY_CINEMATIC' | 'START' | 'PLAYING' | 'GAMEOVER' | 'LEVEL_COMPLETE' | 'MISSION_ACCOMPLISHED';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  speed: number;
  health?: number;
  maxHealth?: number;
  type: 'TANKER' | 'HOSTILE' | 'MISSILE';
  ironDomeHealth?: number;
  hasIronDome?: boolean;
  yOffset?: number;
  yDirection?: number;
}

interface Hostile extends Entity {
  targetY: number;
}

interface Missile extends Entity {
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  isSuper?: boolean;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const COASTLINE_Y = CANVAS_HEIGHT - 20;

// --- Sound Engine ---

let audioCtx: AudioContext | null = null;

const createSound = (type: 'launch' | 'explosion' | 'music' | 'baseHit' | 'tankerHit' | 'intercept') => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  if (type === 'music') {
    const playNote = (freq: number, time: number, duration: number, type: OscillatorType = 'sawtooth', vol = 0.04) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };

    const tempo = 150; // Faster, more intense tempo
    const secondsPerBeat = 60 / tempo;
    for (let i = 0; i < 64; i++) {
      const time = audioCtx.currentTime + i * secondsPerBeat * 0.25;
      const freq = i % 16 === 0 ? 50 : i % 8 === 0 ? 70 : i % 4 === 0 ? 90 : 40;
      playNote(freq, time, 0.1, 'sawtooth', 0.05);
      if (i % 4 === 0) playNote(150, time, 0.05, 'square', 0.02); // Rhythmic metallic hit
      if (i % 8 === 0) playNote(300, time, 0.1, 'sine', 0.01); // High tension synth
    }
    return;
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === 'launch') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
  } else if (type === 'baseHit') {
    // Deep, alarming impact sound
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(80, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.6);
  } else if (type === 'tankerHit') {
    // Heavy metallic impact
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(120, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.4);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  } else if (type === 'intercept') {
    // Sharp, high-pitched "ping"
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
  } else {
    // Standard explosion - Improved "Boom" sound
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.6);
    
    const noise = audioCtx.createBufferSource();
    const bufferSize = audioCtx.sampleRate * 0.6;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.6);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    
    oscillator.start();
    noise.start();
    oscillator.stop(audioCtx.currentTime + 0.6);
    noise.stop(audioCtx.currentTime + 0.6);
  }
};

// --- Story Cinematic Component ---

const StoryCinematic: React.FC<{ onComplete: () => void, difficulty: Difficulty }> = ({ onComplete, difficulty }) => {
  const [scene, setScene] = useState(1);
  const [textIndex, setTextIndex] = useState(0);

  const scene1Text = [
    "[ALLIED COMMAND]",
    "STATUS: CRITICAL.",
    "COMMODORE: \"Gentlemen, the global economy relies on the flow of energy. We have received intelligence that the Strait is being reinforced with hostile missile bases.\"",
    "COMMANDER: \"We have one directive. We must pass the oil tankers at *any* cost. We will destroy their attacking bases if they fire.\""
  ];

  const scene3Text = [
    "[REGIONAL DEFENSE COMMAND]",
    "ALERT: NAVAL CONVOY APPROACHING.",
    "LEADER: \"They think they can violate our waters. They are testing our resolve.\"",
    "COMMANDER: \"They will not pass. Not a *single* tanker should pass by. ATTACK ALL!!\""
  ];

  useEffect(() => {
    let timer: any;
    if (scene === 1) {
      if (textIndex < scene1Text.length - 1) {
        timer = setTimeout(() => setTextIndex(prev => prev + 1), 2500);
      } else {
        timer = setTimeout(() => {
          setScene(2);
          setTextIndex(0);
        }, 3000);
      }
    } else if (scene === 2) {
      timer = setTimeout(() => setScene(3), 3000);
    } else if (scene === 3) {
      if (textIndex < scene3Text.length - 1) {
        timer = setTimeout(() => setTextIndex(prev => prev + 1), 2500);
      } else {
        timer = setTimeout(() => setScene(4), 3000);
      }
    } else if (scene === 4) {
      timer = setTimeout(() => onComplete(), 2000);
    }
    return () => clearTimeout(timer);
  }, [scene, textIndex]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] bg-black overflow-hidden flex flex-col items-center justify-center font-mono"
    >
      <AnimatePresence mode="wait">
        {scene === 1 && (
          <motion.div 
            key="scene1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex flex-col items-center justify-center p-10 bg-[radial-gradient(circle_at_center,rgba(6,78,59,0.2)_0%,rgba(0,0,0,1)_70%)]"
          >
            <div className="absolute top-10 left-10 border-l-2 border-emerald-500 pl-4 py-2">
              <p className="text-emerald-500 text-[10px] tracking-[0.5em] uppercase">UPLINK: SECURE</p>
              <p className="text-emerald-800 text-[8px] uppercase">ENCRYPTION: AES-256</p>
            </div>

            <div className="relative w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <motion.div 
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="relative h-96 bg-emerald-950/20 border border-emerald-500/30 overflow-hidden"
              >
                <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.1)_1px,transparent_1px)] bg-[length:100%_4px]" />
                <svg viewBox="0 0 200 300" className="w-full h-full opacity-40">
                  <path d="M100,50 Q130,50 140,80 T130,150 L150,250 L50,250 L70,150 T60,80 Q70,50 100,50" fill="#064e3b" />
                  <circle cx="100" cy="80" r="25" fill="#065f46" />
                </svg>
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 p-2 border border-emerald-500/20">
                  <p className="text-emerald-500 text-[8px] uppercase tracking-widest">Subject: COMMODORE_A1</p>
                </div>
              </motion.div>

              <div className="space-y-4">
                {scene1Text.slice(0, textIndex + 1).map((line, i) => (
                  <motion.p 
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`text-sm md:text-lg leading-relaxed ${i === 0 ? 'text-emerald-400 font-black tracking-widest' : i === 1 ? 'text-red-500 font-bold' : 'text-emerald-100'}`}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {scene === 2 && (
          <motion.div 
            key="scene2"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="w-full h-full flex flex-col items-center justify-center bg-black"
          >
            <div className="relative w-full max-w-5xl aspect-video border-2 border-red-600/30 bg-red-950/5">
              <svg viewBox="0 0 1000 600" className="w-full h-full">
                <path d="M0,100 L150,120 Q300,150 450,80 T700,120 T1000,60 L1000,0 L0,0 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <path d="M0,500 L200,480 Q400,450 550,520 T800,480 T1000,540 L1000,600 L0,600 Z" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
                
                <motion.circle 
                  cx="520" cy="350" r="80" 
                  fill="rgba(239, 68, 68, 0.1)" 
                  stroke="rgba(239, 68, 68, 0.5)" 
                  strokeDasharray="5,5"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <circle cx="520" cy="350" r="5" fill="red" />
                  <text x="530" y="355" fill="red" fontSize="14" fontWeight="black" className="uppercase tracking-widest">DANGER ZONE: HOSTILE BATTERIES</text>
                </motion.g>

                <motion.path 
                  d="M100,300 L900,300" 
                  stroke="rgba(245, 158, 11, 0.3)" 
                  strokeWidth="2" 
                  strokeDasharray="10,10"
                  animate={{ strokeDashoffset: [0, -100] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
                />
              </svg>
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div 
                  initial={{ opacity: 0, scale: 2 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-600 text-white px-10 py-4 font-black text-4xl italic tracking-tighter uppercase skew-x-[-10deg] shadow-[10px_10px_0_rgba(0,0,0,1)]"
                >
                  INTELLIGENCE REVEALED
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {scene === 3 && (
          <motion.div 
            key="scene3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex flex-col items-center justify-center p-10 bg-[radial-gradient(circle_at_center,rgba(153,27,27,0.2)_0%,rgba(0,0,0,1)_70%)]"
          >
            <div className="absolute top-10 right-10 border-r-2 border-red-600 pr-4 py-2 text-right">
              <p className="text-red-500 text-[10px] tracking-[0.5em] uppercase">ALERT: INTRUSION</p>
              <p className="text-red-800 text-[8px] uppercase">DEFENSE STATE: MAXIMUM</p>
            </div>

            <div className="relative w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="space-y-4 order-2 md:order-1">
                {scene3Text.slice(0, textIndex + 1).map((line, i) => (
                  <motion.p 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`text-sm md:text-lg leading-relaxed ${i === 0 ? 'text-red-500 font-black tracking-widest' : i === 1 ? 'text-yellow-500 font-bold' : 'text-red-100'}`}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>

              <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="relative h-96 bg-red-950/20 border border-red-500/30 overflow-hidden order-1 md:order-2"
              >
                <div className="absolute inset-0 bg-[linear-gradient(rgba(239,68,68,0.1)_1px,transparent_1px)] bg-[length:100%_4px]" />
                <svg viewBox="0 0 200 300" className="w-full h-full opacity-40">
                  <path d="M100,50 Q130,50 140,80 T130,150 L150,250 L50,250 L70,150 T60,80 Q70,50 100,50" fill="#991b1b" />
                  <circle cx="100" cy="80" r="25" fill="#7f1d1d" />
                  <motion.circle 
                    cx="100" cy="200" r="10" 
                    fill="red" 
                    animate={{ scale: [0, 2], opacity: [1, 0] }} 
                    transition={{ repeat: Infinity, duration: 1 }} 
                  />
                </svg>
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 p-2 border border-red-500/20">
                  <p className="text-red-500 text-[8px] uppercase tracking-widest">Subject: DEFENSE_LEADER_X</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {scene === 4 && (
          <motion.div 
            key="scene4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex flex-col items-center justify-center bg-black"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              transition={{ duration: 1.5 }}
              className="text-center"
            >
              <h2 className="text-6xl font-black text-white mb-4 italic tracking-tighter uppercase">ENGAGING PROTOCOL</h2>
              <div className="flex gap-2 justify-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div 
                    key={i}
                    className="w-4 h-4 bg-red-600"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    </motion.div>
  );
};

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('INTRO');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [score, setScore] = useState(15); // Starting credits
  const [level, setLevel] = useState(1);
  const [shipsDestroyed, setShipsDestroyed] = useState(0);
  const [shipsEscaped, setShipsEscaped] = useState(0);
  const [launchpadHealth, setLaunchpadHealth] = useState(5);
  const [tankerHealth, setTankerHealth] = useState(100);
  const [cooldown, setCooldown] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [superMissiles, setSuperMissiles] = useState(0);
  const [superMissilesPurchasedThisLevel, setSuperMissilesPurchasedThisLevel] = useState(0);
  const [missilesRemaining, setMissilesRemaining] = useState(150);
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);

  // Upgrades
  const [missileSpeed, setMissileSpeed] = useState(18); // Decreased speed
  const [tankerArmor, setTankerArmor] = useState(1); // Not used in attack mode for player, but kept for logic
  const [cooldownRate, setCooldownRate] = useState(2.5); // Much faster reload

  const musicIntervalRef = useRef<any>(null);

  const startBattleMusic = () => {
    if (musicIntervalRef.current) clearInterval(musicIntervalRef.current);
    createSound('music');
    musicIntervalRef.current = setInterval(() => createSound('music'), 8000);
  };

  const stopBattleMusic = () => {
    if (musicIntervalRef.current) clearInterval(musicIntervalRef.current);
  };

  // Game Refs
  const entitiesRef = useRef<{
    tankers: Entity[];
    hostiles: Hostile[];
    missiles: Missile[];
    incomingMissiles: { x: number; y: number; vx: number; vy: number; speed: number; isHuge?: boolean }[];
    explosions: { x: number; y: number; radius: number; life: number }[];
  }>({
    tankers: [],
    hostiles: [],
    missiles: [],
    incomingMissiles: [],
    explosions: [],
  });

  const lastSpawnRef = useRef(0);
  const lastIncomingMissileSpawnRef = useRef(0);
  const tankersSpawnedThisLevelRef = useRef(0);
  const frameRef = useRef(0);

  const resetGameData = () => {
    setScore(15);
    setLevel(1);
    setShipsDestroyed(0);
    setShipsEscaped(0);
    setLaunchpadHealth(5);
    setTankerHealth(100);
    setCooldown(0);
    setSuperMissiles(0);
    setSuperMissilesPurchasedThisLevel(0);
    setMissilesRemaining(150);
    setMissileSpeed(18);
    tankersSpawnedThisLevelRef.current = 0;
    setCooldownRate(2.5);
    entitiesRef.current = {
      tankers: [],
      hostiles: [],
      missiles: [],
      incomingMissiles: [],
      explosions: [],
    };
  };

  const startGame = (diff: Difficulty) => {
    setDifficulty(diff);
    setGameState('PLAYING');
    setShipsDestroyed(0);
    setShipsEscaped(0);
    setLaunchpadHealth(5);
    setTankerHealth(100);
    setCooldown(0);
    setSuperMissilesPurchasedThisLevel(0);
    setMissilesRemaining(150);
    setLevel(1);
    tankersSpawnedThisLevelRef.current = 0;
    entitiesRef.current = {
      tankers: [],
      hostiles: [],
      missiles: [],
      incomingMissiles: [],
      explosions: [],
    };
    spawnTanker();
    startBattleMusic();
  };

  const nextLevel = () => {
    if (level >= 5) {
      if (difficulty === 'EASY') {
        setDifficulty('MEDIUM');
        setLevel(1);
      } else if (difficulty === 'MEDIUM') {
        setDifficulty('HARD');
        setLevel(1);
      } else {
        setGameState('MISSION_ACCOMPLISHED');
        return;
      }
    } else {
      setLevel(prev => prev + 1);
    }
    
    setShipsDestroyed(0);
    setShipsEscaped(0);
    setLaunchpadHealth(5);
    setSuperMissilesPurchasedThisLevel(0);
    setMissilesRemaining(150);
    tankersSpawnedThisLevelRef.current = 0;
    setGameState('PLAYING');
    entitiesRef.current = {
      tankers: [],
      hostiles: [],
      missiles: [],
      incomingMissiles: [],
      explosions: [],
    };
    spawnTanker();
  };

  const spawnTanker = () => {
    const levelSpeed = 1.5 + (level * 0.3); // Increased ship speed
    const y = 100 + (Math.random() * 100); // Random initial Y
    
    tankersSpawnedThisLevelRef.current += 1;
    
    // Iron Dome frequency: 3 times per sector (at ships 3, 7, 11)
    let hasIronDome = false;
    const currentCount = tankersSpawnedThisLevelRef.current;
    if (currentCount === 3 || currentCount === 7 || currentCount === 11) {
      hasIronDome = true;
    }

    entitiesRef.current.tankers.push({
      x: -120,
      y: y,
      width: 100,
      height: 40,
      color: '#2d3748', // Realistic dark steel
      speed: levelSpeed,
      health: 100,
      maxHealth: 100,
      type: 'TANKER',
      hasIronDome: hasIronDome,
      ironDomeHealth: hasIronDome ? 5 : 0, // 5 missiles to break
      yOffset: 0,
      yDirection: Math.random() > 0.5 ? 1 : -1,
    });
  };

  const spawnHostile = () => {
    // These are defenders in attack mode
    const side = Math.random() > 0.5 ? 'TOP' : 'BOTTOM';
    const x = Math.random() * (CANVAS_WIDTH - 200) + 100;
    const y = side === 'TOP' ? -40 : CANVAS_HEIGHT + 40;
    
    let speed = 1.5 + (level * 0.4);
    if (difficulty === 'MEDIUM') speed += 1.0;
    if (difficulty === 'HARD') speed += 2.0;

    entitiesRef.current.hostiles.push({
      x,
      y,
      width: 25,
      height: 18,
      color: '#48bb78', // Defensive green
      speed,
      type: 'HOSTILE',
      targetY: CANVAS_HEIGHT / 2,
    });
  };

  const spawnIncomingMissile = () => {
    const startX = Math.random() * CANVAS_WIDTH;
    const startY = -20;
    
    // Target one of the 3 launchpads randomly
    const launchpadPositions = [CANVAS_WIDTH * 0.25, CANVAS_WIDTH * 0.5, CANVAS_WIDTH * 0.75];
    const targetX = launchpadPositions[Math.floor(Math.random() * launchpadPositions.length)];
    const targetY = COASTLINE_Y;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    let speed = 2 + (level * 0.5);
    if (difficulty === 'MEDIUM') speed += 1.5;
    if (difficulty === 'HARD') speed += 3.0;
    
    // Incoming missiles are standard in attack mode
    const isHuge = false;
    if (isHuge) speed *= 0.7; // Huge missiles are slightly slower but more dangerous

    entitiesRef.current.incomingMissiles.push({
      x: startX,
      y: startY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      speed,
      isHuge
    });
  };

  const fireMissile = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent, isSuper: boolean = false) => {
    if (gameState !== 'PLAYING' || (cooldown > 0 && !isSuper)) return;
    if (isSuper && superMissiles <= 0) return;
    if (!isSuper && missilesRemaining <= 0) return;

    // Prevent default to stop zooming/panning on mobile
    if (e.cancelable) e.preventDefault();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = (e as any).clientX;
      clientY = (e as any).clientY;
    }

    const targetX = clientX - rect.left;
    const targetY = clientY - rect.top;

    // Fire from the closest of the 3 launchpads
    const launchpadPositions = [CANVAS_WIDTH * 0.25, CANVAS_WIDTH * 0.5, CANVAS_WIDTH * 0.75];
    const startX = launchpadPositions.reduce((prev, curr) => 
      Math.abs(curr - targetX) < Math.abs(prev - targetX) ? curr : prev
    );
    const startY = COASTLINE_Y;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (isSuper) {
      setSuperMissiles(prev => prev - 1);
      // Super missile auto-targets the tanker
      let tX, tY;
      const tanker = entitiesRef.current.tankers[0];
      if (tanker) {
        tX = tanker.x + tanker.width / 2;
        tY = tanker.y + tanker.height / 2;
      }

      if (tX !== undefined && tY !== undefined) {
        const tDx = tX - startX;
        const tDy = tY - startY;
        const tDist = Math.sqrt(tDx * tDx + tDy * tDy);
        
        entitiesRef.current.missiles.push({
          x: startX,
          y: startY,
          width: 10,
          height: 10,
          color: '#00ffff', // Cyan super missile
          speed: missileSpeed * 2,
          type: 'MISSILE',
          targetX: tX,
          targetY: tY,
          vx: (tDx / tDist) * missileSpeed * 2,
          vy: (tDy / tDist) * missileSpeed * 2,
          isSuper: true
        });
      }
    } else {
      setMissilesRemaining(prev => prev - 1);
      entitiesRef.current.missiles.push({
        x: startX,
        y: startY,
        width: 6,
        height: 6,
        color: '#fc8181', // Red for attack
        speed: missileSpeed,
        type: 'MISSILE',
        targetX,
        targetY,
        vx: (dx / dist) * missileSpeed,
        vy: (dy / dist) * missileSpeed,
      });
      setCooldown(30); // Even faster firing
    }

    createSound('launch');
  };

  const update = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    const { tankers, hostiles, missiles, incomingMissiles, explosions } = entitiesRef.current;

    // Cooldown
    setCooldown(prev => Math.max(0, prev - 2 * cooldownRate));

    // Spawn Hostiles (Defenders in Attack mode)
    const now = Date.now();
    let spawnRate = 6000; // Much slower for Easy
    if (difficulty === 'MEDIUM') spawnRate = 4000; // Slower for Medium
    if (difficulty === 'HARD') spawnRate = 800;

    if (now - lastSpawnRef.current > spawnRate) {
      spawnHostile();
      lastSpawnRef.current = now;
    }

    // Spawn Incoming Missiles (Threat to Launchpad)
    let incomingRate = 10000; // Much slower for Easy
    if (difficulty === 'MEDIUM') incomingRate = 6000; // Slower for Medium
    if (difficulty === 'HARD') incomingRate = 2000;

    if (now - lastIncomingMissileSpawnRef.current > incomingRate) {
      spawnIncomingMissile();
      lastIncomingMissileSpawnRef.current = now;
    }

    // Update Tankers
    for (let i = tankers.length - 1; i >= 0; i--) {
      const t = tankers[i];
      t.x += t.speed;
      
      // Random vertical movement
      if (t.yOffset !== undefined && t.yDirection !== undefined) {
        t.yOffset += t.yDirection * 0.5;
        if (Math.abs(t.yOffset) > 30) {
          t.yDirection *= -1;
        }
        t.y += t.yDirection * 0.5;
      }

      if (t.x > CANVAS_WIDTH) {
        tankers.splice(i, 1);
        setShipsEscaped(prev => {
          const next = prev + 1;
          if (next >= 5) {
            setGameState('GAMEOVER');
          }
          return next;
        });
        spawnTanker();
      }
    }

    // Update Incoming Missiles
    for (let i = incomingMissiles.length - 1; i >= 0; i--) {
      const im = incomingMissiles[i];
      im.x += im.vx;
      im.y += im.vy;

      // Check if hit any of the 3 launchpads
      const launchpadPositions = [CANVAS_WIDTH * 0.25, CANVAS_WIDTH * 0.5, CANVAS_WIDTH * 0.75];
      let hitLaunchpad = false;
      
      for (const lx of launchpadPositions) {
        const distToLaunchpad = Math.sqrt(Math.pow(im.x - lx, 2) + Math.pow(im.y - COASTLINE_Y, 2));
        if (distToLaunchpad < 30) {
          hitLaunchpad = true;
          explosions.push({ x: lx, y: COASTLINE_Y, radius: 100, life: 1 });
          break;
        }
      }

      if (hitLaunchpad) {
        incomingMissiles.splice(i, 1);
        
        // Less damage on Easy/Medium
        const damage = (difficulty === 'EASY' || difficulty === 'MEDIUM') ? 0.5 : 1;
        
        setLaunchpadHealth(prev => {
          const next = prev - damage;
          if (next <= 0) {
            setGameState('GAMEOVER');
          }
          return next;
        });
        createSound('baseHit');
        continue;
      }

      if (im.y > CANVAS_HEIGHT || im.y < -50) {
        incomingMissiles.splice(i, 1);
      }
    }

    // Update Hostiles (Defenders)
    hostiles.forEach((h, hIndex) => {
      const dy = h.targetY - h.y;
      if (Math.abs(dy) > 5) {
        h.y += (dy / Math.abs(dy)) * h.speed;
      }
      h.x += (Math.random() - 0.5) * 2;
    });

    // Update Missiles
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      // Super missile auto-tracking
      if (m.isSuper) {
        const tanker = tankers[0];
        if (tanker) {
          const tX = tanker.x + tanker.width / 2;
          const tY = tanker.y + tanker.height / 2;
          const dx = tX - m.x;
          const dy = tY - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 5) {
            m.vx = (dx / dist) * m.speed;
            m.vy = (dy / dist) * m.speed;
          }
        }
      }

      m.x += m.vx;
      m.y += m.vy;

      let missileRemoved = false;

      // Check collision with incoming missiles (Protection)
      for (let j = incomingMissiles.length - 1; j >= 0; j--) {
        const im = incomingMissiles[j];
        const dx = m.x - im.x;
        const dy = m.y - im.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 40) { // Increased collision radius for easier hits
          missiles.splice(i, 1);
          incomingMissiles.splice(j, 1);
          explosions.push({ x: im.x, y: im.y, radius: 60, life: 1 });
          createSound('intercept');
          setScore(s => s + 1); // Reward for protecting
          missileRemoved = true;
          break;
        }
      }
      if (missileRemoved) continue;

      // Target collision
      for (let j = tankers.length - 1; j >= 0; j--) {
        const t = tankers[j];
        if (
          m.x < t.x + t.width &&
          m.x > t.x &&
          m.y < t.y + t.height &&
          m.y > t.y
        ) {
          missiles.splice(i, 1);
          
          // Handle Iron Dome
          if (t.hasIronDome && t.ironDomeHealth !== undefined && t.ironDomeHealth > 0) {
            // Super missile bypasses dome and destroys it too, then hits the ship
            if (m.isSuper) {
              t.ironDomeHealth = 0;
            } else {
              // Standard missile hits dome
              t.ironDomeHealth -= 1;
              explosions.push({ x: m.x, y: m.y, radius: 40, life: 1 });
              createSound('intercept');
              missileRemoved = true;
              break;
            }
          }

          // Standard missile: 50 damage (2 hits to kill 100 HP tanker)
          // Super missile: 100 damage (1 hit to kill 100 HP tanker)
          let damage = m.isSuper ? 100 : 50;

          setTankerHealth(prev => {
            const newHealth = prev - damage;
            if (newHealth <= 0) {
              setShipsDestroyed(sd => {
                const next = sd + 1;
                if (next >= 15) {
                  setGameState('LEVEL_COMPLETE');
                }
                return next;
              });
              setScore(s => s + 1);
              explosions.push({ x: t.x + t.width/2, y: t.y + t.height/2, radius: 80, life: 1 });
              createSound('tankerHit');
              tankers.splice(j, 1);
              spawnTanker();
              return 100;
            }
            return newHealth;
          });
          explosions.push({ x: m.x, y: m.y, radius: 25, life: 1 });
          createSound('tankerHit');
          missileRemoved = true;
          break;
        }
      }
      if (missileRemoved) continue;

      // Hostiles (Defenders) can intercept player missiles
      for (let j = hostiles.length - 1; j >= 0; j--) {
        const h = hostiles[j];
        const dx = m.x - h.x;
        const dy = m.y - h.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20) {
          missiles.splice(i, 1);
          hostiles.splice(j, 1);
          explosions.push({ x: m.x, y: m.y, radius: 20, life: 1 });
          createSound('explosion');
          missileRemoved = true;
          break;
        }
      }
      if (missileRemoved) continue;

      // Out of bounds
      if (m.x < 0 || m.x > CANVAS_WIDTH || m.y < 0 || m.y > CANVAS_HEIGHT) {
        missiles.splice(i, 1);
      }
    }

    // Update Explosions
    explosions.forEach((e, index) => {
      e.life -= 0.05;
      if (e.life <= 0) explosions.splice(index, 1);
    });

    draw();
    frameRef.current = requestAnimationFrame(update);
  }, [gameState, difficulty, level, missileSpeed, tankerArmor, cooldownRate]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1a202c'; // Dark blue/gray water
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Radar Lines
    ctx.strokeStyle = 'rgba(72, 187, 120, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }

    // Coastline
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, COASTLINE_Y, CANVAS_WIDTH, 20);
    
    // 3 Defensive Domes/Bases
    const launchpadPositions = [CANVAS_WIDTH * 0.25, CANVAS_WIDTH * 0.5, CANVAS_WIDTH * 0.75];
    launchpadPositions.forEach(lx => {
      // Base Structure
      ctx.fillStyle = '#48bb78';
      ctx.fillRect(lx - 25, COASTLINE_Y - 15, 50, 25); 
      
      // Launcher
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(lx - 10, COASTLINE_Y - 5, 20, 10);

      // Dome Visual Effect (Shield)
      ctx.save();
      const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
      const gradient = ctx.createRadialGradient(lx, COASTLINE_Y, 5, lx, COASTLINE_Y, 40);
      gradient.addColorStop(0, 'rgba(0, 255, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(lx, COASTLINE_Y, 40 * pulse, Math.PI, 0);
      ctx.fill();
      
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
    });

    const { tankers, hostiles, missiles, incomingMissiles, explosions } = entitiesRef.current;

    // Draw Incoming Missiles
    incomingMissiles.forEach(im => {
      const size = im.isHuge ? 32 : 12; // Even bigger huge missiles
      ctx.fillStyle = im.isHuge ? '#ff0000' : '#f6e05e'; // Bright red for huge threat
      ctx.beginPath();
      ctx.arc(im.x, im.y, size, 0, Math.PI * 2); 
      ctx.fill();
      
      // Glow effect for visibility
      ctx.shadowBlur = im.isHuge ? 60 : 20;
      ctx.shadowColor = im.isHuge ? '#ff0000' : '#f6e05e';
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Trail
      ctx.strokeStyle = im.isHuge ? 'rgba(255, 0, 0, 0.6)' : 'rgba(246, 224, 94, 0.5)';
      ctx.lineWidth = im.isHuge ? 12 : 4;
      ctx.beginPath();
      ctx.moveTo(im.x, im.y);
      ctx.lineTo(im.x - im.vx * 8, im.y - im.vy * 8);
      ctx.stroke();
    });

      // Draw Tankers
      tankers.forEach(t => {
        // Iron Dome Visual
        if (t.hasIronDome && t.ironDomeHealth !== undefined && t.ironDomeHealth > 0) {
          ctx.save();
          const pulse = Math.sin(Date.now() / 150) * 0.2 + 0.8;
          ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -Date.now() / 20;
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 1.0 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 255, ${pulse * 0.15})`;
          ctx.fill();
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.9 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 255, ${pulse * 0.1})`;
          ctx.fill();
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.8 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 255, 255, ${pulse * 0.02})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.7 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.6 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.4 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.3 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.2 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.1 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, t.width * 0.05 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(t.x + t.width / 2, t.y + t.height / 2, 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.shadowBlur = 30 * pulse;
          ctx.shadowColor = '#00ffff';
          ctx.stroke();
          
          ctx.shadowBlur = 10 * (1 - pulse);
          ctx.shadowColor = '#ffffff';
          ctx.stroke();
          ctx.restore();

          // Iron Dome Health Bar
          const domeBarWidth = 80;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(t.x + t.width / 2 - domeBarWidth / 2, t.y - 40, domeBarWidth, 6);
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(t.x + t.width / 2 - domeBarWidth / 2, t.y - 40, (t.ironDomeHealth / 5) * domeBarWidth, 6);

          // Shield Label
          const textPulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(0, 255, 255, ${textPulse})`;
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SHIELD ACTIVE', t.x + t.width / 2, t.y - 50);
          ctx.textAlign = 'left'; // Reset
        }

        // Main Hull
      ctx.fillStyle = t.color;
      ctx.fillRect(t.x, t.y, t.width, t.height);
      
      // Bridge/Superstructure
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(t.x + t.width - 35, t.y - 15, 25, 15);
      
      // Windows on bridge
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(t.x + t.width - 30, t.y - 10, 5, 3);
      ctx.fillRect(t.x + t.width - 20, t.y - 10, 5, 3);

      // Oil Sign (Drop Icon)
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(t.x + 30, t.y + 22, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(t.x + 23, t.y + 22);
      ctx.lineTo(t.x + 30, t.y + 8);
      ctx.lineTo(t.x + 37, t.y + 22);
      ctx.fill();
      
      // "OIL" Label
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('OIL', t.x + 22, t.y + 25);

      // Hull details
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y + 10);
      ctx.lineTo(t.x + t.width, t.y + 10);
      ctx.stroke();

      // Health bar above tanker
      if (t.health !== undefined && t.maxHealth !== undefined) {
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(t.x, t.y - 25, t.width, 4);
        ctx.fillStyle = '#e53e3e';
        ctx.fillRect(t.x, t.y - 25, t.width * (t.health / t.maxHealth), 4);
      }
    });

    // Draw Hostiles
    hostiles.forEach(h => {
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x + h.width, h.y + h.height / 2);
      ctx.lineTo(h.x, h.y + h.height);
      ctx.closePath();
      ctx.fill();
      
      // Glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = h.color;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Missiles
    missiles.forEach(m => {
      // Glow/Particle effect for missile
      ctx.shadowBlur = 15;
      ctx.shadowColor = m.color;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.width, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Better Trail
      const gradient = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 5, m.y - m.vy * 5);
      gradient.addColorStop(0, m.color);
      gradient.addColorStop(1, 'transparent');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 5, m.y - m.vy * 5);
      ctx.stroke();
    });

    // Draw Explosions
    explosions.forEach(e => {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (1 - e.life), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(237, 137, 54, ${e.life})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(237, 137, 54, ${e.life * 0.5})`;
      ctx.fill();
    });

    // Mini-map
    drawMiniMap(ctx);
  };

  const drawMiniMap = (ctx: CanvasRenderingContext2D) => {
    const mapW = 150;
    const mapH = 90;
    const mapX = CANVAS_WIDTH - mapW - 10;
    const mapY = 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.strokeStyle = '#48bb78';
    ctx.lineWidth = 1;
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    const scaleX = mapW / CANVAS_WIDTH;
    const scaleY = mapH / CANVAS_HEIGHT;

    const { tankers, hostiles } = entitiesRef.current;

    ctx.fillStyle = '#48bb78';
    tankers.forEach(t => {
      ctx.fillRect(mapX + t.x * scaleX, mapY + t.y * scaleY, 4, 2);
    });

    ctx.fillStyle = '#e53e3e';
    hostiles.forEach(h => {
      ctx.fillRect(mapX + h.x * scaleX, mapY + h.y * scaleY, 2, 2);
    });
  };

  useEffect(() => {
    const checkDevice = () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setShowMobilePrompt(true);
      } else {
        setShowMobilePrompt(false);
      }
    };
    window.addEventListener('resize', checkDevice);
    checkDevice();
    
    // Attempt to start music on mount (may be blocked by browser)
    startBattleMusic();
    
    // Start music on first interaction (Landing Page)
    const startMusic = () => {
      startBattleMusic();
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
      window.removeEventListener('touchstart', startMusic);
    };
    window.addEventListener('click', startMusic);
    window.addEventListener('keydown', startMusic);
    window.addEventListener('touchstart', startMusic);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
      window.removeEventListener('touchstart', startMusic);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      frameRef.current = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState, update]);

  // --- Shop Logic ---

  const buyUpgrade = (type: 'SPEED' | 'COOLDOWN' | 'SUPER' | 'MISSILES') => {
    const cost = type === 'SUPER' ? 10 : 5;
    if (score < cost) return;

    if (type === 'SUPER' && superMissilesPurchasedThisLevel >= 1) {
      return; // Limit reached
    }

    setScore(prev => prev - cost);
    if (type === 'SPEED') setMissileSpeed(prev => prev + 5);
    if (type === 'COOLDOWN') setCooldownRate(prev => prev + 1.0);
    if (type === 'SUPER') {
      setSuperMissiles(prev => prev + 1);
      setSuperMissilesPurchasedThisLevel(prev => prev + 1);
    }
    if (type === 'MISSILES') {
      setMissilesRemaining(prev => prev + 10);
    }
  };

  return (
    <div 
      className="h-screen w-screen md:h-screen md:w-screen bg-[#0a0a0a] text-white font-sans flex flex-col items-center p-0 md:p-2 overflow-hidden relative touch-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Mobile Prompt */}
      <AnimatePresence>
        {showMobilePrompt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center p-10 text-center"
          >
            <AlertTriangle className="w-20 h-20 text-yellow-500 mb-6" />
            <h2 className="text-3xl font-black text-white mb-4 uppercase italic">Mobile Device Detected</h2>
            <p className="text-gray-400 font-mono text-sm uppercase tracking-widest mb-8">This tactical simulation is optimized for desktop environments.</p>
            <div className="bg-red-600/20 border-2 border-red-600 p-6 skew-x-[-10deg]">
              <p className="text-red-500 font-black text-xl uppercase italic tracking-tighter">Please active browser mode to play</p>
            </div>
            <button 
              onClick={() => setShowMobilePrompt(false)}
              className="mt-8 px-8 py-3 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Intro Overlay */}
      <AnimatePresence>
        {gameState === 'INTRO' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#050505] flex flex-col items-center justify-center overflow-hidden"
          >
            {/* PUBG-style Map Animation */}
            <motion.div 
              initial={{ scale: 4, opacity: 0, y: -200 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 4, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 pointer-events-none flex items-center justify-center"
            >
              <svg viewBox="0 0 1000 600" className="w-full h-full opacity-40">
                <defs>
                  <radialGradient id="mapGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1a365d" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#000" stopOpacity="1" />
                  </radialGradient>
                </defs>
                <rect width="1000" height="600" fill="url(#mapGrad)" />
                
                {/* Detailed Coastlines */}
                <path d="M0,100 L150,120 Q300,150 450,80 T700,120 T1000,60 L1000,0 L0,0 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <path d="M0,500 L200,480 Q400,450 550,520 T800,480 T1000,540 L1000,600 L0,600 Z" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
                
                {/* Grid Lines */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="600" stroke="rgba(72, 187, 120, 0.1)" strokeWidth="1" />
                ))}
                {Array.from({ length: 12 }).map((_, i) => (
                  <line key={`h-${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} stroke="rgba(72, 187, 120, 0.1)" strokeWidth="1" />
                ))}

                {/* Tactical Markers */}
                <motion.circle cx="520" cy="350" r="10" fill="red" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} />
                <text x="540" y="355" fill="red" fontSize="12" fontFamily="monospace">TARGET ZONE</text>
              </svg>
            </motion.div>

            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 2, duration: 1 }}
              className="relative z-10 text-center"
            >
              <div className="mb-4 inline-block px-4 py-1 border-l-4 border-red-600 bg-red-950/20 text-red-500 text-[12px] font-mono tracking-[0.3em] uppercase">
                Operation: Silent Strike
              </div>
              <h1 className="text-6xl font-black tracking-tighter text-white mb-2 italic">
                STRAIT OF <span className="text-red-600">HORMUZ</span>
              </h1>
              <p className="text-gray-500 font-mono tracking-[0.5em] uppercase text-xs mb-16">
                Tactical Simulation by Aniruddha Hossen
              </p>
              
              <div className="flex flex-col items-center gap-6">
                <motion.button 
                  whileHover={{ scale: 1.1, letterSpacing: "0.4em" }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (!audioCtx || audioCtx.state === 'suspended') {
                      startBattleMusic();
                    }
                    setGameState('CINEMATIC_INTRO');
                  }}
                  className="px-20 py-5 bg-red-600 text-white font-black tracking-[0.2em] uppercase hover:bg-red-500 transition-all skew-x-[-12deg] shadow-[10px_10px_0_rgba(0,0,0,1)]"
                >
                  Initialize & Enter
                </motion.button>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-4 text-[10px] font-mono text-gray-600 uppercase">
                    <span>Level: {level}</span>
                    <span>|</span>
                    <span>Credits: {score}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'CINEMATIC_INTRO' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[195] bg-[#050505] flex flex-col items-center justify-center overflow-hidden font-mono"
          >
            {/* Tactical Map Background */}
            <motion.div 
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 8, ease: "easeOut" }}
              className="absolute inset-0 pointer-events-none"
            >
              {/* Dark Satellite Base */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-30 grayscale contrast-125" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
              
              <svg viewBox="0 0 1000 600" className="w-full h-full">
                <defs>
                  <filter id="glow-cinematic">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                
                {/* Grid Lines */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="600" stroke="rgba(16, 185, 129, 0.08)" strokeWidth="0.5" />
                ))}
                {Array.from({ length: 12 }).map((_, i) => (
                  <line key={`h-${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} stroke="rgba(16, 185, 129, 0.08)" strokeWidth="0.5" />
                ))}

                {/* Coastlines (Stylized) */}
                <path d="M50,150 Q250,100 450,200 T850,150" fill="none" stroke="#1e293b" strokeWidth="3" opacity="0.4" />
                <path d="M50,450 Q250,500 450,400 T850,450" fill="none" stroke="#1e293b" strokeWidth="3" opacity="0.4" />

                {/* Pipelines (Green Dashed) */}
                <motion.path 
                  d="M100,520 L300,420 L500,480 L700,380" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="1.5" 
                  strokeDasharray="8,4"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  opacity="0.8"
                />
                <motion.path 
                  d="M80,480 L280,380 L480,410 L680,310" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="1" 
                  strokeDasharray="4,4"
                  animate={{ strokeDashoffset: [0, -16] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  opacity="0.6"
                />

                {/* Tanker Routes (Orange Dashed) */}
                <motion.path 
                  d="M250,180 L450,280 L650,230 L850,330" 
                  fill="none" 
                  stroke="#f59e0b" 
                  strokeWidth="2" 
                  strokeDasharray="12,6"
                  animate={{ strokeDashoffset: [0, 36] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
                  opacity="0.7"
                />

                {/* Strait of Hormuz Label */}
                <text x="700" y="340" fill="#fff" fontSize="10" fontWeight="black" letterSpacing="2" opacity="0.8">— STRAIT OF HORMUZ —</text>
                <text x="710" y="355" fill="#64748b" fontSize="7" opacity="0.6">21 NM NAVIGABLE WIDTH</text>

                {/* Tactical Markers (Dots & Icons) */}
                {[
                  { x: 520, y: 350, label: "TARGET ZONE", color: "#ef4444", type: "TARGET" },
                  { x: 420, y: 250, label: "US BASE", color: "#3b82f6", type: "BASE" },
                  { x: 620, y: 150, label: "IRAN BASE", color: "#ef4444", type: "BASE" },
                  { x: 480, y: 420, label: "NUCLEAR FACILITY", color: "#f59e0b", type: "NUKE" },
                  { x: 350, y: 380, label: "PIPELINE TERMINAL", color: "#10b981", type: "TERMINAL" },
                  { x: 280, y: 220, label: "KUWAIT CITY", color: "#94a3b8", type: "CITY" },
                  { x: 650, y: 420, label: "DUBAI", color: "#94a3b8", type: "CITY" },
                ].map((marker, i) => (
                  <g key={i}>
                    <motion.circle 
                      cx={marker.x} cy={marker.y} r="3" fill={marker.color} filter="url(#glow-cinematic)"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 1.5 + i * 0.2 }}
                    />
                    <motion.circle 
                      cx={marker.x} cy={marker.y} r="10" stroke={marker.color} fill="none" strokeWidth="0.5"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 2], opacity: [0.4, 0] }}
                      transition={{ repeat: Infinity, duration: 2.5, delay: i * 0.4 }}
                    />
                    <motion.text 
                      x={marker.x + 8} y={marker.y + 3} fill={marker.color} fontSize="7" fontWeight="bold"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.8 }}
                      transition={{ delay: 2 + i * 0.2 }}
                    >
                      {marker.label}
                    </motion.text>
                  </g>
                ))}

                {/* Scanning Radar Line */}
                <motion.line 
                  x1="0" y1="0" x2="1000" y2="0" 
                  stroke="rgba(16, 185, 129, 0.15)" 
                  strokeWidth="1"
                  animate={{ y1: [0, 600], y2: [0, 600] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
                />
              </svg>
            </motion.div>

            {/* UI Overlays (OSINT Style) */}
            
            {/* Top Left: Zoom Controls */}
            <div className="absolute top-8 left-8 flex flex-col gap-1">
              <div className="w-8 h-8 bg-black/40 border border-white/20 flex items-center justify-center text-white text-lg font-bold cursor-default hover:bg-white/10">+</div>
              <div className="w-8 h-8 bg-black/40 border border-white/20 flex items-center justify-center text-white text-lg font-bold cursor-default hover:bg-white/10">-</div>
            </div>

            {/* Top Right: Data Layers */}
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1 }}
              className="absolute top-8 right-8 w-48 bg-black/60 border border-white/10 p-3 backdrop-blur-sm"
            >
              <p className="text-[8px] text-gray-500 mb-2 tracking-widest uppercase">Data Layers</p>
              <div className="space-y-2">
                {[
                  { label: "Military Bases", color: "text-blue-400" },
                  { label: "Nuclear Sites", color: "text-yellow-400" },
                  { label: "Fires (FIRMS)", color: "text-orange-500" },
                ].map((layer, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <motion.div 
                      initial={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                      animate={{ backgroundColor: "rgba(16,185,129,0.4)" }}
                      transition={{ delay: 2 + i * 0.5 }}
                      className="w-3 h-3 border border-white/20 flex items-center justify-center"
                    >
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 2.2 + i * 0.5 }}
                        className="w-1.5 h-1.5 bg-white" 
                      />
                    </motion.div>
                    <span className={`text-[8px] uppercase tracking-tighter ${layer.color}`}>{layer.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Bottom Left: Map Legend */}
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="absolute bottom-8 left-8 w-56 bg-black/60 border border-white/10 p-4 backdrop-blur-sm"
            >
              <p className="text-[8px] text-gray-500 mb-3 tracking-widest uppercase">Map Legend</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-0.5 border-t border-dashed border-orange-500" />
                  <span className="text-[7px] text-gray-400 uppercase">Tanker Route</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-0.5 border-t border-dashed border-emerald-500" />
                  <span className="text-[7px] text-gray-400 uppercase">Pipeline Bypass</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[7px] text-gray-400 uppercase">US Base</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[7px] text-gray-400 uppercase">Iran Base</span>
                </div>
              </div>
            </motion.div>

            {/* Center Content */}
            <div className="relative z-10 text-center max-w-4xl">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3 }}
                className="mb-6"
              >
                <div className="inline-flex items-center gap-3 px-4 py-1 bg-red-600/10 border border-red-600/30 text-red-500 text-[10px] tracking-[0.4em] uppercase mb-4">
                  <AlertTriangle className="w-3 h-3 animate-pulse" />
                  Threat Level: Critical
                </div>
                <h1 className="text-7xl font-black tracking-tighter text-white mb-2 italic uppercase">
                  Operation <span className="text-red-600">Hormuz</span>
                </h1>
                <p className="text-gray-500 tracking-[0.6em] uppercase text-[10px]">Strategic Defense Simulation</p>
              </motion.div>
              
              <div className="flex flex-col items-center gap-8">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 4 }}
                  className="flex gap-12"
                >
                  <div className="text-center">
                    <p className="text-[8px] text-gray-600 uppercase mb-1">Satellite</p>
                    <p className="text-xs text-white font-bold">SENTINEL-2B</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] text-gray-600 uppercase mb-1">Coordinates</p>
                    <p className="text-xs text-white font-bold">26.59°N 56.24°E</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] text-gray-600 uppercase mb-1">Status</p>
                    <p className="text-xs text-emerald-500 font-bold animate-pulse">LIVE FEED</p>
                  </div>
                </motion.div>

                <motion.button 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 5 }}
                  whileHover={{ scale: 1.05, backgroundColor: "rgba(239, 68, 68, 1)" }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setGameState('STORY_CINEMATIC')}
                  className="group relative px-16 py-5 bg-red-600 text-white font-black tracking-[0.3em] uppercase transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                  Proceed to Briefing
                </motion.button>
              </div>
            </div>

            {/* Scanning Lines Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
          </motion.div>
        )}

        {gameState === 'DIFFICULTY_SELECT' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] bg-[#050505] flex flex-col items-center justify-center p-10"
          >
            <div className="mb-12 text-center">
              <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">SELECT INTENSITY</h2>
              <div className="h-1 w-32 bg-red-600 mx-auto" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
              {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((diff) => (
                <motion.button
                  key={diff}
                  whileHover={{ scale: 1.05, y: -10 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setDifficulty(diff);
                    setGameState('START');
                  }}
                  className={`group relative h-80 border-2 flex flex-col items-center justify-center p-8 transition-all overflow-hidden ${
                    diff === 'EASY' ? 'border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500' :
                    diff === 'MEDIUM' ? 'border-yellow-500/20 bg-yellow-950/10 hover:border-yellow-500' :
                    'border-red-500/20 bg-red-950/10 hover:border-red-500'
                  }`}
                >
                  <div className={`absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                    diff === 'EASY' ? 'bg-emerald-500' : diff === 'MEDIUM' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <Zap className={`w-16 h-16 mb-6 ${
                    diff === 'EASY' ? 'text-emerald-500' :
                    diff === 'MEDIUM' ? 'text-yellow-500' :
                    'text-red-500'
                  }`} />
                  <h3 className="text-2xl font-black text-white mb-4 italic">{diff}</h3>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest text-center leading-relaxed">
                    {diff === 'EASY' ? 'Standard Patrol. Low threat level.' : 
                     diff === 'MEDIUM' ? 'Active Conflict. Moderate resistance.' : 
                     'Total War. Maximum hostile presence.'}
                  </p>
                </motion.button>
              ))}
            </div>
            
            <button 
              onClick={() => setGameState('INTRO')}
              className="mt-16 text-gray-500 hover:text-white font-mono uppercase tracking-[0.3em] text-sm flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Return to Menu
            </button>
          </motion.div>
        )}

        {gameState === 'STORY_CINEMATIC' && (
          <StoryCinematic 
            onComplete={() => setGameState('DIFFICULTY_SELECT')} 
            difficulty={difficulty}
          />
        )}

        {gameState === 'MISSION_ACCOMPLISHED' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-10 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border-4 border-emerald-500 p-20 bg-emerald-950/10 relative"
            >
              <Trophy className="w-32 h-32 text-emerald-500 mx-auto mb-8" />
              <h2 className="text-5xl font-black text-white mb-4 italic tracking-tighter">MISSION ACCOMPLISHED</h2>
              <p className="text-emerald-400 font-mono text-xl mb-12 tracking-[0.3em] uppercase">All 5 Sectors Cleared on {difficulty} Mode</p>
              <button 
                onClick={() => {
                  setGameState('INTRO');
                }}
                className="px-16 py-5 bg-emerald-500 text-black font-black hover:bg-emerald-400 transition-all uppercase tracking-[0.4em] text-xl"
              >
                Return to Command
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Center UI Header */}
      <div className="w-full max-w-[1000px] flex flex-wrap md:flex-nowrap justify-between items-end mb-2 border-b border-emerald-500/30 pb-1 shrink-0 gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
          <button 
            onClick={() => {
              resetGameData();
              setGameState('INTRO');
            }}
            className="flex items-center gap-1 md:gap-2 px-2 py-1 md:px-3 md:py-2 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors group"
            title="Return to Home"
          >
            <Home className="w-3 h-3 md:w-4 md:h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[8px] md:text-[10px] font-mono font-bold tracking-widest uppercase">Home</span>
          </button>
          <div className="shrink-0">
            <h1 className="text-lg md:text-2xl font-bold tracking-widest text-red-500 uppercase italic leading-none">Strait of Hormuz</h1>
            <p className="text-[8px] md:text-[10px] font-mono text-red-900 uppercase tracking-tighter">
              Strike Protocol Active | {difficulty} | Sector {level}/5
            </p>
          </div>
        </div>
        <div className="flex flex-wrap md:flex-nowrap gap-2 md:gap-4 items-center justify-end w-full md:w-auto">
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Level</p>
            <p className="text-xs md:text-base font-bold text-white font-mono">{level}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Missiles</p>
            <p className={`text-xs md:text-base font-bold font-mono ${missilesRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{missilesRemaining}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Targets</p>
            <p className="text-xs md:text-base font-bold text-red-500 font-mono">{shipsDestroyed}/15</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Escaped</p>
            <p className="text-xs md:text-base font-bold text-yellow-500 font-mono">{shipsEscaped}/5</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Credits</p>
            <p className="text-xs md:text-base font-bold text-emerald-500 font-mono">{score}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Base</p>
            <p className={`text-xs md:text-base font-bold font-mono ${launchpadHealth <= 1 ? 'text-red-600 animate-pulse' : 'text-blue-500'}`}>
              {launchpadHealth}/5
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[7px] md:text-[8px] font-mono text-gray-500 uppercase">Target Hull</p>
            <div className="w-16 md:w-24 h-2 md:h-3 bg-gray-900 border border-gray-800 overflow-hidden">
              <motion.div 
                className="h-full bg-red-600"
                initial={{ width: '100%' }}
                animate={{ width: `${tankerHealth}%` }}
                transition={{ type: 'spring', bounce: 0 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Game Canvas Container */}
      <div 
        className="relative border-2 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)] flex-1 min-h-0 flex items-center justify-center w-full max-w-[1000px] touch-none"
        onClick={(e) => fireMissile(e as any)}
        onTouchStart={(e) => fireMissile(e as any)}
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="cursor-crosshair block max-w-full max-h-full object-contain bg-[#0a192f] touch-none"
          style={{ touchAction: 'none' }}
        />

        {/* Super Missile Button */}
        {superMissiles > 0 && gameState === 'PLAYING' && (
          <motion.button
            initial={{ scale: 0, x: '-50%' }}
            animate={{ scale: 1, x: '-50%' }}
            onClick={(e) => {
              e.stopPropagation();
              fireMissile({ clientX: 0, clientY: 0 } as any, true);
            }}
            className="absolute top-4 left-1/2 bg-cyan-600 text-white px-4 py-2 md:px-6 md:py-2 rounded-full font-black tracking-widest uppercase border-b-4 border-cyan-800 hover:bg-cyan-500 active:border-b-0 z-10 text-[10px] md:text-sm"
          >
            Launch Super Missile ({superMissiles})
          </motion.button>
        )}

        {/* Missile Cooldown Overlay */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
          <div className="w-40 h-1 bg-gray-900 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-red-500"
              animate={{ width: `${100 - cooldown}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <p className="text-[8px] font-mono text-red-900 mt-1 uppercase tracking-widest">
            {cooldown > 0 ? 'Reloading...' : 'Weapon System Ready'}
          </p>
        </div>

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-50"
            >
              <div className="text-center p-8 border-2 border-red-600/30 bg-red-950/10 rounded-none skew-x-[-2deg] max-w-2xl">
                <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-4" />
                <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase italic">
                  MISSION BRIEFING: LEVEL {level}
                </h2>
                <p className="text-gray-400 font-mono text-xs mb-6 max-w-lg mx-auto">
                  The Strait is heavily guarded. Your objective is to neutralize 15 tankers. If 5 tankers escape, the mission is aborted.
                  <span className="block mt-2 text-yellow-500 font-bold uppercase">
                    WARNING: DEFEND THE 3 DEFENSIVE DOMES FROM INCOMING MISSILES.
                  </span>
                </p>
                
                <div className="mb-6 text-left bg-black/60 p-4 border border-red-600/20 font-mono">
                  <p className="text-[10px] text-red-500 uppercase mb-2 font-bold tracking-widest">Tactical Legend:</p>
                  <div className="grid grid-cols-2 gap-4 mb-4 border-b border-red-600/10 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#fc8181] shadow-[0_0_5px_#fc8181]" />
                      <span className="text-[9px] text-gray-300 uppercase"><b className="text-white">Missile:</b> Your Weapon</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-2 bg-[#48bb78] border border-cyan-400" />
                      <span className="text-[9px] text-gray-300 uppercase"><b className="text-white">Dome:</b> Protect All 3</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#f6e05e] shadow-[0_0_5px_#f6e05e]" />
                      <span className="text-[9px] text-gray-300 uppercase"><b className="text-white">Bomb:</b> Incoming Threat</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-[#48bb78]" />
                      <span className="text-[9px] text-gray-300 uppercase"><b className="text-white">Shield:</b> Enemy Interceptor</span>
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-red-500 uppercase mb-2 font-bold tracking-widest">Operational Intel:</p>
                  <ul className="text-[10px] text-gray-400 space-y-1">
                    <li>• <span className="text-white">PRIMARY:</span> Destroy 15 Tankers to advance.</li>
                    <li>• <span className="text-white">THREAT:</span> 5 Escapes = Mission Failure.</li>
                    <li>• <span className="text-white">TACTICAL:</span> Standard missiles take 2 hits. Super Missiles take 1 hit.</li>
                    <li>• <span className="text-white">REWARD:</span> 1 Point per confirmed kill.</li>
                  </ul>
                </div>

                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-[0.3em] animate-pulse text-center">
                    Use mouse to launch missile
                  </p>
                  <button 
                    onClick={() => startGame(difficulty)}
                    className="px-12 py-4 bg-red-600 text-white font-black hover:bg-red-500 transition-all uppercase tracking-[0.3em] text-lg shadow-[5px_5px_0_rgba(0,0,0,1)]"
                  >
                    Engage Targets
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'LEVEL_COMPLETE' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center z-50"
            >
              <div className="text-center p-12 border-2 border-emerald-500/30 bg-emerald-950/20">
                <Trophy className="w-24 h-24 text-emerald-400 mx-auto mb-6" />
                <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">
                  LEVEL {level} SECURED
                </h2>
                <p className="text-emerald-400 font-mono text-lg mb-10 uppercase tracking-widest">
                  15 Targets Neutralized. Credits Earned: 15
                </p>
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={nextLevel}
                    className="px-12 py-4 bg-emerald-500 text-black font-black hover:bg-emerald-400 transition-all uppercase tracking-[0.3em] text-lg"
                  >
                    Next Sector
                  </button>
                  <button 
                    onClick={() => {
                      setGameState('INTRO');
                    }}
                    className="px-12 py-4 bg-gray-800 text-white font-black hover:bg-gray-700 transition-all uppercase tracking-[0.3em] text-lg"
                  >
                    Home
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center z-50"
            >
              <div className="text-center p-12 border-4 border-red-600 bg-black/80">
                <AlertTriangle className="w-24 h-24 text-red-600 mx-auto mb-6" />
                <h2 className="text-5xl font-black text-white mb-4 tracking-tighter uppercase italic">
                  MISSION FAILED
                </h2>
                <div className="space-y-2 mb-10 font-mono">
                  <p className="text-red-500 text-lg uppercase">Critical Failure: Sector Compromised.</p>
                  <p className="text-gray-500 uppercase text-xs">Level {level} | Kills: {shipsDestroyed}</p>
                  {shipsEscaped >= 5 && <p className="text-red-400 animate-pulse">5 SHIPS LEFT THE SECTOR</p>}
                  {launchpadHealth <= 0 && <p className="text-red-400 animate-pulse">DEFENSIVE DOMES DESTROYED</p>}
                </div>
                
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={() => startGame(difficulty)}
                    className="px-10 py-4 bg-white text-black font-black hover:bg-gray-200 transition-all uppercase tracking-widest text-lg flex items-center gap-2"
                  >
                    <RotateCcw className="w-6 h-6" /> Retry Level {level}
                  </button>
                  <button 
                    onClick={() => { setGameState('INTRO'); }}
                    className="px-10 py-4 border-2 border-white text-white font-black hover:bg-white/10 transition-all uppercase tracking-widest text-lg"
                  >
                    Home
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls & Shop */}
      <div className="relative w-full max-w-[1000px] mt-auto md:mt-4 flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 px-4 md:px-0 py-2 md:py-0 bg-black/60 md:bg-transparent backdrop-blur-md md:backdrop-blur-none z-50 border-t border-emerald-500/30 md:border-none shrink-0 min-h-[50px] md:min-h-0">
        <div className="flex gap-2 w-full md:w-auto justify-center md:justify-start">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowShop(true);
            }}
            className="flex items-center gap-2 px-6 py-2 md:px-4 md:py-2 bg-emerald-600 md:bg-emerald-500/10 border md:border border-emerald-400 md:border-emerald-500/30 text-white md:text-emerald-400 hover:bg-emerald-500/20 transition-all font-mono text-xs uppercase shadow-[0_0_15px_rgba(16,185,129,0.3)] rounded-sm font-bold"
          >
            <ShoppingCart className="w-4 h-4" /> Upgrade Systems
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-800 text-gray-400 font-mono text-[9px] uppercase">
            Difficulty: <span className="text-emerald-500 font-bold">{difficulty}</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-emerald-600 uppercase tracking-widest hidden md:block">
          Secure Communication Line: Active
        </div>
      </div>

      {/* Shop Modal */}
      <AnimatePresence>
        {showShop && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-[#0d1117] border border-emerald-500/30 p-4 md:p-6 rounded-xl relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowShop(false)}
                className="absolute top-4 right-4 text-emerald-500 hover:text-emerald-400"
              >
                <X className="w-6 h-6" />
              </button>

              <h3 className="text-2xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
                <Zap className="w-6 h-6" /> ARMORY UPGRADES
              </h3>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/10 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-bold text-emerald-400">Missile Velocity</p>
                    <p className="text-xs text-emerald-700 font-mono">Current: {missileSpeed} Mach</p>
                  </div>
                  <button 
                    disabled={score < 5}
                    onClick={() => buyUpgrade('SPEED')}
                    className="px-4 py-2 bg-emerald-500 text-black font-bold text-xs rounded hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    5 PTS
                  </button>
                </div>

                <div className="p-4 bg-cyan-950/20 border border-cyan-500/10 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-bold text-cyan-400">Super Missile</p>
                    <p className="text-xs text-cyan-700 font-mono">Auto-target | 1-Hit Kill</p>
                    <p className="text-[10px] text-cyan-900 font-mono uppercase">Limit: {superMissilesPurchasedThisLevel}/2 per Sector</p>
                  </div>
                  <button 
                    disabled={score < 10 || superMissilesPurchasedThisLevel >= 2}
                    onClick={() => buyUpgrade('SUPER')}
                    className="px-4 py-2 bg-cyan-500 text-black font-bold text-xs rounded hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {superMissilesPurchasedThisLevel >= 2 ? 'MAX' : '10 PTS'}
                  </button>
                </div>

                <div className="p-4 bg-emerald-950/20 border border-emerald-500/10 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-bold text-emerald-400">Rapid Reload</p>
                    <p className="text-xs text-emerald-700 font-mono">Rate: {cooldownRate.toFixed(1)}x</p>
                  </div>
                  <button 
                    disabled={score < 5}
                    onClick={() => buyUpgrade('COOLDOWN')}
                    className="px-4 py-2 bg-emerald-500 text-black font-bold text-xs rounded hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    5 PTS
                  </button>
                </div>

                {difficulty === 'HARD' && (
                  <div className="p-4 bg-red-950/20 border border-red-500/10 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-bold text-red-400">Extra Missiles</p>
                      <p className="text-xs text-red-700 font-mono">+10 Tactical Missiles</p>
                    </div>
                    <button 
                      disabled={score < 5}
                      onClick={() => buyUpgrade('MISSILES')}
                      className="px-4 py-2 bg-red-500 text-black font-bold text-xs rounded hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      5 PTS
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-emerald-500/20 flex justify-between items-center">
                <p className="text-emerald-600 font-mono text-xs uppercase">Available Credits</p>
                <p className="text-2xl font-bold text-emerald-400 font-mono">{score}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Accents */}
      <div className="fixed top-0 left-0 w-full h-1 bg-emerald-500/20" />
      <div className="fixed bottom-0 left-0 w-full h-1 bg-emerald-500/20" />
      <div className="fixed top-0 left-0 w-1 h-full bg-emerald-500/20" />
      <div className="fixed top-0 right-0 w-1 h-full bg-emerald-500/20" />
    </div>
  );
}
