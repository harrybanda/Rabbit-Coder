const Diagnostics = require("Diagnostics");
const Scene = require("Scene");
const Animation = require("Animation");
const TouchGestures = require("TouchGestures");
const Time = require("Time");
const Reactive = require("Reactive");
export const Materials = require("Materials");

const player = Scene.root.find("player");
const blocks = Scene.root.find("blocks");
const platforms = Scene.root.find("platforms");
const obstacle = Scene.root.find("obstacle");
const switches = Scene.root.find("switches");
export const buttons = Scene.root.find("buttons");

const levels = require("./levels");

const gridSize = 0.36;
const gridInc = 0.12;
const numOfSwitches = 2;
const numOfBlocks = 10;
const numOfPlatforms = 10;
const blockSlotInc = 0.075;
const blockInitY = 0.5;
const initBlockSlot = 0.28;
const states = { start: 1, running: 2, complete: 3, failed: 4, uncomplete: 5 };

let currentLevel = 0;
let commands = [];
let executionCommands = [];
let switchesAdded = [];
let blocksUsed = 0;
let platformsUsed = 0;
let switchesUsed = 0;
let nextBlockSlot = initBlockSlot;
let currentState = states.start;
let playerDir = levels[currentLevel].facing;
let loopIterations = 0;
let exeIntervalID;
let stopSelected = false;
let obstacleActivated = true;
let allCoordinates = createAllCoordinates();
let pathCoordinates = createPathCoordinates();
let dangerCoordinates = createDangerCoordinates();

/*------------- Touch Gestures -------------*/

TouchGestures.onTap(buttons.child("btnForward")).subscribe(function() {
  if (buttons.child("btnForward").material.name != "disable") {
    addCommand("forward");
  }
});

TouchGestures.onTap(buttons.child("btnLeft")).subscribe(function() {
  if (buttons.child("btnLeft").material.name != "disable") {
    addCommand("left");
  }
});

TouchGestures.onTap(buttons.child("btnRight")).subscribe(function() {
  if (buttons.child("btnRight").material.name != "disable") {
    addCommand("right");
  }
});

TouchGestures.onTap(buttons.child("btnLoop")).subscribe(function() {
  if (buttons.child("btnLoop").material.name != "disable") {
    setButtonState("loopAdded");
    addCommand("loop");
  }
});

TouchGestures.onTap(buttons.child("btnStopLoop")).subscribe(function() {
  if (buttons.child("btnStopLoop").material.name != "disable") {
    setButtonState("stopAdded");
    addCommand("stopLoop");
  }
});

TouchGestures.onTap(buttons.child("btnLoop2")).subscribe(function() {
  if (buttons.child("btnLoop2").material.name != "disable") {
    setButtonState("iterationsSelected");
    loopIterations = 2;
  }
});

TouchGestures.onTap(buttons.child("btnLoop3")).subscribe(function() {
  if (buttons.child("btnLoop3").material.name != "disable") {
    setButtonState("iterationsSelected");
    loopIterations = 3;
  }
});

TouchGestures.onTap(buttons.child("btnLoop4")).subscribe(function() {
  if (buttons.child("btnLoop4").material.name != "disable") {
    setButtonState("iterationsSelected");
    loopIterations = 4;
  }
});

TouchGestures.onTap(buttons.child("btnUndo")).subscribe(function() {
  if (blocksUsed !== 0 && currentState === states.start) {
    let popped = commands.pop();
    popped.block.transform.y = blockInitY;
    popped.block.hidden = true;
    nextBlockSlot += blockSlotInc;
    blocksUsed--;
    if (popped.command === "loop") {
      setButtonState("loopRemoved");
    } else if (popped.command === "stopLoop") {
      setButtonState("stopRemoved");
    }
  }
});

