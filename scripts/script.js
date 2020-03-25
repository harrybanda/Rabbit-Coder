// Spark AR modules
const Diagnostics = require("Diagnostics");
const Scene = require("Scene");
const Animation = require("Animation");
const TouchGestures = require("TouchGestures");
const Time = require("Time");
const Reactive = require("Reactive");
const Materials = require("Materials");
const Textures = require("Textures");
const Audio = require("Audio");
const Instruction = require("Instruction");
const CameraInfo = require("CameraInfo");

// Game objects
const player = Scene.root.find("bunny");
const blocks = Scene.root.find("blocks");
const platforms = Scene.root.find("platforms");
const obstacle = Scene.root.find("spikes");
const switches = Scene.root.find("switches");
const buttons = Scene.root.find("buttons");
const goal = Scene.root.find("carrot");
const waterEmitter = Scene.root.find("water_emitter");
const instructionsView = Scene.root.find("instructions_view");
const congratsView = Scene.root.find("congrats_view");
const UIGroup = Scene.root.find("UI");

// Sounds
const jumpSound = Audio.getPlaybackController("jump");
const dropSound = Audio.getPlaybackController("drop");
const failSound = Audio.getPlaybackController("fail");
const completeSound = Audio.getPlaybackController("complete");
const clickSound = Audio.getPlaybackController("click");
const switchSound = Audio.getPlaybackController("switch");
const spikesSound = Audio.getPlaybackController("spikes_off");
const removeSound = Audio.getPlaybackController("remove");
const popSound = Audio.getPlaybackController("pop");

// Game constants
const levels = require("./levels");
const gridSize = 0.36;
const gridInc = 0.12;
const numOfSwitches = 2;
const numOfBlocks = 10;
const numOfPlatforms = 10;
const blockSlotInc = 0.1;
const blockInitY = 0.9;
const initBlockSlot = 0.6;
const playerInitY = 0.02;
const states = { start: 1, running: 2, complete: 3, failed: 4, uncomplete: 5 };

// Game variables
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
let loopIterations = 2;
let exeIntervalID;
let obstacleActivated = true;
let loopAdded = false;
let endLoopAdded = false;
let obstacleRemoved = false;
let activateLoopFunctionality = false;
let isFirstRun = true;
let allCoordinates = createAllCoordinates();
let pathCoordinates = createPathCoordinates();
let dangerCoordinates = createDangerCoordinates();

CameraInfo.captureDevicePosition
  .monitor({ fireOnInitialValue: true })
  .subscribe(function(e) {
    if (e.newValue === "FRONT") {
      Instruction.bind(true, "switch_camera_view_to_place");
    } else {
      Instruction.bind(false, "switch_camera_view_to_place");
      Instruction.bind(true, "effect_include_sound");
    }
  });

Time.setTimeout(function() {
  Instruction.bind(false, "effect_include_sound");
}, 5000);

/*------------- Button Taps -------------*/

