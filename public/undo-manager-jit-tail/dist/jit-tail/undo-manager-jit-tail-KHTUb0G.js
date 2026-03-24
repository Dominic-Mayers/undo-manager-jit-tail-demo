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

    undoManager.clear();

    const commands = undoManager.getCommands?.();
    if (!Array.isArray(commands) || commands.length !== 0) {
        throw new Error("initHistGeneric: undoManager.clear() failed to reset history");
    }

    const initialUndoPayload = async () => {
        throw new Error("Initial checkpoint cannot be undone");
    };

    undoManager.add({
        undo: toInternalCommand(initialUndoPayload),
        redo: toInternalCommand(initialRedoCmd)
    });

    sync = true;
    hasTail = false;
}

export function executeHist(undo, redo) {
    addCheckpoint(undo, redo, false);
    logStateHist("ExecuteHist:");
    return redo; 
}

export function redoHist() {
    if (!canRedoHist()) {
        console.log("redoHist: no redo available");
        return null;
    }

    const command = getRedoCommand();
    if (!command?.redo || !("cmd" in command.redo)) {
        throw new Error("redoHist: current redo payload is missing");
    }

    undoManager.redo();
    sync = true;
    logStateHist("redoHist: ");

    return command.redo.cmd;
}

export function undoHist({ initTail } = {}) {
    if (!canUndoHist()) {
        console.log("undoHist: no undo available");
        return null;
    }

    if (!sync) {
        if (typeof initTail !== "function") {
            throw new Error("undoHist: initTail is required when state is not synchronized");
        }

        const tail = initTail();

        if (!tail || typeof tail !== "object" || !("undo" in tail) || !("redo" in tail)) {
            throw new Error("undoHist: initTail() must return { undo, redo }");
        }

        const { undo, redo } = tail;
        addCheckpoint(undo, redo, true);
    }

    const commandToUndo = getCurrentCommand();
    if (!commandToUndo?.undo || !("cmd" in commandToUndo.undo)) {
        throw new Error("undoHist: effective undo payload is missing");
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

function toInternalCommand(payload) {
    if ( payload && typeof payload === "function" && "cmd" in payload) {
        return payload;
    }

    const wrapped = function () {};
    wrapped.cmd = payload;
    return wrapped;
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
    if (tailMode === "ephemeral" && atTail()) {
        undoManager.undo();
        hasTail = false;
    }

    undoManager.add({
        undo: toInternalCommand(undo),
        redo: toInternalCommand(redo)
    });

    hasTail = (tailMode === "ephemeral") && isTail;
    sync = true;
}

function isAtInitialCheckpoint() {
    return undoManager.getIndex() === 0;
}

export {undoManager}; 