TouchGestures.onTap(buttons.child("btnRun")).subscribe(function() {
  switch (currentState) {
    case states.start:
      if (commands.length !== 0) {
        executeCommands();
      }
      break;
    case states.failed:
      resetLevel();
      break;
    case states.uncomplete:
      resetLevel();
      break;
    case states.complete:
      nextLevel();
      break;
  }
});

/*------------- Monitor Player Position -------------*/

Reactive.monitorMany({
  x: player.transform.x,
  z: player.transform.z
}).subscribe(({ newValues }) => {
  let px = newValues.x;
  let pz = newValues.z;
  let path = pathCoordinates;
  let goalX = path[path.length - 1][0];
  let goalZ = path[path.length - 1][1];
  let obstacleCoords = levels[currentLevel].obstacle;
  let zoneArea = 0.005;

  // check if player is on the goal
  if (
    isBetween(px, goalX + zoneArea, goalX - zoneArea) &&
    isBetween(pz, goalZ + zoneArea, goalZ - zoneArea)
  ) {
    player.transform.x = goalX;
    player.transform.z = goalZ;
    commands = [];
    executionCommands = [];
    Time.clearInterval(exeIntervalID);
    currentState = states.complete;
    buttons.child("btnRun").material = Materials.get("forwardBlock");
  }

  // check if player is on a danger zone
  for (let i = 0; i < dangerCoordinates.length; i++) {
    let dx = dangerCoordinates[i][0];
    let dz = dangerCoordinates[i][1];
    if (
      isBetween(px, dx + zoneArea, dx - zoneArea) &&
      isBetween(pz, dz + zoneArea, dz - zoneArea)
    ) {
      player.transform.x = dx;
      player.transform.z = dz;
      commands = [];
      executionCommands = [];
      Time.clearInterval(exeIntervalID);
      currentState = states.failed;
      buttons.child("btnRun").material = Materials.get("forwardBlock");
    }
  }

  if ("obstacle" in levels[currentLevel]) {
    // check if player is on obstacle
    let obstacleX = pathCoordinates[obstacleCoords][0];
    let obstacleZ = pathCoordinates[obstacleCoords][1];

    if (
      isBetween(px, obstacleX + zoneArea, obstacleX - zoneArea) &&
      isBetween(pz, obstacleZ + zoneArea, obstacleZ - zoneArea) &&
      obstacleActivated
    ) {
      player.transform.x = obstacleX;
      player.transform.z = obstacleZ;
      commands = [];
      executionCommands = [];
      Time.clearInterval(exeIntervalID);
      currentState = states.failed;
      buttons.child("btnRun").material = Materials.get("forwardBlock");
    }

    // check if player is on a switch
    let switchCoords = levels[currentLevel].switches;
    for (let i = 0; i < switchCoords.length; i++) {
      let sx = pathCoordinates[switchCoords[i]][0];
      let sz = pathCoordinates[switchCoords[i]][1];
      if (
        isBetween(px, sx + zoneArea, sx - zoneArea) &&
        isBetween(pz, sz + zoneArea, sz - zoneArea)
      ) {
        switchesAdded[i].activated = true;
        let s = switches.child("switch" + i);
        s.hidden = true;
      }
    }

    if (switchesAdded.every(val => val.activated === true)) {
      obstacleActivated = false;
      obstacle.hidden = true;
    }
  }
});

/*------------- Create Level Coordinates -------------*/

function createAllCoordinates() {
  let coords = [];
  for (let i = -gridSize; i <= gridSize; i += gridInc) {
    for (let j = -gridSize; j <= gridSize; j += gridInc) {
      let x = Math.round(i * 1e4) / 1e4;
      let z = Math.round(j * 1e4) / 1e4;
      coords.push([x, z]);
    }
  }
  return coords;
}

function createPathCoordinates() {
  let path = levels[currentLevel].path;
  let coords = [];
  for (let i = 0; i < path.length; i++) {
    let x = allCoordinates[path[i][0]][1];
    let z = allCoordinates[path[i][1]][1];
    coords.push([x, z]);
  }
  return coords;
}