for (let i = 0; i < 9; i++) {
  let button = buttons.child("btn" + i);
  TouchGestures.onTap(button).subscribe(function() {
    switch (i) {
      case 0:
        addCommand("forward");
        break;
      case 1:
        addCommand("left");
        break;
      case 2:
        addCommand("right");
        break;
      case 3:
        if (!loopAdded && activateLoopFunctionality === true) {
          loopAdded = true;
          loopIterations = 2;
          addCommand("loop_2");
          setTexture(commands[findCommandIndex("loop_")].block, "loop_2_block");
          setTexture(buttons.child("btn3"), "loop_off");
        }
        break;
      case 4:
        if (!endLoopAdded && activateLoopFunctionality === true) {
          endLoopAdded = true;
          addCommand("end_loop");
          setTexture(buttons.child("btn4"), "end_loop_off");
        }
        break;
      case 5:
        setLoopIterations(2);
        break;
      case 6:
        setLoopIterations(3);
        break;
      case 7:
        setLoopIterations(4);
        break;
      case 8:
        // Call a different function based on current game state
        clickSound.setPlaying(true);
        clickSound.reset();
        switch (currentState) {
          case states.start:
            Time.setTimeout(function() {
              if (commands.length !== 0) executeCommands();
            }, 300);
            break;
          case states.failed:
            resetLevel();
            break;
          case states.uncomplete:
            resetLevel();
            break;
          case states.complete:
            nextLevel("next");
            break;
        }
        break;
    }
  });
}
TouchGestures.onTap(blocks.child("btn9")).subscribe(function() {
  // Remove the last command
  removeSound.setPlaying(true);
  removeSound.reset();
  if (blocksUsed !== 0 && currentState === states.start) {
    let popped = commands.pop();
    popped.block.transform.y = blockInitY;
    popped.block.hidden = true;
    nextBlockSlot += blockSlotInc;
    blocksUsed--;
    if (popped.command.search("loop_") !== -1) {
      loopAdded = false;
      setTexture(buttons.child("btn3"), "loop");
    } else if (popped.command === "end_loop") {
      endLoopAdded = false;
      setTexture(buttons.child("btn4"), "end_loop");
    }
  }
});

TouchGestures.onTap(congratsView).subscribe(function() {
  isFirstRun = false;
  nextLevel("back");
});

/*------------- Monitor Player Position -------------*/

Reactive.monitorMany({
  x: player.transform.x,
  z: player.transform.z
}).subscribe(({ newValues }) => {
  let playerX = newValues.x;
  let playerZ = newValues.z;
  let goalX = pathCoordinates[pathCoordinates.length - 1][0];
  let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
  let obstacleCoords = levels[currentLevel].obstacle;
  let collisionArea = 0.005;
  let maxBlocks = levels[currentLevel].blocks;

  // Check if player is on the goal
  if (
    isBetween(playerX, goalX + collisionArea, goalX - collisionArea) &&
    isBetween(playerZ, goalZ + collisionArea, goalZ - collisionArea)
  ) {
    player.transform.x = goalX;
    player.transform.z = goalZ;
    commands = [];
    executionCommands = [];
    Time.clearInterval(exeIntervalID);
    changeState(states.complete, "next");
    goal.hidden = true;
    animateLevelComplete();
    completeSound.setPlaying(true);
    completeSound.reset();

    if (currentLevel === 9) {
      animateUIGroup();
    }

    if (currentLevel === 0) {
      animateInstructionsViewHide();
    } else if (currentLevel === 3) {
      animateInstructionsViewHide();
    } else if (currentLevel === 5) {
      animateInstructionsViewHide();
    }

    if (blocksUsed > maxBlocks) {
      Diagnostics.log("You can also solve this with " + maxBlocks + " blocks.");
    }
  }

  // Check if player is on a danger zone
  for (let i = 0; i < dangerCoordinates.length; i++) {
    let dx = dangerCoordinates[i][0];
    let dz = dangerCoordinates[i][1];
    if (
      isBetween(playerX, dx + collisionArea, dx - collisionArea) &&
      isBetween(playerZ, dz + collisionArea, dz - collisionArea)
    ) {
      player.transform.x = dx;
      player.transform.z = dz;
      commands = [];
      executionCommands = [];
      Time.clearInterval(exeIntervalID);
      changeState(states.failed, "retry");
      animatePlayerFall();
      dropSound.setPlaying(true);
      dropSound.reset();
    }
  }

  if ("obstacle" in levels[currentLevel]) {
    // Check if player is on an obstacle
    let obstacleX = pathCoordinates[obstacleCoords][0];
    let obstacleZ = pathCoordinates[obstacleCoords][1];

    if (
      isBetween(
        playerX,
        obstacleX + collisionArea,
        obstacleX - collisionArea
      ) &&
      isBetween(
        playerZ,
        obstacleZ + collisionArea,
        obstacleZ - collisionArea
      ) &&
      obstacleActivated
    ) {
      player.transform.x = obstacleX;
      player.transform.z = obstacleZ;
      commands = [];
      executionCommands = [];
      Time.clearInterval(exeIntervalID);
      changeState(states.failed, "retry");
      animatePlayerSpikeDeath();
      failSound.setPlaying(true);
      failSound.reset();
    }

    // Check if player is on a switch
    let switchCoords = levels[currentLevel].switches;
    for (let i = 0; i < switchCoords.length; i++) {
      let sx = pathCoordinates[switchCoords[i]][0];
      let sz = pathCoordinates[switchCoords[i]][1];
      if (
        isBetween(playerX, sx + collisionArea, sx - collisionArea) &&
        isBetween(playerZ, sz + collisionArea, sz - collisionArea)
      ) {
        switchesAdded[i].activated = true;
        let s = switches.child("switch" + i);
        s.child("button").child("knob").transform.z = 0;
        player.transform.y = playerInitY + 0.015;
        if (
          s
            .child("button")
            .child("knob")
            .transform.z.pinLastValue() !== 0
        ) {
          switchSound.setPlaying(true);
          switchSound.reset();
        }
      }
    }

    // Remove obstacle if all switches are deactivated
    if (switchesAdded.every(val => val.activated === true)) {
      obstacleActivated = false;
      if (!obstacleRemoved) {
        obstacleRemoved = true;
        animateSpikes();
        Time.setTimeout(function() {
          spikesSound.setPlaying(true);
          spikesSound.reset();
        }, 100);
      }
    }
  }
});

