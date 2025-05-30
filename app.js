// Game Configuration
const gameConfig = {
    playerName: "Mason",
    scarerName: "Marina",
    maxScares: 10,
    gameTimeLimit: 300, // 5 minutes
    moveSpeed: 5,
    mouseSensitivity: 0.002,
    scareDistance: 4, // Slightly increased for more chances
    scareInterval: 7000, // Base interval for scare check
    scareVariance: 4000  // Random variance around the interval
};

// Game State
let gameState = {
    isPlaying: false,
    isPaused: false,
    score: 0,
    scareCount: 0,
    timeRemaining: gameConfig.gameTimeLimit,
    marinaPosition: null,
    marinaVisible: false,
    lastScareTime: 0,
    nextScareTime: 0
};

// Three.js variables
let scene, camera, renderer, canvas;
let player; // Player object containing position, velocity, etc.
let house = {}; // To potentially store references to room objects
let marina; // This will be Marina's 3D model (a THREE.Group)
let ambientSound, scareSound;

// Input handling
const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

// House layout from config
const houseLayout = {
    rooms: [
        {name: "Living Room", position: {x: 0, z: 0}, size: {width: 15, depth: 12}},
        {name: "Kitchen", position: {x: 15, z: 0}, size: {width: 10, depth: 8}},
        {name: "Bedroom", position: {x: 0, z: 12}, size: {width: 12, depth: 10}},
        {name: "Bathroom", position: {x: 12, z: 12}, size: {width: 6, depth: 6}}
    ],
    hidingSpots: [ // y: 0 is ground level for Marina's base
        {name: "Behind Couch", position: {x: -5, y: 0, z: 2}},
        {name: "Kitchen Cabinet", position: {x: 18, y: 0, z: 3}},
        {name: "Bedroom Closet", position: {x: 3, y: 0, z: 15}},
        {name: "Bathroom Door", position: {x: 14, y: 0, z: 14}},
        {name: "Living Room Corner", position: {x: -7, y: 0, z: -5}},
        {name: "End of Hallway", position: {x: 7, y:0, z: 10}},
        {name: "Near Kitchen Entrance", position: {x: 13, y:0, z: -2}}
    ]
};

// Initialize game
function init() {
    console.log("Initializing game...");
    setupEventListeners();
    setupAudio();
    showStartScreen();
}

function setupEventListeners() {
    console.log("Setting up event listeners...");

    const startButton = document.getElementById('startButton');
    if (startButton) {
        console.log("Start button element found.");
        startButton.addEventListener('click', () => {
            console.log("Start button clicked!");
            startGame();
        });
    } else {
        console.error("Start button element NOT found!");
    }

    const restartButton = document.getElementById('restartButton');
    if (restartButton) {
        console.log("Restart button element found.");
        restartButton.addEventListener('click', () => {
            console.log("Restart button clicked!");
            restartGame();
        });
    } else {
        console.error("Restart button element NOT found!");
    }

    const resumeButton = document.getElementById('resumeButton');
    if (resumeButton) {
        console.log("Resume button element found.");
        resumeButton.addEventListener('click', () => {
            console.log("Resume button clicked!");
            resumeGame();
        });
    } else {
        console.error("Resume button element NOT found!");
    }

    const mainMenuButton = document.getElementById('mainMenuButton');
    if (mainMenuButton) {
        console.log("Main Menu button element found.");
        mainMenuButton.addEventListener('click', () => {
            console.log("Main Menu button clicked!");
            showStartScreen();
        });
    } else {
        console.error("Main Menu button element NOT found!");
    }

    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', updateVolume);
    } else {
        console.error("Volume slider element NOT found!");
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
}

