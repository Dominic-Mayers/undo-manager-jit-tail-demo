import {
    initHist,
    executeHist,
    undoHist,
    redoHist,
    canUndoHist,
    canRedoHist,
    unSyncHist,
    isSyncHist,
    atTail,
    undoManager,
    getIncomingForwardCommand
} from "./undo-manager-jit-tail/undo-manager-jit-tail.js";

const currentEl = document.getElementById("current-box");
const canonicalEl = document.getElementById("canonical-box");
const debugEl = document.getElementById("debug");

const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const resetMainBtn = document.getElementById("reset-main");
const resetToggleBtn = document.getElementById("reset-toggle");
const tailModeLabelEl = document.getElementById("tail-mode-label");
const tailModeMenuEl = document.getElementById("tail-mode-menu");

const modePositionEl = document.getElementById("mode-position");
const modeSizeEl = document.getElementById("mode-size");

const MIN_SIZE = 24;
const MAX_SIZE = 140;
const STAGE_WIDTH = 720;
const STAGE_HEIGHT = 480;

let selectedTailMode = "ephemeral";

const initialState = {
    x: STAGE_WIDTH / 2,
    y: STAGE_HEIGHT / 2,
    size: 64,
    colorBits: { r: 0, g: 1, b: 0 }
};

let currentState = cloneState(initialState);
let canonicalState = cloneState(initialState);