function createDangerCoordinates() {
  let coords = allCoordinates;
  for (let i = 0; i < pathCoordinates.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      let lvlCoordStr = JSON.stringify(pathCoordinates[i]);
      let genCoordStr = JSON.stringify(coords[j]);
      if (lvlCoordStr === genCoordStr) {
        coords.splice(j, 1);
      }
    }
  }
  return coords;
}

/*------------- Initialize current level -------------*/

function initLevel() {
  playerDir = levels[currentLevel].facing;
  player.transform.x = pathCoordinates[0][0];
  player.transform.z = pathCoordinates[0][1];
  player.transform.y = 0.03;

  if (playerDir === "east") {
    player.transform.rotationY = 0;
  } else if (playerDir === "north") {
    player.transform.rotationY = degreesToRadians(90);
  } else if (playerDir === "west") {
    player.transform.rotationY = degreesToRadians(180);
  } else if (playerDir === "south") {
    player.transform.rotationY = degreesToRadians(270);
  }

  // add path
  for (let i = 0; i < pathCoordinates.length; i++) {
    let path = pathCoordinates[i];
    let x = path[0];
    let z = path[1];
    let platform = platforms.child("platform" + platformsUsed++);
    platform.transform.x = x;
    platform.transform.z = z;
    platform.hidden = false;
  }

  if ("obstacle" in levels[currentLevel]) {
    // add obstacle
    let obstacleCoords = levels[currentLevel].obstacle;
    obstacle.transform.x = pathCoordinates[obstacleCoords][0];
    obstacle.transform.z = pathCoordinates[obstacleCoords][1];
    obstacle.hidden = false;

    // add switches
    let switchCoords = levels[currentLevel].switches;
    for (let i = 0; i < switchCoords.length; i++) {
      let s = switches.child("switch" + switchesUsed++);
      s.transform.x = pathCoordinates[switchCoords[i]][0];
      s.transform.z = pathCoordinates[switchCoords[i]][1];
      switchesAdded.push({ switch: "switch" + switchesUsed, activated: false });
      s.hidden = false;
    }
  }
}

initLevel();

/*------------- Add Command -------------*/

function addCommand(move) {
  let maxBlocks = levels[currentLevel].blocks;
  if (currentState === states.start) {
    if (blocksUsed < maxBlocks) {
      let block = blocks.child("block" + blocksUsed++);
      nextBlockSlot -= blockSlotInc;
      block.transform.y = nextBlockSlot;
      block.material = Materials.get(move + "Block");
      block.hidden = false;
      commands.push({ command: move, block: block });
    } else {
      Diagnostics.log("Solve this problem with " + maxBlocks + " blocks");
    }
  }
}

/*------------- Execution functions -------------*/

function executeCommands() {
  currentState = states.running;
  let loopIndex = findIndex("loop");
  let stopIndex = findIndex("stopLoop");

  if (loopIndex != undefined && stopIndex != undefined) {
    executionCommands = getLoopCommands(loopIndex, stopIndex);
  } else if (loopIndex != undefined && loopIterations === 0) {
    //TODO: handle this visually later
    Diagnostics.log("please select a number of iterations");
    currentState = states.start;
  } else if (loopIndex != undefined && stopIndex == undefined) {
    //TODO: handle this visually later
    Diagnostics.log("please stop the loop");
    currentState = states.start;
  } else if (stopIndex != undefined && loopIndex == undefined) {
    //TODO: handle this visually later
    Diagnostics.log("start loop not added");
    currentState = states.start;
  } else if (loopIndex == undefined && stopIndex == undefined) {
    executionCommands = getNonLoopCommands();
  }
  setExecutionInterval(
    function(e) {
      movePlayer(executionCommands[e]);
    },
    1000,
    executionCommands.length
  );
}