function setupAudio() {
    console.log("Setting up audio...");
    if (!(window.AudioContext || window.webkitAudioContext)) {
        console.warn("Web Audio API is not supported in this browser.");
        // Create dummy sound objects if AudioContext is not available
        ambientSound = { play: () => {}, stop: () => {}, setVolume: () => {}, volume: 0, context: { state: 'closed', resume: () => Promise.resolve()} };
        scareSound = { play: () => {}, setVolume: () => {}, volume: 0 };
        return;
    }

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        ambientSound = {
            context: audioContext,
            volume: 0.05, // Reduced default ambient volume
            oscillator: null,
            gainNode: null,
            play: function() {
                if (this.oscillator || this.context.state === 'closed') return;
                if (this.context.state === 'suspended') {
                    this.context.resume().then(() => this._playSound());
                } else {
                    this._playSound();
                }
            },
            _playSound: function() {
                this.oscillator = this.context.createOscillator();
                this.gainNode = this.context.createGain();

                this.oscillator.type = 'sine';
                this.oscillator.frequency.setValueAtTime(50, this.context.currentTime); // Low hum
                this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);

                this.oscillator.connect(this.gainNode);
                this.gainNode.connect(this.context.destination);

                this.oscillator.start();
            },
            stop: function() {
                if (this.oscillator) {
                    this.oscillator.stop();
                    this.oscillator.disconnect(); // Important to disconnect nodes
                    if (this.gainNode) this.gainNode.disconnect();
                    this.oscillator = null;
                    this.gainNode = null;
                }
            },
            setVolume: function(vol) {
                this.volume = vol;
                if (this.gainNode && this.context.state !== 'closed') {
                    this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
                }
            }
        };

        scareSound = {
            context: audioContext,
            volume: 0.4, // Slightly reduced scare volume
            play: function() {
                if (this.context.state === 'closed') return;
                if (this.context.state === 'suspended') {
                    this.context.resume().then(() => this._playSound());
                } else {
                    this._playSound();
                }
            },
            _playSound: function() {
                const oscillator = this.context.createOscillator();
                const gainNode = this.context.createGain();

                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(200, this.context.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.08); // Faster ramp
                oscillator.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.4); // Shorter sound

                gainNode.gain.setValueAtTime(0, this.context.currentTime);
                gainNode.gain.linearRampToValueAtTime(this.volume, this.context.currentTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.4);

                oscillator.connect(gainNode);
                gainNode.connect(this.context.destination);

                oscillator.start();
                oscillator.stop(this.context.currentTime + 0.4); // Stop after 0.4 seconds
            },
             setVolume: function(vol) {
                this.volume = vol;
            }
        };
         console.log("Audio setup complete.");
    } catch (e) {
        console.error('Error initializing audio:', e);
        ambientSound = { play: () => {}, stop: () => {}, setVolume: () => {}, volume: 0, context: { state: 'closed', resume: () => Promise.resolve()} };
        scareSound = { play: () => {}, setVolume: () => {}, volume: 0 };
    }
}


function setup3D() {
    console.log("Setting up 3D environment...");
    canvas = document.getElementById('gameCanvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // Darker background
    scene.fog = new THREE.Fog(0x1a1a1a, 15, 40); // Fog closer

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Player's eye height. Player object will manage camera's position.
    camera.position.set(0, 1.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    setupLighting();
    createHouse();
    createMarina(); // Create Marina's model
    setupPlayer(); // Setup player state, including camera reference

    window.addEventListener('resize', onWindowResize);
    console.log("3D environment setup complete.");
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x303030); // Dimmer ambient
    scene.add(ambientLight);

    // A central point light for general illumination
    const mainLight = new THREE.PointLight(0xffeedd, 0.7, 30); // Warmer, slightly less intense point light
    mainLight.position.set(5, 8, 5); // Position it high in the house
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024; // Optimized shadow map
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    scene.add(mainLight);
}

function createHouse() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(60, 60); // Larger floor to ensure it covers house area
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x5D4037 }); // Darker wood
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    floor.receiveShadow = true;
    scene.add(floor);

    // Create rooms based on layout
    houseLayout.rooms.forEach(roomData => createRoom(roomData));
    addFurniture(); // Add furniture after rooms are defined
}

