///<reference path="tms5220.ts"/>
import {State} from '../interfaces/state';
import {DiskDrive, DiskImage} from './disk';
import {TMS9919} from './tms9919';
import {CRU} from './cru';
import {Tape} from './tape';
import {Keyboard} from './keyboard';
import {TMS5220} from './tms5220';
import {Memory} from './memory';
import {TMS9900} from './tms9900';
import {Log} from '../../classes/log';
import {F18A} from './f18a';
import {GoogleDrive} from './googledrive';
import {VDP} from '../interfaces/vdp';
import {CPU} from '../interfaces/cpu';
import {TMS9918A} from './tms9918a';
import {F18AGPU} from './f18agpu';
import {System} from './system';
import {Software} from '../../classes/software';
import {Settings} from '../../classes/settings';
import {PSG} from '../interfaces/psg';
import {Speech} from '../interfaces/speech';

export class TI994A implements State {

    static FRAMES_TO_RUN = Number.MAX_VALUE;
    static FRAME_MS = 17;
    static FPS_MS = 4000;

    private canvas: HTMLCanvasElement;
    private document: HTMLDocument;
    private settings: Settings;
    private onBreakpoint: (cpu: CPU) => void;

    private memory: Memory;
    private cpu: CPU;
    private vdp: VDP;
    private psg: PSG;
    private speech: Speech;
    private cru: CRU;
    private keyboard: Keyboard;
    private tape: Tape;
    private diskDrives: DiskDrive[];
    private googleDrives: GoogleDrive[];

    private cpuSpeed: number;
    private frameCount: number;
    private lastFpsTime: number;
    private fpsFrameCount: number;
    private running: boolean;
    private cpuFlag: boolean;

    private log: Log;
    private frameInterval: number;
    private fpsInterval: number;

    constructor(document: HTMLDocument, canvas: HTMLCanvasElement, diskImages: {[key: string]: DiskImage}, settings: Settings, onBreakpoint: () => void) {
        this.document = document;
        this.canvas = canvas;
        this.settings = settings;
        this.onBreakpoint = onBreakpoint;

        this.assemble(diskImages);

        this.cpuSpeed = 1;
        this.frameCount = 0;
        this.lastFpsTime = null;
        this.fpsFrameCount = 0;
        this.running = false;
        this.cpuFlag = true;
        this.log = Log.getLog();

        this.reset(false);
    }

    assemble(diskImages: {[key: string]: DiskImage}) {
        this.memory = new Memory(this, this.settings);
        this.cpu = new TMS9900(this);
        this.setVDP();
        this.psg = new TMS9919();
        this.speech = new TMS5220(this, this.settings);
        this.cru = new CRU(this);
        this.keyboard = new Keyboard(this.document, this.settings);
        this.tape = new Tape();
        this.diskDrives = [
            new DiskDrive("DSK1", diskImages.FLOPPY1, this),
            new DiskDrive("DSK2", diskImages.FLOPPY2, this),
            new DiskDrive("DSK3", diskImages.FLOPPY3, this)
        ];
        this.setGoogleDrive();
        this.speech.setCPU(this.cpu);
    }

    setVDP() {
        if (this.settings.isF18AEnabled()) {
            this.vdp = new F18A(this.canvas, this, this.settings);
        } else {
            this.vdp = new TMS9918A(this.canvas, this, this.settings);
        }
    }

    setGoogleDrive() {
        if (this.settings.isGoogleDriveEnabled()) {
            this.googleDrives = [
                new GoogleDrive("GDR1", "Js99erDrives/GDR1", this),
                new GoogleDrive("GDR2", "Js99erDrives/GDR2", this),
                new GoogleDrive("GDR3", "Js99erDrives/GDR3", this)
            ];
        } else {
            this.googleDrives = [];
        }
    }

    getCPU(): CPU {
        return this.cpu;
    }
    getVDP(): VDP {
        return this.vdp;
    }
    getPSG(): PSG {
        return this.psg;
    }
    getSpeech(): Speech {
        return this.speech;
    }
    getCRU(): CRU {
        return this.cru;
    }
    getMemory(): Memory {
        return this.memory;
    }
    getKeyboard(): Keyboard {
        return this.keyboard;
    }
    getTape(): Tape {
        return this.tape;
    }
    getDiskDrives(): DiskDrive[] {
        return this.diskDrives;
    }
    getGoogleDrives(): GoogleDrive[] {
        return this.googleDrives;
    }