/*------------- Create Level Coordinates -------------*/

function createAllCoordinates() {
  // Creates a 7 x 7 grid of coordinates
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
  // Get the current level path coordinates from all the coordinates
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
  // Get the danger coordinates by removing the current path coordinates
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

  // Set the player's initial position
  player.transform.x = pathCoordinates[0][0];
  player.transform.z = pathCoordinates[0][1];
  player.transform.y = playerInitY;

  // set goal position
  let goalX = pathCoordinates[pathCoordinates.length - 1][0];
  let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
  goal.transform.x = goalX;
  goal.transform.z = goalZ;
  goal.transform.y = 0.03;
  goal.hidden = false;

  // Set the player's initial direction
  if (playerDir === "east") {
    player.transform.rotationY = 0;
  } else if (playerDir === "north") {
    player.transform.rotationY = degreesToRadians(90);
  } else if (playerDir === "west") {
    player.transform.rotationY = degreesToRadians(180);
  } else if (playerDir === "south") {
    player.transform.rotationY = degreesToRadians(270);
  }

  // Add the path platforms
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
    // Add the obstacle
    let obstacleCoords = levels[currentLevel].obstacle;
    obstacle.transform.x = pathCoordinates[obstacleCoords][0];
    obstacle.transform.z = pathCoordinates[obstacleCoords][1];
    obstacle.transform.y = 0.03;
    obstacle.hidden = false;

    // Add the switches
    let switchCoords = levels[currentLevel].switches;
    for (let i = 0; i < switchCoords.length; i++) {
      let s = switches.child("switch" + switchesUsed++);
      s.transform.x = pathCoordinates[switchCoords[i]][0];
      s.transform.z = pathCoordinates[switchCoords[i]][1];
      s.transform.y = 0.03;
      switchesAdded.push({ switch: "switch" + switchesUsed, activated: false });
      s.hidden = false;
    }
  }

  if (currentLevel > 4) {
    activateLoopFunctionality = true;
    setTexture(buttons.child("btn3"), "loop");
    setTexture(buttons.child("btn4"), "end_loop");
    setTexture(buttons.child("btn5"), "loop_2");
    setTexture(buttons.child("btn6"), "loop_3");
    setTexture(buttons.child("btn7"), "loop_4");
  }

  Time.setTimeout(function() {
    if (currentLevel === 0) {
      setTexture(instructionsView, "in_0");
      if (!isFirstRun) {
        animateInstructionsViewShow();
      }
    } else if (currentLevel === 3) {
      setTexture(instructionsView, "in_1");
      animateInstructionsViewShow();
    } else if (currentLevel === 5) {
      setTexture(instructionsView, "in_2");
      animateInstructionsViewShow();
    }
  }, 1000);
}