function createRoom(roomData) {
    const wallHeight = 5; // Lower ceiling for a more claustrophobic feel
    const wallThickness = 0.2;
    // A more realistic wall material
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xADA9A0, // Off-white/beige
        roughness: 0.8,
        metalness: 0.1
    });

    const roomGroup = new THREE.Group();
    // Position the room group according to its definition in houseLayout
    roomGroup.position.set(roomData.position.x, 0, roomData.position.z);

    // Walls are created relative to the roomGroup's origin (0,0,0)
    // North wall (far Z)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(roomData.size.width, wallHeight, wallThickness), wallMaterial);
    northWall.position.set(roomData.size.width / 2, wallHeight / 2, roomData.size.depth);
    northWall.castShadow = true; northWall.receiveShadow = true;
    roomGroup.add(northWall);

    // South wall (near Z - at the room's origin z)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(roomData.size.width, wallHeight, wallThickness), wallMaterial);
    southWall.position.set(roomData.size.width / 2, wallHeight / 2, 0); // At z=0 relative to roomGroup
    southWall.castShadow = true; southWall.receiveShadow = true;
    roomGroup.add(southWall);

    // East wall (positive X)
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomData.size.depth), wallMaterial);
    eastWall.position.set(roomData.size.width, wallHeight / 2, roomData.size.depth / 2);
    eastWall.castShadow = true; eastWall.receiveShadow = true;
    roomGroup.add(eastWall);

    // West wall (negative X - at the room's origin x)
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomData.size.depth), wallMaterial);
    westWall.position.set(0, wallHeight / 2, roomData.size.depth / 2); // At x=0 relative to roomGroup
    westWall.castShadow = true; westWall.receiveShadow = true;
    roomGroup.add(westWall);

    scene.add(roomGroup);
    house[roomData.name] = roomGroup; // Store reference if needed
}


function addFurniture() {
    const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 }); // Dark wood like color

    // Living Room Furniture (assuming Living Room is at global 0,0,0)
    // Couch
    const couchGeometry = new THREE.BoxGeometry(4, 1.5, 2); // width, height, depth
    const couch = new THREE.Mesh(couchGeometry, furnitureMaterial);
    couch.position.set(-3, 0.75, 2); // Positioned within the conceptual living room space
    couch.castShadow = true;
    scene.add(couch);

    // Coffee Table
    const tableGeometry = new THREE.BoxGeometry(2, 0.8, 1);
    const table = new THREE.Mesh(tableGeometry, furnitureMaterial);
    table.position.set(-1, 0.4, 3);
    table.castShadow = true;
    scene.add(table);

    // Kitchen Furniture (Kitchen starts at global x:15, z:0)
    // Counter
    const counterGeometry = new THREE.BoxGeometry(8, 1.5, 2); // A long counter
    const counter = new THREE.Mesh(counterGeometry, furnitureMaterial);
    counter.position.set(15 + 4, 0.75, 0 + 1); // Positioned within the kitchen (19, 0.75, 1)
    counter.castShadow = true;
    scene.add(counter);

    // Bedroom Furniture (Bedroom starts at global x:0, z:12)
    // Bed
    const bedGeometry = new THREE.BoxGeometry(3, 1, 6); // Single bed size
    const bed = new THREE.Mesh(bedGeometry, furnitureMaterial);
    bed.position.set(0 + 1.5, 0.5, 12 + 3); // Positioned within the bedroom (1.5, 0.5, 15)
    bed.castShadow = true;
    scene.add(bed);

    // Closet (can be near bedroom or a general closet)
    const closetGeometry = new THREE.BoxGeometry(2, 4, 1); // Tall closet, matches new wall height
    const closet = new THREE.Mesh(closetGeometry, furnitureMaterial);
    closet.position.set(0 + 4, 2, 12 + 0.5); // Example: (4, 2, 12.5) - Adjust as needed
    closet.castShadow = true;
    scene.add(closet);
}

function createMarina() {
    const marinaGroup = new THREE.Group();

    // Body (simple cylinder) - Pinkish color
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xFF8FAB, roughness: 0.6 }); // Light Pink
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.4, 16); // topRad, bottomRad, height, radialSegments
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7; // Base of cylinder on ground (height/2)
    body.castShadow = true;
    marinaGroup.add(body);

    // Head (sphere) - Light brown/tan for skin
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xC68642, roughness: 0.5 }); // Tan/Light-medium brown
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16); // radius, widthSegments, heightSegments
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.4 + 0.25; // Position on top of body (body height + head radius)
    head.castShadow = true;
    marinaGroup.add(head);

    // Hair (another sphere, slightly larger, flattened, dark brown/black)
    // For "short hair", we can use a smaller part of a sphere or a flattened cap.
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x3B2A24, roughness: 0.4 }); // Dark Brown
    const hairGeometry = new THREE.SphereGeometry(0.28, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.5); // cap like
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = head.position.y + 0.05; // Slightly above head center
    hair.scale.set(1, 0.7, 1); // Flatten it a bit for a "cap" look
    hair.rotation.x = -Math.PI / 10; // Tilt slightly forward
    hair.castShadow = true;
    marinaGroup.add(hair);

    marina = marinaGroup;
    marina.visible = false; // Start hidden
    scene.add(marina);

    hideMarina(); // Initial placement
}