function setExecutionInterval(callback, delay, repetitions) {
  let e = 0;
  callback(0);
  exeIntervalID = Time.setInterval(function() {
    callback(e + 1);

    if (++e === repetitions) {
      Time.clearInterval(exeIntervalID);
      if (currentState === states.running) currentState = states.uncomplete;
      buttons.child("btnRun").material = Materials.get("forwardBlock");
    }
  }, delay);
}

function getLoopCommands(loopIndex, stopIndex) {
  let commandsToLoop = [];
  let dupCommands = [];
  let unDuplicatedLoop = [];
  let nonLoopCommands = getNonLoopCommands();

  // get loop commands
  for (let i = loopIndex; i < stopIndex; i++) {
    commandsToLoop.push(commands[i].command);
  }
  commandsToLoop.shift();
  if (commandsToLoop.length === 0) {
    //TODO: handle this visually later
    Diagnostics.log("loop empty");
    currentState = states.start;
    for (let i = 1; i >= 0; i--)
      nonLoopCommands.splice([loopIndex, stopIndex][i], 1);
    return nonLoopCommands;
  } else {
    // duplicate loop commands
    for (let i = 0; i < loopIterations; i++) {
      for (let j = 0; j < commandsToLoop.length; j++) {
        dupCommands.push(commandsToLoop[j]);
      }
    }
    // merge loop commands
    for (let i = loopIndex; i < stopIndex + 1; i++) {
      unDuplicatedLoop.push(nonLoopCommands[i]);
    }
    nonLoopCommands.splice(loopIndex, unDuplicatedLoop.length, dupCommands);
    let merged = [].concat.apply([], nonLoopCommands);
    return merged;
  }
}

function getNonLoopCommands() {
  let nonLoopCommands = [];
  for (let i = 0; i < commands.length; i++) {
    nonLoopCommands.push(commands[i].command);
  }
  return nonLoopCommands;
}

function findIndex(command) {
  let index;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].command === command) {
      index = i;
      break;
    }
  }
  return index;
}

/*------------- Control Player -------------*/

function movePlayer(command) {
  const timeDriverParameters = {
    durationMilliseconds: 500,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);
  const translationNegX = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.x.pinLastValue(),
      player.transform.x.pinLastValue() - gridInc
    )
  );

  const translationPosX = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.x.pinLastValue(),
      player.transform.x.pinLastValue() + gridInc
    )
  );

  const translationNegZ = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.z.pinLastValue(),
      player.transform.z.pinLastValue() - gridInc
    )
  );

  const translationPosZ = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.z.pinLastValue(),
      player.transform.z.pinLastValue() + gridInc
    )
  );

  const rotationLeft = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.rotationY.pinLastValue(),
      player.transform.rotationY.pinLastValue() + degreesToRadians(90)
    )
  );

  const rotationRight = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.rotationY.pinLastValue(),
      player.transform.rotationY.pinLastValue() - degreesToRadians(90)
    )
  );

  timeDriver.start();

  switch (command) {
    case "forward":
      if (playerDir === "east") {
        player.transform.x = translationPosX;
      } else if (playerDir === "north") {
        player.transform.z = translationNegZ;
      } else if (playerDir === "west") {
        player.transform.x = translationNegX;
      } else if (playerDir === "south") {
        player.transform.z = translationPosZ;
      }
      break;
    case "left":
      if (playerDir === "east") {
        playerDir = "north";
      } else if (playerDir === "north") {
        playerDir = "west";
      } else if (playerDir === "west") {
        playerDir = "south";
      } else if (playerDir === "south") {
        playerDir = "east";
      }
      player.transform.rotationY = rotationLeft;
      break;
    case "right":
      if (playerDir === "east") {
        playerDir = "south";
      } else if (playerDir === "south") {
        playerDir = "west";
      } else if (playerDir === "west") {
        playerDir = "north";
      } else if (playerDir === "north") {
        playerDir = "east";
      }
      player.transform.rotationY = rotationRight;
      break;
  }
}

/*------------- Reset current level -------------*/

