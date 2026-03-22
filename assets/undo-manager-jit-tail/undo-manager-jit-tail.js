// assets/undo-manager-jit-tail/undo-manager-jit-tail.js

import UndoManager from "undo-manager";

const undoManager = new UndoManager();

let sync = true;
let hasTail = false;
let tailMode = "ephemeral";

export function atTail() {
    if (tailMode !== "ephemeral") {
        return false;
    }
    return hasTail && undoManager.getIndex() === undoManager.getCommands().length - 1;
}

export function getTailMode() {
    return tailMode;
}

export function logStateHist(why) {
    console.log(why, 'index=', undoManager.getIndex(), 'last=', undoManager.getCommands().length - 1, 'hasTail=', hasTail, 'sync=', sync);
}

export function isSyncHist() {
    return sync;
}

export function unSyncHist() {
    sync = false;
}

export function initHist(initialRedoCmd = async () => {}, tailModeArg = "ephemeral") {

    if (tailModeArg !== "ephemeral" && tailModeArg !== "persistent") {
        throw new Error("initHistGeneric: tailMode must be 'ephemeral' or 'persistent'");
    }

    tailMode = tailModeArg;

    if (typeof initialRedoCmd !== "function") {
        throw new Error("initHistGeneric: initialRedoCmd must be a function");
    }

    undoManager.clear();

    const commands = undoManager.getCommands?.();
    if (!Array.isArray(commands) || commands.length !== 0) {
        throw new Error("initHistGeneric: undoManager.clear() failed to reset history");
    }

    const undo = function () {};
    undo.cmd = async () => {
        throw new Error("Initial checkpoint cannot be undone");
    };

    const redo = function () {};
    redo.cmd = initialRedoCmd;

    undoManager.add({ undo, redo });

    sync = true;
    hasTail = false;
}

export function executeHist(undo, redo) {
    addCheckpoint(undo, redo, false);
    logStateHist("ExecuteHist:");
}

export function redoHist() {
    if (!canRedoHist()) {
        console.log("redoHist: no redo available");
        return null;
    }

    const command = getRedoCommand();
    if (!command?.redo?.cmd) {
        throw new Error("redoHist: current redo.cmd is missing");
    }

    undoManager.redo();
    sync = true;
    logStateHist('redoHist: ');
    return command.redo.cmd;
}

export function undoHist({ initTail } = {}) {
    if (!canUndoHist()) {
        console.log("undoHist: no undo available");
        return null;
    }

    // If the visible state is dirty, first capture it as a JIT tail.
    if (!sync) {
        if (typeof initTail !== "function") {
            throw new Error("undoHist: initTail is required when state is not synchronized");
        }

        const tail = initTail();
        const { undo, redo } = tail ?? {};

        if (typeof undo !== "function") {
            throw new Error("undoHist: initTail() must return an undo function");
        }
        if (typeof redo !== "function") {
            throw new Error("undoHist: initTail() must return a redo function");
        }
        if (typeof undo.cmd !== "function") {
            throw new Error("undoHist: tail undo.cmd is missing");
        }
        if (typeof redo.cmd !== "function") {
            throw new Error("undoHist: tail redo.cmd is missing");
        }

        addCheckpoint(undo, redo, true);
    }

    // After the optional tail insertion, the current entry is exactly the one
    // that ordinary undo must undo.
    const commandToUndo = getCurrentCommand();
    if (!commandToUndo?.undo?.cmd) {
        throw new Error("undoHist: effective undo.cmd is missing");
    }

    undoManager.undo();
    sync = true;
    logStateHist("undoHist:");

    return commandToUndo.undo.cmd;
}

export function canUndoHist() {
    if (!sync) {
        return true;
    }

    return undoManager.hasUndo() && undoManager.getIndex() > 0;
}

export function canRedoHist() {
    return sync && undoManager.hasRedo();
}

function getSemanticIndex() {
    const index = undoManager.getIndex();
    return atTail() ? index - 1 : index;
}

function getCommandAt(index) {
    const commands = getCommands();
    return commands[index] ?? null;
}

export function getIncomingForwardCommand() {
    return getCommandAt(getSemanticIndex())?.redo?.cmd ?? null;
}

export function getOutgoingBackwardCommand() {
    return getCommandAt(getSemanticIndex())?.undo?.cmd ?? null;
}

export function getIncomingBackwardCommand() {
    return getCommandAt(getSemanticIndex() + 1)?.undo?.cmd ?? null;
}

export function getOutgoingForwardCommand() {
    return getCommandAt(getSemanticIndex() + 1)?.redo?.cmd ?? null;
}

export function getCurrentCommand() {
    const commands = getCommands();
    const index = undoManager.getIndex();
    return commands[index] ?? null;
}

export function getPreviousCommand() {
    const commands = getCommands();
    const index = undoManager.getIndex();
    return commands[index - 1] ?? null;
}

function getCommands() {
    const commands = undoManager.getCommands?.();
    if (!Array.isArray(commands)) {
        throw new Error("undo-manager getCommands() is unavailable");
    }
    return commands;
}

function getRedoCommand() {
    const commands = getCommands();
    const index = undoManager.getIndex();
    return commands[index + 1] ?? null;
}


function addCheckpoint(undo, redo, isTail) {
    if (!undo || typeof undo !== "function") {
        throw new Error("addCheckpoint: undo must be a function");
    }
    if (!redo || typeof redo !== "function") {
        throw new Error("addCheckpoint: redo must be a function");
    }

    if (tailMode === "ephemeral" && atTail()) {
        undoManager.undo();
        hasTail = false;
    }
    
    undoManager.add({undo, redo});
    hasTail = (tailMode === "ephemeral") && isTail;
    sync = true; 
}

function isAtInitialCheckpoint() {
    return undoManager.getIndex() === 0;
}

export {undoManager}; 