function setupPlayer() {
    player = {
        position: camera.position, // Player's position IS the camera's position
        velocity: new THREE.Vector3(),
        canMove: true, // Whether player can currently move
        isScared: false // To prevent movement during scare animation
    };
    // Set initial player position (which also sets camera position)
    player.position.set(2, 1.6, -2); // Start in a less central spot in living room
}

function startGame() {
    console.log("startGame function called.");
    hideAllScreens();
    document.getElementById('gameUI').classList.remove('hidden');
    document.getElementById('volumeControl').classList.remove('hidden');

    if (!scene) { // Only setup 3D if it hasn't been done
        setup3D();
    } else { // If 3D already exists, just reset positions/states
        setupPlayer(); // Resets player/camera position
    }


    // Reset game state
    gameState = {
        isPlaying: true,
        isPaused: false,
        score: 0,
        scareCount: 0,
        timeRemaining: gameConfig.gameTimeLimit,
        marinaPosition: null, // Will be set by hideMarina
        marinaVisible: false,
        lastScareTime: 0,
        nextScareTime: Date.now() + getRandomScareDelay()
    };

    camera.rotation.set(0,0,0); // Reset camera rotation too

    updateUI();
    hideMarina(); // Place Marina at a random spot

    // Start audio
    if (ambientSound && ambientSound.context.state === 'suspended') {
        ambientSound.context.resume().then(() => {
            if(ambientSound.play) ambientSound.play();
        });
    } else if (ambientSound && ambientSound.play) {
        ambientSound.play();
    }

    lastTime = 0; // Reset for gameLoop deltaTime calculation
    gameLoop(); // Start the game loop

    // Request pointer lock after a short delay to allow the game to initialize
    setTimeout(requestPointerLock, 100);
}

function restartGame() {
    console.log("restartGame function called.");
    endGame("Restarting game..."); // Clean up current game state properly
    startGame(); // Then start a new game
}

function pauseGame() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    console.log("pauseGame function called.");
    gameState.isPaused = true;
    player.canMove = false; // Also stop movement input processing while paused
    document.getElementById('pauseScreen').classList.remove('hidden');
    document.exitPointerLock(); // Release pointer lock when paused
}

function resumeGame() {
    if (!gameState.isPlaying || !gameState.isPaused) return;
    console.log("resumeGame function called.");
    gameState.isPaused = false;
    player.canMove = true;
    document.getElementById('pauseScreen').classList.add('hidden');
    requestPointerLock(); // Re-request pointer lock when resuming
}

function endGame(reason) {
    console.log("endGame function called. Reason:", reason);
    gameState.isPlaying = false; // This will stop the gameLoop
    gameState.isPaused = false; // Ensure not stuck in paused state
    player.canMove = false;

    // Hide game elements and show game over screen
    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('volumeControl').classList.add('hidden');
    document.getElementById('scareMessage').classList.add('hidden'); // Ensure scare message is hidden

    // Stop ambient sound
    if (ambientSound && ambientSound.stop) {
        ambientSound.stop();
    }

    // Update final stats on the game over screen
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalScares').textContent = gameState.scareCount;
    document.getElementById('gameOverReason').textContent = reason;

    document.getElementById('gameOverScreen').classList.remove('hidden');
    if (document.pointerLockElement === canvas) { // Only exit if it's currently locked
        document.exitPointerLock();
    }
}

function showStartScreen() {
    console.log("showStartScreen function called.");
    hideAllScreens();
    document.getElementById('startScreen').classList.remove('hidden');
    gameState.isPlaying = false;
    gameState.isPaused = false;
    if(player) player.canMove = false; // Ensure player can't move on start screen

    if (ambientSound && ambientSound.stop) {
        ambientSound.stop();
    }

    // Release pointer lock if it's held
    if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
}

function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
        if (!screen.classList.contains('hidden')) {
            screen.classList.add('hidden');
        }
    });
}

function getRandomScareDelay() {
    // Returns a random delay in milliseconds
    return gameConfig.scareInterval + (Math.random() - 0.5) * gameConfig.scareVariance * 2;
}

