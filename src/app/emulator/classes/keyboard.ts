import {Log} from '../../classes/log';
import {Joystick} from './joystick';
import {State} from '../interfaces/state';
import {Settings} from '../../classes/settings';
import {Key, KeyMapper} from "../../classes/keymapper";

export class Keyboard implements State {

    static KEYPRESS_DURATION = 100;
    static EMULATE_JOYSTICK_2 = false;

    private document: Document;
    private pcKeyboardEnabled: boolean;
    private mapArrowKeysToFctnSDEX: boolean;
    private running: boolean;
    private columns: boolean[][];
    private joystick1: Joystick;
    private joystick2: Joystick;
    private joystickActive: number;
    private keyCode: number;
    private alphaLock: boolean;
    private pasteBuffer: string;
    private pasteIndex: number;

    private keydownListener: EventListener;
    private keyupListener: EventListener;
    private keypressListener: EventListener;
    private pasteListener: EventListener;

    private log: Log = Log.getLog();

    constructor(document: Document, settings: Settings) {
        this.document = document;
        this.pcKeyboardEnabled = settings.isPCKeyboardEnabled();
        this.mapArrowKeysToFctnSDEX = settings.isMapArrowKeysEnabled();
        this.running = false;
        this.columns = new Array(9);
        for (let col = 0; col < 8; col++) {
            this.columns[col] = [];
        }
    }

    reset() {
        for (let col = 0; col < 8; col++) {
            for (let addr = 3; addr <= 10; addr++) {
                this.columns[col][addr] = false;
            }
        }
        if (!this.joystick1) {
            this.joystick1 = new Joystick(this.columns[6], 0);
        }
        if (!this.joystick2) {
            this.joystick2 = new Joystick(this.columns[7], 1);
        }
        this.joystickActive = 250;
        this.keyCode = 0;
        this.alphaLock = true;
        this.pasteBuffer = null;
        this.pasteIndex = 0;
    }

    start() {
        if (!this.running) {
            this.attachListeners();
            this.joystick1.start();
            this.joystick2.start();
            this.running = true;
        }
    }

    stop() {
        if (this.running) {
            this.removeListeners();
            this.joystick1.stop();
            this.joystick2.stop();
            this.running = false;
        }
    }

    private attachListeners() {
        if (!this.pcKeyboardEnabled) {
            if (!this.keydownListener) {
                this.keydownListener = (evt: KeyboardEvent) => {
                    this.keyEvent(evt, true);
                };
                this.document.addEventListener( "keydown", this.keydownListener);
            }
            if (!this.keyupListener) {
                this.keyupListener = (evt: KeyboardEvent) => {
                    this.keyEvent(evt, false);
                };
                this.document.addEventListener("keyup", this.keyupListener);
            }
        } else {
            if (!this.keydownListener) {
                this.keydownListener = (evt: KeyboardEvent) => {
                    this.keyEventPC(evt, true);
                };
                this.document.addEventListener("keydown", this.keydownListener);
            }
            if (!this.keypressListener) {
                this.keypressListener = (evt: KeyboardEvent) => {
                    this.keyPressEvent(evt);
                };
                this.document.addEventListener("keypress", this.keypressListener);
            }
            if (!this.keyupListener) {
                this.keyupListener = (evt: KeyboardEvent) => {
                    this.keyEventPC(evt, false);
                };
                this.document.addEventListener("keyup", this.keyupListener);
            }
        }
        if (!this.pasteListener) {
            this.pasteListener = (evt: ClipboardEvent) => {
                this.pasteBuffer = "\n" + evt.clipboardData.getData('text/plain') + "\n";
                this.pasteIndex = 0;
            };
            this.document.addEventListener("paste", this.pasteListener);
        }
    }

    private removeListeners() {
        if (this.keyupListener) {
            this.document.removeEventListener("keyup", this.keyupListener);
            this.keyupListener = null;
        }
        if (this.keypressListener) {
            this.document.removeEventListener("keypress", this.keypressListener);
            this.keypressListener = null;
        }
        if (this.keydownListener) {
            this.document.removeEventListener("keydown", this.keydownListener);
            this.keydownListener = null;
        }
        if (this.pasteListener) {
            this.document.removeEventListener("paste", this.pasteListener);
            this.pasteListener = null;
        }
    }

    setPCKeyboardEnabled(enabled: boolean) {
        this.pcKeyboardEnabled = enabled;
        const wasRunning = this.running;
        if (wasRunning) {
            this.stop();
        }
        this.reset();
        if (wasRunning) {
            this.start();
        }
    }