initLevel();

/*------------- Add Command -------------*/

function addCommand(move) {
  if (currentState === states.start) {
    if (blocksUsed < numOfBlocks) {
      let block = blocks.child("block" + blocksUsed++);
      nextBlockSlot -= blockSlotInc;
      block.transform.y = nextBlockSlot;
      block.material = Materials.get(move + "_block_mat");
      block.hidden = false;
      commands.push({ command: move, block: block });
      clickSound.setPlaying(true);
      clickSound.reset();
    }
  }
}

/*------------- Execution functions -------------*/

function executeCommands() {
  currentState = states.running;
  let loopIndex = findCommandIndex("loop_");
  let endIndex = findCommandIndex("end_loop");

  if (loopIndex != undefined && endIndex != undefined) {
    if (endIndex < loopIndex) {
      //TODO: handle this visually later
      Diagnostics.log("loop block must go before the end loop block");
      currentState = states.start;
    } else {
      executionCommands = getLoopCommands(loopIndex, endIndex);
    }
  } else if (loopIndex != undefined && endIndex == undefined) {
    //TODO: handle this visually later
    Diagnostics.log("please end the loop");
    currentState = states.start;
  } else if (loopIndex == undefined && endIndex != undefined) {
    //TODO: handle this visually later
    Diagnostics.log("loop block not added");
    currentState = states.start;
  } else if (loopIndex == undefined && endIndex == undefined) {
    executionCommands = getNonLoopCommands();
  }

  setExecutionInterval(
    function(e) {
      animatePlayerMovement(executionCommands[e]);
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
      setTexture(buttons.child("btn8"), "retry");
      failSound.setPlaying(true);
      failSound.reset();
    }
  }, delay);
}

function getLoopCommands(loopIndex, endIndex) {
  let commandsToLoop = [];
  let dupCommands = [];
  let unDuplicatedLoop = [];
  let nonLoopCommands = getNonLoopCommands();

  // get loop commands
  for (let i = loopIndex; i < endIndex; i++) {
    commandsToLoop.push(commands[i].command);
  }
  commandsToLoop.shift();
  if (commandsToLoop.length === 0) {
    for (let i = 1; i >= 0; i--)
      nonLoopCommands.splice([loopIndex, endIndex][i], 1);

    if (nonLoopCommands.length === 0) {
      Diagnostics.log("loop is empty");
      currentState = states.start;
    }

    return nonLoopCommands;
  } else {
    // duplicate loop commands
    for (let i = 0; i < loopIterations; i++) {
      for (let j = 0; j < commandsToLoop.length; j++) {
        dupCommands.push(commandsToLoop[j]);
      }
    }
    // merge loop commands
    for (let i = loopIndex; i < endIndex + 1; i++) {
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

/*------------- Animations -------------*/

function animatePlayerMovement(command) {
  const timeDriverParameters = {
    durationMilliseconds: 400,
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

  const jump = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(playerInitY, 0.1),
        Animation.samplers.easeInOutSine(0.1, playerInitY)
      ],
      knots: [0, 1, 2]
    })
  );

  timeDriver.start();

  switch (command) {
    case "forward":
      player.transform.y = jump;
      jumpSound.setPlaying(true);
      jumpSound.reset();
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

function animatePlayerIdle() {
  const timeDriverParameters = {
    durationMilliseconds: 400,
    loopCount: Infinity,
    mirror: true
  };
  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const scale = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      player.transform.scaleY.pinLastValue(),
      player.transform.scaleY.pinLastValue() + 0.02
    )
  );

  player.transform.scaleY = scale;

  timeDriver.start();
}

animatePlayerIdle();