function hideMarina() {
    if (marina) { // Check if marina model exists
        marina.visible = false;
    }
    gameState.marinaVisible = false;

    // Choose a random hiding spot
    const spotIndex = Math.floor(Math.random() * houseLayout.hidingSpots.length);
    const spot = houseLayout.hidingSpots[spotIndex];
    gameState.marinaPosition = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z); // Ensure it's a Vector3

    if (marina) {
      marina.position.copy(gameState.marinaPosition); // Move the 3D model to the spot
    }
    // console.log("Marina hidden at:", spot.name, gameState.marinaPosition);
}

function showMarina() {
    if (!marina || !player || !gameState.marinaPosition) return; // Safety checks

    console.log("showMarina triggered!");
    marina.position.copy(gameState.marinaPosition); // Make sure she's at the hiding spot
    marina.lookAt(player.position); // Make Marina face the player
    marina.visible = true;
    gameState.marinaVisible = true;
    player.isScared = true; // Player is temporarily in "scared" state
    player.canMove = false; // Player cannot move during scare

    if (scareSound && scareSound.play) {
        scareSound.play();
    }

    const scareMessage = document.getElementById('scareMessage');
    scareMessage.classList.remove('hidden');

    // After the scare message duration, hide Marina and allow player movement
    setTimeout(() => {
        scareMessage.classList.add('hidden');
        hideMarina();
        player.isScared = false;
        if(gameState.isPlaying && !gameState.isPaused) { // Only re-enable if game is active
            player.canMove = true;
            requestPointerLock(); // Try to re-acquire pointer lock if lost
        }
    }, 2000); // Duration of scare message visibility

    gameState.score -= 50; // Lose points for being scared
    if (gameState.score < 0) gameState.score = 0;
    gameState.scareCount++;
    gameState.lastScareTime = Date.now();
    gameState.nextScareTime = Date.now() + getRandomScareDelay(); // Schedule next potential scare

    updateUI();

    // Check if game over condition (max scares) is met
    if (gameState.scareCount >= gameConfig.maxScares) {
        endGame(`Marina scared you ${gameConfig.maxScares} times! She wins!`);
    }
}

function checkScareCondition() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.marinaVisible || !player || !gameState.marinaPosition || player.isScared) {
        return;
    }

    const now = Date.now();
    if (now < gameState.nextScareTime) { // Not time for a scare yet
        return;
    }

    // Check distance to Marina's current (hidden) position
    const playerPos = player.position;
    const marinaHidingPos = gameState.marinaPosition;
    const distance = playerPos.distanceTo(marinaHidingPos);

    // console.log(`Checking scare: Dist: ${distance.toFixed(2)}, ScareDist: ${gameConfig.scareDistance}`);

    if (distance < gameConfig.scareDistance) {
        // Add a small random chance even if conditions are met, to make it less predictable
        if (Math.random() < 0.75) { // 75% chance to scare if close and time is right
            showMarina();
        } else {
            // Player was lucky, reset for a shorter delay for next check
            gameState.nextScareTime = Date.now() + getRandomScareDelay() / 2;
        }
    }
}

// For smooth movement, we need a deltaTime in the game loop
let lastTime = 0;
function gameLoop(currentTime) {
    if (!gameState.isPlaying) {
        // console.log("Game loop stopping because isPlaying is false.");
        return; // Stop the loop if the game is not playing
    }
    requestAnimationFrame(gameLoop); // Request the next frame

    const deltaTime = (currentTime - (lastTime || currentTime)) / 1000; // Time difference in seconds
    lastTime = currentTime;

    if (!gameState.isPaused) {
        updateMovement(deltaTime); // Pass deltaTime for frame-rate independent movement
        updateGameTimer(deltaTime); // Update game timer using deltaTime
        checkScareCondition(); // Handles its own timing logic
        updateUI(); // Update HUD elements
    }

    // Render the scene
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}