function cloneState(state) {
    return {
        x: state.x,
        y: state.y,
        size: state.size,
        colorBits: {
            r: state.colorBits.r,
            g: state.colorBits.g,
            b: state.colorBits.b
        }
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function snapToStage(state) {
    const half = state.size / 2;

    return {
        ...cloneState(state),
        x: clamp(state.x, half, STAGE_WIDTH - half),
        y: clamp(state.y, half, STAGE_HEIGHT - half)
    };
}

function colorFromBits(bits) {
    return `rgb(${bits.r ? 255 : 0}, ${bits.g ? 255 : 0}, ${bits.b ? 255 : 0})`;
}

function renderBox(el, state) {
    el.style.left = `${state.x}px`;
    el.style.top = `${state.y}px`;
    el.style.width = `${state.size}px`;
    el.style.height = `${state.size}px`;
    el.style.backgroundColor = colorFromBits(state.colorBits);
}

function applyState(nextState, { markCanonical = false } = {}) {
    currentState = snapToStage(cloneState(nextState));

    if (markCanonical) {
        canonicalState = cloneState(currentState);
    }

    render();
}

function makeRestoreCommand(snapshot, { markCanonical = false } = {}) {
    const frozen = cloneState(snapshot);

    const fn = function () {};
    fn.cmd = async () => {
        applyState(frozen, { markCanonical });
    };
    fn.cmd.state = cloneState(snapshot);

    return fn;
}

function buildCanonicalCheckpointPairFromSemanticCurrent(afterState) {
    const currentCheckpointCmd = getIncomingForwardCommand();
    const beforeState = currentCheckpointCmd?.state;

    if (!beforeState) {
        throw new Error("buildCanonicalCheckpointPairFromSemanticCurrent: incoming-forward cmd.state is missing");
    }

    const undo = makeRestoreCommand(beforeState, { markCanonical: true });
    const redo = makeRestoreCommand(afterState, { markCanonical: true });
    return { undo, redo };
}

function initTail() {
    const currentCheckpointCmd = getIncomingForwardCommand();
    const checkpointState = currentCheckpointCmd?.state;

    if (!checkpointState) {
        throw new Error("initTail: incoming-forward cmd.state is missing");
    }

    const undo = makeRestoreCommand(checkpointState, { markCanonical: false });
    const redo = makeRestoreCommand(currentState, { markCanonical: false });
    return { undo, redo };
}

function getMode(kind) {
    if (kind === "position") return modePositionEl.value;
    if (kind === "size") return modeSizeEl.value;
    throw new Error(`Unknown mode kind: ${kind}`);
}

function applyMajorChange(after) {
    const { undo, redo } = buildCanonicalCheckpointPairFromSemanticCurrent(after);
    executeHist(undo, redo);
    canonicalState = cloneState(after);
    render();
}

function performChange(kind, mutateFn) {
    const after = snapToStage(mutateFn(cloneState(currentState)));

    applyState(after, { markCanonical: false });

    if (kind === "color") {
        applyMajorChange(after);
        return;
    }

    const mode = getMode(kind);

    if (mode === "ignored") {
        render();
        return;
    }

    if (mode === "minor") {
        unSyncHist();
        render();
        return;
    }

    applyMajorChange(after);
}

function getCurrentCheckpointState() {
    const checkpointCmd = getIncomingForwardCommand();
    return checkpointCmd?.state ? cloneState(checkpointCmd.state) : cloneState(currentState);
}

function sameState(a, b) {
    return (
        a.x === b.x &&
        a.y === b.y &&
        a.size === b.size &&
        a.colorBits.r === b.colorBits.r &&
        a.colorBits.g === b.colorBits.g &&
        a.colorBits.b === b.colorBits.b
    );
}

function render() {
    const checkpointState = getCurrentCheckpointState();

    renderBox(canonicalEl, checkpointState);

    if (sameState(currentState, checkpointState)) {
        currentEl.style.display = "none";
    } else {
        currentEl.style.display = "block";
        renderBox(currentEl, currentState);
    }

    const commands = undoManager.getCommands?.() ?? [];
    const index = undoManager.getIndex();
    const last = commands.length - 1;

    debugEl.textContent =
`tailMode: ${selectedTailMode}
index:    ${index}
last:     ${last}
atTail:   ${atTail()}
sync:     ${isSyncHist()}
canUndo:  ${canUndoHist()}
canRedo:  ${canRedoHist()}

current visible state:
  x=${currentState.x}, y=${currentState.y}, size=${currentState.size},
  color=${JSON.stringify(currentState.colorBits)}

current checkpoint:
  x=${checkpointState.x}, y=${checkpointState.y}, size=${checkpointState.size},
  color=${JSON.stringify(checkpointState.colorBits)}`;

    undoBtn.disabled = !canUndoHist();
    redoBtn.disabled = !canRedoHist();
    tailModeLabelEl.textContent = selectedTailMode;
}

function resetDemo() {
    currentState = cloneState(initialState);
    canonicalState = cloneState(initialState);

    const initialRedoCmd = async () => {
        applyState(initialState, { markCanonical: true });
    };
    initialRedoCmd.state = cloneState(initialState);

    initHist(initialRedoCmd, selectedTailMode);
    applyState(initialState, { markCanonical: true });
}

document.querySelectorAll("[data-action='move']").forEach((btn) => {
    btn.addEventListener("click", () => {
        const dx = Number(btn.dataset.dx);
        const dy = Number(btn.dataset.dy);

        performChange("position", (state) => {
            state.x += dx || 0;
            state.y += dy || 0;
            return state;
        });
    });
});

document.querySelectorAll("[data-action='size']").forEach((btn) => {
    btn.addEventListener("click", () => {
        const delta = Number(btn.dataset.delta);

        performChange("size", (state) => {
            state.size = clamp(state.size + delta, MIN_SIZE, MAX_SIZE);
            return state;
        });
    });
});

document.querySelectorAll("[data-action='color']").forEach((btn) => {
    btn.addEventListener("click", () => {
        const channel = btn.dataset.channel;

        performChange("color", (state) => {
            state.colorBits[channel] = state.colorBits[channel] ? 0 : 1;
            return state;
        });
    });
});

undoBtn.addEventListener("click", async () => {
    const cmd = undoHist({ initTail });
    if (cmd) {
        await cmd();
        render();
    }
});

redoBtn.addEventListener("click", async () => {
    const cmd = redoHist();
    if (cmd) {
        await cmd();
        render();
    }
});

resetMainBtn.addEventListener("click", () => {
    resetDemo();
});

resetToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    tailModeMenuEl.classList.toggle("hidden");
});

tailModeMenuEl.querySelectorAll("[data-tail-mode]").forEach((el) => {
    el.addEventListener("click", () => {
        selectedTailMode = el.dataset.tailMode;
        tailModeLabelEl.textContent = selectedTailMode;
        tailModeMenuEl.classList.add("hidden");
    });
});

document.addEventListener("click", (event) => {
    if (!tailModeMenuEl.classList.contains("hidden")) {
        const insideMenu = tailModeMenuEl.contains(event.target);
        const insideToggle = resetToggleBtn.contains(event.target);
        if (!insideMenu && !insideToggle) {
            tailModeMenuEl.classList.add("hidden");
        }
    }
});

modePositionEl.addEventListener("change", render);
modeSizeEl.addEventListener("change", render);

resetDemo();