    isRunning() {
        return this.running;
    }

    reset(keepCart: boolean) {
        // Components
        this.memory.reset(keepCart);
        this.cpu.reset();
        this.vdp.reset();
        this.psg.reset();
        this.speech.reset();
        this.cru.reset();
        this.keyboard.reset();
        this.tape.reset();
        for (let i = 0; i < this.diskDrives.length; i++) {
            this.diskDrives[i].reset();
        }
        for (let i = 0; i < this.googleDrives.length; i++) {
            this.googleDrives[i].reset();
        }
        // Other
        this.resetFps();
        this.cpuSpeed = 1;
    }

    start(fast) {
        if (!this.isRunning()) {
            this.cpuSpeed = fast ? 2 : 1;
            this.log.info("Start");
            this.cpu.setSuspended(false);
            this.tape.setPaused(false);
            this.keyboard.start();
            const self = this;
            this.frameInterval = window.setInterval(
                function () {
                    if (self.frameCount < TI994A.FRAMES_TO_RUN) {
                        // self.frame();
                        self.frame();
                    } else {
                        self.stop();
                    }
                },
                TI994A.FRAME_MS
            );
            this.resetFps();
            this.printFps();
            this.fpsInterval = window.setInterval(
                function () {
                    self.printFps();
                },
                TI994A.FPS_MS
            );
        }
        this.running = true;
    }

    frame() {
        const cpuSpeed = this.cpuSpeed;
        let cyclesToRun = TMS9900.CYCLES_PER_FRAME * cpuSpeed;
        const cyclesPerScanline = TMS9900.CYCLES_PER_SCANLINE * cpuSpeed;
        const f18ACyclesPerScanline = F18AGPU.CYCLES_PER_SCANLINE;
        let extraCycles = 0;
        let cruTimerDecrementFrame = CRU.TIMER_DECREMENT_PER_FRAME;
        const cruTimerDecrementScanline = CRU.TIMER_DECREMENT_PER_SCANLINE;
        let y = 0;
        this.vdp.initFrame(window.performance ? window.performance.now() : new Date().getTime());
        while (cyclesToRun > 0) {
            if (y < 240) {
                this.vdp.drawScanline(y);
            }
            y = y + 1;
            if (!this.cpu.isSuspended()) {
                extraCycles = this.cpu.run(cyclesPerScanline - extraCycles);
                if (this.cpu.atBreakpoint()) {
                    this.cpu.setOtherBreakpoint(null);
                    if (this.onBreakpoint) {
                        this.onBreakpoint(this.cpu);
                    }
                    return;
                }
            }
            // F18A GPU
            const gpu: CPU = this.vdp.getGPU();
            if (gpu && !gpu.isIdle()) {
                gpu.run(f18ACyclesPerScanline);
                if (gpu.atBreakpoint()) {
                    gpu.setOtherBreakpoint(null);
                    if (this.onBreakpoint) {
                        this.onBreakpoint(gpu);
                    }
                    return;
                }
            }
            this.cru.decrementTimer(cruTimerDecrementScanline);
            cruTimerDecrementFrame -= cruTimerDecrementScanline;
            cyclesToRun -= cyclesPerScanline;
        }
        if (cruTimerDecrementFrame >= 1) {
            this.cru.decrementTimer(cruTimerDecrementFrame);
        }
        this.fpsFrameCount++;
        this.frameCount++;
        this.vdp.updateCanvas();
    }

    step() {
        const gpu: CPU = this.vdp.getGPU();
        if (gpu && !gpu.isIdle()) {
            gpu.run(1);
        } else {
            this.cpu.run(1);
        }
    }

    stepOver() {
        if (this.vdp.getGPU() && !this.vdp.getGPU().isIdle()) {
            this.vdp.getGPU().setOtherBreakpoint(this.vdp.getGPU().getPC() + 4);
        } else {
            this.cpu.setOtherBreakpoint(this.cpu.getPC() + 4);
        }
        this.start(false);
    }