    setMapArrowKeysToFctnSDEXEnabled(enabled: boolean) {
        this.mapArrowKeysToFctnSDEX = enabled;
        const wasRunning = this.running;
        if (wasRunning) {
            this.stop();
        }
        this.reset();
        if (wasRunning) {
            this.start();
        }
    }

    private keyEvent(evt: KeyboardEvent | any, down: boolean) {
        let key: Key;
        if (evt.code) {
            key = KeyMapper.getKeyFromCode(evt.code);
        } else if (evt.keyCode) {
            key = KeyMapper.getKeyFromKeyCode(evt.keyCode);
        }
        if (key) {
            key.tiKeys.forEach((tiKey) => {
                this.columns[tiKey.col][tiKey.row] = down;
            });
            this.handleOtherKeys(key.code, down);
        }
        if (
            !key || // Unused key
            (this.columns[0][8] && this.columns[0][9] && this.columns[2][5]) || // Ctrl + Shift + I (Developer console)
            (this.columns[0][9] && this.columns[2][10]) ||                      // Ctrl + C (copy)
            (this.columns[0][9] && this.columns[3][10])                         // Ctrl + V (paste)
        ) {
            // Let browser handle unused keys
            return;
        }
        evt.preventDefault();
    }

    // For PC keyboard
    private keyEventPC(evt: KeyboardEvent | any, down: boolean) {
        console.log(evt.keyCode, evt.code, evt.key);
        const key = KeyMapper.getKeyFromKey(evt.key);
        if (key) {
            const fctn = this.columns[0][7];
            this.columns[0][7] = false; // Fctn
            this.columns[0][8] = false; // Shift
            this.columns[0][9] = false; // Ctrl
            key.tiKeys.forEach((tiKey) => {
                this.columns[tiKey.col][tiKey.row] = down;
            });
            this.handleOtherKeys(key.key, down);
            // Handle Alt + S/D/E/X
            if (fctn && ['s', 'd', 'e', 'x'].indexOf(key.key.toLowerCase()) !== -1) {
                this.columns[0][7] = true;
            }
        }
        if (
            !key || // Unused key
            (this.columns[0][8] && this.columns[0][9] && this.columns[2][5]) || // Ctrl + Shift + I (Developer console)
            (this.columns[0][9] && this.columns[2][10]) ||                      // Ctrl + C (copy)
            (this.columns[0][9] && this.columns[3][10])                         // Ctrl + V (paste)
        ) {
            // Let browser handle unused keys
            return;
        }
        evt.preventDefault();
    }

    private handleOtherKeys(code: string, down: boolean) {
        switch (code) {
            case 'Tab':
                if (Keyboard.EMULATE_JOYSTICK_2) { this.columns[7][3] = down; }
                break;
            case 'ArrowLeft':
                if (Keyboard.EMULATE_JOYSTICK_2) { this.columns[7][4] = down; }
                if (this.mapArrowKeysToFctnSDEX && this.joystickActive === 0) {
                    // Left arrow
                    this.columns[0][7] = down; // Fctn
                    this.columns[1][8] = down; // S
                }
                break;
            case 'ArrowRight':
                if (Keyboard.EMULATE_JOYSTICK_2) { this.columns[7][5] = down; }
                if (this.mapArrowKeysToFctnSDEX && this.joystickActive === 0) {
                    // Right arrow
                    this.columns[0][7] = down; // Fctn
                    this.columns[2][8] = down; // D
                }
                break;
            case 'ArrowDown':
                if (Keyboard.EMULATE_JOYSTICK_2) { this.columns[7][6] = down; }
                if (this.mapArrowKeysToFctnSDEX && this.joystickActive === 0) {
                    // Down arrow
                    this.columns[0][7] = down; // Fctn
                    this.columns[1][10] = down; // X
                }
                break;
            case 'ArrowUp':  // Up arrow -> J1 Up
                if (Keyboard.EMULATE_JOYSTICK_2) { this.columns[7][7] = down; }
                if (this.mapArrowKeysToFctnSDEX && this.joystickActive === 0) {
                    // Up arrow
                    this.columns[0][7] = down; // Fctn
                    this.columns[2][9] = down; // E
                }
                break;
            case 'CapsLock':
                if (down) {
                    this.alphaLock = !this.alphaLock;
                }
                break;
        }
    }

    // For PC keyboard
    private keyPressEvent(evt: KeyboardEvent | any) {
        // let capsLock = null;
        // if (charCode >= 65 && charCode <= 90) {
        //     capsLock = !evt.shiftKey;
        // } else if (charCode >= 97 && charCode <= 122) {
        //     capsLock = evt.shiftKey;
        // }
        // if (capsLock != null) {
        //     // this.log.info("Caps Lock " + (capsLock ? "on" : "off"));
        //     this.alphaLock = (capsLock || this.pcKeyboardEnabled) && !(capsLock && this.pcKeyboardEnabled);
        // }
        // evt.preventDefault();
    }