function updateMovement(deltaTime) {
    if (!gameState.isPlaying || gameState.isPaused || !player.canMove || player.isScared) return;

    const speed = gameConfig.moveSpeed * deltaTime; // Adjusted speed based on deltaTime
    const moveDirection = new THREE.Vector3(); // Vector to store movement direction

    if (keys.w) moveDirection.z = -1;
    if (keys.s) moveDirection.z = 1;
    if (keys.a) moveDirection.x = -1;
    if (keys.d) moveDirection.x = 1;

    if (moveDirection.lengthSq() > 0) { // Use lengthSq for efficiency, avoids sqrt
        moveDirection.normalize(); // Ensure consistent speed in all directions

        // Apply camera's Y-axis rotation to the movement direction
        // This makes 'W' move where the camera is looking (on the horizontal plane)
        const euler = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
        moveDirection.applyEuler(euler);

        player.position.addScaledVector(moveDirection, speed);

        // Simple boundary collision (can be improved with actual collision detection)
        // These bounds should roughly match your house's extent
        player.position.x = Math.max(-28, Math.min(28, player.position.x));
        player.position.z = Math.max(-28, Math.min(28, player.position.z));
        camera.position.y = 1.6; // Ensure player (camera) doesn't "fly" or "sink"
    }
}

function updateGameTimer(deltaTime) {
    // gameState.isPlaying and gameState.isPaused are already checked in gameLoop
    gameState.timeRemaining -= deltaTime; // Subtract passed time

    if (gameState.timeRemaining <= 0) {
        gameState.timeRemaining = 0; // Clamp at zero
        updateUI(); // Update UI one last time to show 0:00
        endGame("Time's up! You survived Marina's scares (for now)!");
    }
}

function updateUI() {
    document.getElementById('scoreDisplay').textContent = gameState.score;
    document.getElementById('scaresDisplay').textContent = `${gameState.scareCount}/${gameConfig.maxScares}`;

    const time = Math.max(0, gameState.timeRemaining); // Ensure time doesn't go negative in display
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    document.getElementById('timeDisplay').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}


// Event handlers
function onKeyDown(event) {
    if (!gameState.isPlaying) return; // Don't process keys if game not active (e.g. on start screen)

    switch(event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Escape':
            event.preventDefault(); // Prevent default ESC behavior (like exiting pointer lock)
            if (gameState.isPaused) {
                resumeGame();
            } else {
                pauseGame();
            }
            break;
    }
}

function onKeyUp(event) {
    switch(event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
    }
}

function onMouseMove(event) {
    // Only rotate camera if game is playing, not paused, and pointer is locked
    if (!gameState.isPlaying || gameState.isPaused || document.pointerLockElement !== canvas) {
        return;
    }

    const sensitivity = gameConfig.mouseSensitivity;
    // Yaw (left/right) rotation around the camera's Y-axis
    camera.rotation.y -= event.movementX * sensitivity;

    // Pitch (up/down) rotation around the camera's X-axis
    camera.rotation.x -= event.movementY * sensitivity;

    // Clamp the vertical (pitch) rotation to prevent looking too far up or down
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
}

function requestPointerLock() {
    if (canvas && gameState.isPlaying && !gameState.isPaused) {
        canvas.requestPointerLock()
          .then(() => console.log("Pointer lock successfully requested via promise."))
          .catch(err => console.warn("Pointer lock request failed via promise:", err.name, err.message));
    } else {
        // console.log("Pointer lock not requested. Game playing:", gameState.isPlaying, "Paused:", gameState.isPaused);
    }
}

function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
        console.log("Pointer lock acquired.");
        // Player movement is enabled/disabled based on gameState.isPaused and player.canMove,
        // not directly by pointer lock status alone.
    } else {
        console.log("Pointer lock released.");
        // If the game is active and not intentionally paused by the user,
        // automatically pause it when pointer lock is lost (e.g., Alt+Tab).
        if (gameState.isPlaying && !gameState.isPaused) {
            // pauseGame(); // This line can be disruptive. User might lose lock for many reasons.
            console.log("Pointer lock was lost during active gameplay. Game remains active unless user pauses.");
        }
    }
}

function onPointerLockError(event) {
    console.warn("Pointer lock error event:", event);
}

function onWindowResize() {
    if (!camera || !renderer) return; // Ensure three.js components are initialized

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    console.log("Window resized.");
}

function updateVolume(event) {
    const volume = parseFloat(event.target.value);
    if (ambientSound && ambientSound.setVolume) ambientSound.setVolume(volume * 0.2); // Max 20% for ambient
    if (scareSound && scareSound.setVolume) scareSound.setVolume(volume * 0.8); // Max 80% for scare
    // console.log("Volume updated to:", volume);
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);