    stop() {
        this.log.info("Stop");
        window.clearInterval(this.frameInterval);
        window.clearInterval(this.fpsInterval);
        this.psg.mute();
        this.tape.setPaused(true);
        this.keyboard.stop();
        this.vdp.updateCanvas();
        this.running = false;
        this.cpu.dumpProfile();
    }

    drawFrame() {
        const timestamp = window.performance ? window.performance.now() : new Date().getTime();
        this.vdp.drawFrame(timestamp);
        this.fpsFrameCount++;
    }

    resetFps() {
        this.lastFpsTime = null;
        this.fpsFrameCount = 0;
    }

    printFps() {
        const now = +new Date();
        let s = 'Frame ' + this.frameCount + ' running';
        if (this.lastFpsTime) {
            s += ': '
                + (this.fpsFrameCount / ((now - this.lastFpsTime) / 1000)).toFixed(1)
                + ' / '
                + (1000 / TI994A.FRAME_MS).toFixed(1)
                + ' FPS';
        }
        this.log.info(s);
        this.fpsFrameCount = 0;
        this.lastFpsTime = now;
    }

    getPC() {
        const gpu: CPU = this.vdp.getGPU();
        if (gpu && !gpu.isIdle()) {
            return gpu.getPC();
        } else {
            return this.cpu.getPC();
        }
    }

    getStatusString() {
        const gpu: CPU = this.vdp.getGPU();
        return (
            gpu && !gpu.isIdle() ?
                gpu.getInternalRegsString() + " F18A GPU " + this.cru.getStatusString() + "\n" + gpu.getRegsStringFormatted() :
                this.cpu.getInternalRegsString() + " " + this.cru.getStatusString() + "\n" + this.cpu.getRegsStringFormatted()
        ) + this.vdp.getRegsString() + " " + this.memory.getStatusString();
    }

    loadSoftware(sw: any) {
        const wasRunning = this.isRunning();
        if (wasRunning) {
            this.stop();
        }
        this.reset(sw.memoryBlocks);
        if (sw.memoryBlocks) {
            for (let i = 0; i < sw.memoryBlocks.length; i++) {
                const memoryBlock = sw.memoryBlocks[i];
                this.memory.loadRAM(memoryBlock.address, memoryBlock.data);
            }
        }
        if (sw.rom) {
            this.memory.setCartridgeImage(
                sw.rom,
                sw.type === Software.TYPE_INVERTED_CART,
                sw.ramAt6000, sw.ramAt7000, sw.ramPaged
            );
        }
        if (sw.grom) {
            this.memory.loadGROM(sw.grom, 3, 0);
        }
        if (sw.groms) {
            for (let g = 0; g < sw.groms.length; g++) {
                this.memory.loadGROM(sw.groms[g], 3, g);
            }
        }
        this.cpu.setWP(sw.workspaceAddress ? sw.workspaceAddress : (System.ROM[0] << 8 | System.ROM[1]));
        this.cpu.setPC(sw.startAddress ? sw.startAddress : (System.ROM[2] << 8 | System.ROM[3]));
        if (wasRunning) {
            this.start(false);
        }
        if (sw.keyPresses) {
            const that = this;
            window.setTimeout(
                function () {
                    that.keyboard.simulateKeyPresses(sw.keyPresses, null);
                },
                1000
            );
        }
    }

    getState() {
        return {
            tms9900: this.cpu.getState(),
            memory: this.memory.getState(),
            cru: this.cru.getState(),
            keyboard: this.keyboard.getState(),
            vdp: this.vdp.getState(),
            tms9919: this.psg.getState(),
            tms5220: this.speech.getState(),
            tape: this.tape.getState()
        };
    }

    restoreState(state) {
        if (state.cpu) {
            this.cpu.restoreState(state.cpu);
        }
        if (state.memory) {
            this.memory.restoreState(state.memory);
        }
        if (state.cru) {
            this.cru.restoreState(state.cru);
        }
        if (state.keyboard) {
            this.keyboard.restoreState(state.keyboard);
        }
        if (state.vdp) {
            this.vdp.restoreState(state.vdp);
        }
        if (state.psg) {
            this.psg.restoreState(state.psg);
        }
        if (state.speech) {
            this.speech.restoreState(state.speech);
        }
        if (state.tape) {
            this.tape.restoreState(state.tape);
        }
    }

}