    isKeyDown(col: number, addr: number): boolean {
        // This is necessary in order for the Joystick in Donkey Kong to work
        if (col === 6 || col === 7) {
            this.joystickActive = 250;
        } else if (this.joystickActive > 0) {
            this.joystickActive--;
        }
        //
        return this.columns[col][addr];
    }

    isAlphaLockDown(): boolean {
        // this.log.info("Alpha Lock " + this.alphaLock);
        return this.alphaLock;
    }

    simulateKeyPresses(keyString: string, callback: () => void) {
        if (keyString.length > 0) {
            const pause = keyString.charAt(0) === "§";
            const that = this;
            if (!pause) {
                const charCode = keyString.charCodeAt(0);
                this.simulateKeyPress(charCode > 96 ? charCode - 32 : charCode, () => {
                    window.setTimeout(() => {
                        that.simulateKeyPresses(keyString.substr(1), callback);
                    }, Keyboard.KEYPRESS_DURATION);
                });
            } else {
                window.setTimeout(() => {
                    that.simulateKeyPresses(keyString.substr(1), callback);
                }, 1000);
            }
        } else if (callback) {
            callback();
        }
    }

    simulateKeyPress(keyCode: number, callback: () => void) {
        // this.log.info(keyCode);
        this.simulateKeyDown(keyCode);
        const that = this;
        window.setTimeout(() => {
            that.simulateKeyUp(keyCode);
            if (callback) { callback(); }
        }, Keyboard.KEYPRESS_DURATION);
    }

    // Keypress from the virtual keyboard
    virtualKeyPress(keyCode: number) {
        this.virtualKeyDown(keyCode);
        if (keyCode !== 16 && keyCode !== 17 && keyCode !== 18) {
            const that = this;
            window.setTimeout(() => {
                that.virtualKeyUp(keyCode);
            }, Keyboard.KEYPRESS_DURATION);
        }
    }

    private virtualKeyDown(keyCode: number) {
        this.simulateKeyDown(keyCode);
        const that = this;
        if (keyCode !== 16) {
            window.setTimeout(() => { that.simulateKeyUp(16); }, Keyboard.KEYPRESS_DURATION);
        }
        if (keyCode !== 17) {
            window.setTimeout(() => { that.simulateKeyUp(17); }, Keyboard.KEYPRESS_DURATION);
        }
        if (keyCode !== 18) {
            window.setTimeout(() => { that.simulateKeyUp(18); }, Keyboard.KEYPRESS_DURATION);
        }
    }

    private virtualKeyUp(keyCode: number) {
        this.simulateKeyUp(keyCode);
    }

    private simulateKeyDown(keyCode: number) {
        this.keyEvent({keyCode: keyCode, preventDefault() {}}, true);
    }

    private simulateKeyUp(keyCode: number) {
        this.keyEvent({keyCode: keyCode, preventDefault() {}}, false);
    }

    getPasteCharCode(): number {
        let charCode = -1;
        while (charCode === -1 && this.pasteBuffer && this.pasteBuffer.length > this.pasteIndex) {
            const tmpCharCode = this.pasteBuffer.charCodeAt(this.pasteIndex++);
            if (tmpCharCode >= 32 && tmpCharCode <= 127) {
                charCode = tmpCharCode;
            } else if (tmpCharCode === 10) {
                charCode = 13;
            }
        }
        if (this.pasteBuffer && this.pasteIndex === this.pasteBuffer.length) {
            this.pasteBuffer = null;
        }
        return charCode;
    }

    getState(): object {
        return {
            pcKeyboardEnabled: this.pcKeyboardEnabled,
            mapArrowKeysToFctnSDEX: this.mapArrowKeysToFctnSDEX,
            columns: this.columns,
            joystickActive: this.joystickActive,
            keyCode: this.keyCode,
            alphaLock: this.alphaLock,
            pasteBuffer: this.pasteBuffer,
            pasteIndex: this.pasteIndex,
            joystick1: this.joystick1.getState(),
            joystick2: this.joystick2.getState()
        };
    }

    restoreState(state) {
        this.pcKeyboardEnabled = state.pcKeyboardEnabled;
        this.mapArrowKeysToFctnSDEX = state.mapArrowKeysToFctnSDEX;
        this.columns = state.columns;
        this.joystickActive = state.joystickActive;
        this.keyCode = state.keyCode;
        this.alphaLock = state.alphaLock;
        this.pasteBuffer = state.pasteBuffer;
        this.pasteIndex = state.pasteIndex;
        this.joystick1.restoreState(state.joystick1);
        this.joystick2.restoreState(state.joystick2);
    }
}