function animateLevelComplete() {
  const timeDriverParameters = {
    durationMilliseconds: 450,
    loopCount: 2,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const jump = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(playerInitY, 0.1),
        Animation.samplers.easeInOutSine(0.1, playerInitY)
      ],
      knots: [0, 1, 2]
    })
  );

  player.transform.y = jump;

  timeDriver.start();
}

function animateCarrot() {
  const timeDriverParameters = {
    durationMilliseconds: 2500,
    loopCount: Infinity,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const rotate = Animation.animate(
    timeDriver,
    Animation.samplers.linear(
      goal.transform.rotationY.pinLastValue(),
      goal.transform.rotationY.pinLastValue() - degreesToRadians(360)
    )
  );

  goal.transform.rotationY = rotate;

  timeDriver.start();
}

animateCarrot();

function emmitWaterParticles() {
  const sizeSampler = Animation.samplers.easeInQuad(0.015, 0.007);
  waterEmitter.transform.x = player.transform.x;
  waterEmitter.transform.z = player.transform.z;
  waterEmitter.birthrate = 500;
  waterEmitter.sizeModifier = sizeSampler;

  Time.setTimeout(function() {
    player.hidden = true;
    waterEmitter.birthrate = 0;
  }, 200);
}

function animatePlayerFall() {
  emmitWaterParticles();
  const timeDriverParameters = {
    durationMilliseconds: 100,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const moveY = Animation.animate(
    timeDriver,
    Animation.samplers.easeInOutSine(playerInitY - 0.1, -0.17)
  );

  player.transform.y = moveY;

  timeDriver.start();

  Time.setTimeout(function() {
    player.hidden = true;
  }, 200);
}

function animatePlayerSpikeDeath() {
  const timeDriverParameters = {
    durationMilliseconds: 500,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const deadY = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(
          player.transform.y.pinLastValue(),
          player.transform.y.pinLastValue() + 0.1
        ),
        Animation.samplers.easeInOutSine(
          player.transform.y.pinLastValue() + 0.1,
          playerInitY - 0.17
        )
      ],
      knots: [0, 1, 2]
    })
  );

  player.transform.y = deadY;

  timeDriver.start();

  Time.setTimeout(function() {
    player.hidden = true;
  }, 600);
}

function animateSpikes() {
  const timeDriverParameters = {
    durationMilliseconds: 400,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const moveY = Animation.animate(
    timeDriver,
    Animation.samplers.linear(obstacle.transform.y.pinLastValue(), -0.03)
  );

  obstacle.transform.y = moveY;

  timeDriver.start();
}

function animateUIGroup() {
  const timeDriverParameters = {
    durationMilliseconds: 600,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const scaleUI = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(0.3, 0.45),
        Animation.samplers.easeInOutSine(0.45, 0)
      ],
      knots: [0, 1, 2]
    })
  );

  UIGroup.transform.scaleX = scaleUI;
  UIGroup.transform.scaleY = scaleUI;

  timeDriver.start();

  Time.setTimeout(function() {
    animateCongrats();
  }, 700);
}

function animateCongrats() {
  popSound.setPlaying(true);
  popSound.reset();
  const timeDriverParameters = {
    durationMilliseconds: 200,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const scaleX = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(0, 4 + 1),
        Animation.samplers.easeInOutSine(4 + 1, 4)
      ],
      knots: [0, 1, 2]
    })
  );

  const scaleY = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(0, 2.8 + 1),
        Animation.samplers.easeInOutSine(2.8 + 1, 2.8)
      ],
      knots: [0, 1, 2]
    })
  );

  congratsView.transform.scaleX = scaleX;
  congratsView.transform.scaleY = scaleY;

  timeDriver.start();
}

function animateInstructionsViewHide() {
  const timeDriverParameters = {
    durationMilliseconds: 200,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const scale = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(10, 10 + 2),
        Animation.samplers.easeInOutSine(10 + 2, 0)
      ],
      knots: [0, 1, 2]
    })
  );

  instructionsView.transform.scaleX = scale;
  instructionsView.transform.scaleY = scale;

  timeDriver.start();
}