function resetLevel() {
  currentState = states.start;
  playerDir = levels[currentLevel].facing;
  commands = [];
  executionCommands = [];
  switchesAdded = [];
  loopIterations = 0;
  blocksUsed = 0;
  platformsUsed = 0;
  switchesUsed = 0;
  nextBlockSlot = initBlockSlot;
  obstacleActivated = true;
  buttons.child("btnRun").material = Materials.get("rightBlock");
  setButtonState("initial");
  Time.clearInterval(exeIntervalID);

  for (let i = 0; i < numOfBlocks; i++) {
    let block = blocks.child("block" + i);
    block.transform.y = blockInitY;
    block.hidden = true;
  }

  initLevel();
}

/*------------- Go to next level -------------*/

function nextLevel() {
  currentLevel++;
  if (currentLevel > levels.length - 1) currentLevel = 0;

  allCoordinates = createAllCoordinates();
  pathCoordinates = createPathCoordinates();
  dangerCoordinates = createDangerCoordinates();

  for (let i = 0; i < numOfPlatforms; i++) {
    let platform = platforms.child("platform" + i);
    platform.hidden = true;
  }

  if ("obstacle" in levels[currentLevel] === false) {
    obstacle.transform.x = 0;
    obstacle.transform.z = -1;
    obstacle.hidden = true;

    for (let i = 0; i < numOfSwitches; i++) {
      let s = switches.child("switch" + i);
      s.transform.x = 0;
      s.transform.z = -1;
      s.hidden = true;
    }
  }

  resetLevel();
}

/*------------- Button states -------------*/

function setButtonState(state) {
  if (state === "loopAdded") {
    buttons.child("btnForward").material = Materials.get("disable");
    buttons.child("btnLeft").material = Materials.get("disable");
    buttons.child("btnRight").material = Materials.get("disable");
    buttons.child("btnLoop").material = Materials.get("disable");
    buttons.child("btnStopLoop").material = Materials.get("disable");
    buttons.child("btnLoop2").material = Materials.get("material4");
    buttons.child("btnLoop3").material = Materials.get("material4");
    buttons.child("btnLoop4").material = Materials.get("material4");
  } else if (state === "loopRemoved") {
    buttons.child("btnForward").material = Materials.get("forwardBlock");
    buttons.child("btnLeft").material = Materials.get("leftBlock");
    buttons.child("btnRight").material = Materials.get("rightBlock");
    buttons.child("btnLoop").material = Materials.get("loopBlock");
    buttons.child("btnStopLoop").material = Materials.get("disable");
    buttons.child("btnLoop2").material = Materials.get("disable");
    buttons.child("btnLoop3").material = Materials.get("disable");
    buttons.child("btnLoop4").material = Materials.get("disable");
  } else if (state === "iterationsSelected") {
    buttons.child("btnForward").material = Materials.get("forwardBlock");
    buttons.child("btnLeft").material = Materials.get("leftBlock");
    buttons.child("btnRight").material = Materials.get("rightBlock");
    if (stopSelected === false)
      buttons.child("btnStopLoop").material = Materials.get("stopLoopBlock");
  } else if (state === "stopAdded") {
    buttons.child("btnStopLoop").material = Materials.get("disable");
    stopSelected = true;
  } else if (state === "stopRemoved") {
    buttons.child("btnStopLoop").material = Materials.get("stopLoopBlock");
    stopSelected = false;
  } else if (state === "initial") {
    buttons.child("btnLoop").material = Materials.get("loopBlock");
    buttons.child("btnStopLoop").material = Materials.get("disable");
    buttons.child("btnLoop2").material = Materials.get("disable");
    buttons.child("btnLoop3").material = Materials.get("disable");
    buttons.child("btnLoop4").material = Materials.get("disable");
    stopSelected = false;
  }
}

/*------------- Utils -------------*/

function degreesToRadians(degrees) {
  let pi = Math.PI;
  return degrees * (pi / 180);
}

function isBetween(n, a, b) {
  return (n - a) * (n - b) <= 0;
}