function animateInstructionsViewShow() {
  popSound.setPlaying(true);
  popSound.reset();
  const timeDriverParameters = {
    durationMilliseconds: 200,
    loopCount: 1,
    mirror: false
  };

  const timeDriver = Animation.timeDriver(timeDriverParameters);

  const scale = Animation.animate(
    timeDriver,
    Animation.samplers.sequence({
      samplers: [
        Animation.samplers.easeInOutSine(0, 10 + 2),
        Animation.samplers.easeInOutSine(10 + 2, 10)
      ],
      knots: [0, 1, 2]
    })
  );

  instructionsView.transform.scaleX = scale;
  instructionsView.transform.scaleY = scale;

  timeDriver.start();
}

/*------------- Reset current level -------------*/

function resetLevel() {
  currentState = states.start;
  playerDir = levels[currentLevel].facing;
  commands = [];
  executionCommands = [];
  switchesAdded = [];
  loopIterations = 2;
  blocksUsed = 0;
  platformsUsed = 0;
  switchesUsed = 0;
  nextBlockSlot = initBlockSlot;
  obstacleActivated = true;
  loopAdded = false;
  endLoopAdded = false;
  player.hidden = false;
  obstacleRemoved = false;
  setTexture(buttons.child("btn8"), "play");
  Time.clearInterval(exeIntervalID);

  for (let i = 0; i < numOfBlocks; i++) {
    let block = blocks.child("block" + i);
    block.transform.y = blockInitY;
    block.hidden = true;
  }

  for (let i = 0; i < numOfSwitches; i++) {
    let s = switches.child("switch" + i);
    s.child("button").child("knob").transform.z = -0.045;
  }

  initLevel();
}

/*------------- Go to next level -------------*/

function nextLevel(state) {
  if (state === "next") {
    currentLevel++;
  } else {
    currentLevel = 0;
    congratsView.transform.scaleX = 0;
    congratsView.transform.scaleY = 0;
    UIGroup.transform.scaleX = 0.3;
    UIGroup.transform.scaleY = 0.3;
    setTexture(buttons.child("btn4"), "end_loop");
    setTexture(buttons.child("btn3"), "loop");
  }

  allCoordinates = createAllCoordinates();
  pathCoordinates = createPathCoordinates();
  dangerCoordinates = createDangerCoordinates();

  for (let i = 0; i < numOfPlatforms; i++) {
    let platform = platforms.child("platform" + i);
    platform.hidden = true;
  }

  if ("obstacle" in levels[currentLevel] === false) {
    obstacle.transform.x = 0;
    obstacle.transform.z = 0;
    obstacle.hidden = true;

    for (let i = 0; i < numOfSwitches; i++) {
      let s = switches.child("switch" + i);
      s.transform.x = 0;
      s.transform.z = 0;
      s.hidden = true;
    }
  }

  resetLevel();
}

/*------------- Utils -------------*/

function degreesToRadians(degrees) {
  let pi = Math.PI;
  return degrees * (pi / 180);
}

function isBetween(n, a, b) {
  return (n - a) * (n - b) <= 0;
}

function setTexture(object, texture) {
  let signal = Textures.get(texture).signal;
  object.material.setTextureSlot("DIFFUSE", signal);
}

function setLoopIterations(i) {
  if (activateLoopFunctionality === true) {
    clickSound.setPlaying(true);
    clickSound.reset();
  }
  if (
    findCommandIndex("loop_") !== undefined &&
    activateLoopFunctionality === true
  ) {
    loopIterations = i;
    setTexture(
      commands[findCommandIndex("loop_")].block,
      "loop_" + i + "_block"
    );
  }
}

function findCommandIndex(command) {
  let index;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].command.search(command) !== -1) {
      index = i;
      break;
    }
  }
  return index;
}

function changeState(state, buttonText) {
  Time.setTimeout(function() {
    currentState = state;
    setTexture(buttons.child("btn8"), buttonText);
  }, 500);
}
