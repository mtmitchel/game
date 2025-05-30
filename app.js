// Game Configuration
const gameConfig = {
    playerName: "Mason",
    scarerName: "Marina",
    maxScares: 10,
    gameTimeLimit: 300, // 5 minutes
    moveSpeed: 5,
    mouseSensitivity: 0.002,
    scareDistance: 4,
    scareInterval: 7000,
    scareVariance: 4000
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
    hidingSpots: [
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
        startButton.addEventListener('click', startGame);
    } else {
        console.error("Start button element NOT found!");
    }

    const restartButton = document.getElementById('restartButton');
    if (restartButton) {
        restartButton.addEventListener('click', restartGame);
    } else {
        console.error("Restart button element NOT found!");
    }

    const resumeButton = document.getElementById('resumeButton');
    if (resumeButton) {
        resumeButton.addEventListener('click', resumeGame);
    } else {
        console.error("Resume button element NOT found!");
    }

    const mainMenuButton = document.getElementById('mainMenuButton');
    if (mainMenuButton) {
        mainMenuButton.addEventListener('click', showStartScreen);
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
    document.addEventListener('keyup', onKeyUp); // Added missing listener registration
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    window.addEventListener('resize', onWindowResize); // Added missing listener registration
}

function setupAudio() {
    console.log("Setting up audio...");
    if (!(window.AudioContext || window.webkitAudioContext)) {
        console.warn("Web Audio API is not supported in this browser.");
        ambientSound = { play: () => {}, stop: () => {}, setVolume: () => {}, volume: 0, context: { state: 'closed', resume: () => Promise.resolve()} };
        scareSound = { play: () => {}, setVolume: () => {}, volume: 0 };
        return;
    }

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        ambientSound = {
            context: audioContext,
            volume: 0.05,
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
                this.oscillator.frequency.setValueAtTime(50, this.context.currentTime);
                this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
                this.oscillator.connect(this.gainNode);
                this.gainNode.connect(this.context.destination);
                this.oscillator.start();
            },
            stop: function() {
                if (this.oscillator) {
                    this.oscillator.stop();
                    this.oscillator.disconnect();
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
            volume: 0.4,
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
                oscillator.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.08);
                oscillator.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.4);
                gainNode.gain.setValueAtTime(0, this.context.currentTime);
                gainNode.gain.linearRampToValueAtTime(this.volume, this.context.currentTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.4);
                oscillator.connect(gainNode);
                gainNode.connect(this.context.destination);
                oscillator.start();
                oscillator.stop(this.context.currentTime + 0.4);
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

function updateVolume(event) {
    const volumeValue = parseFloat(event.target.value);
    if (ambientSound && typeof ambientSound.setVolume === 'function') {
        ambientSound.setVolume(volumeValue * 0.1); // Ambient sound is usually quieter
    }
    if (scareSound && typeof scareSound.setVolume === 'function') {
        scareSound.setVolume(volumeValue);
    }
    console.log("Volume updated to:", volumeValue);
}


function setup3D() {
    console.log("Setting up 3D environment...");
    canvas = document.getElementById('gameCanvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 15, 40);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Initial camera position, player object will update this

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    setupLighting();
    createHouse();
    createMarina();
    setupPlayer();

    // Note: window resize listener is added in setupEventListeners
    console.log("3D environment setup complete.");
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x303030);
    scene.add(ambientLight);

    const mainLight = new THREE.PointLight(0xffeedd, 0.7, 30);
    mainLight.position.set(5, 8, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    scene.add(mainLight);
}

function createHouse() {
    const floorGeometry = new THREE.PlaneGeometry(60, 60);
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x5D4037 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    houseLayout.rooms.forEach(roomData => createRoom(roomData));
    addFurniture();
}

function createRoom(roomData) {
    const wallHeight = 5;
    const wallThickness = 0.2;
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xADA9A0,
        roughness: 0.8,
        metalness: 0.1
    });

    const roomGroup = new THREE.Group();
    roomGroup.position.set(roomData.position.x, 0, roomData.position.z);

    // North wall (far Z)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(roomData.size.width, wallHeight, wallThickness), wallMaterial);
    northWall.position.set(roomData.size.width / 2, wallHeight / 2, roomData.size.depth);
    northWall.castShadow = true; northWall.receiveShadow = true;
    roomGroup.add(northWall);

    // South wall (near Z)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(roomData.size.width, wallHeight, wallThickness), wallMaterial);
    southWall.position.set(roomData.size.width / 2, wallHeight / 2, 0);
    southWall.castShadow = true; southWall.receiveShadow = true;
    roomGroup.add(southWall);

    // East wall (positive X)
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomData.size.depth), wallMaterial);
    eastWall.position.set(roomData.size.width, wallHeight / 2, roomData.size.depth / 2);
    eastWall.castShadow = true; eastWall.receiveShadow = true;
    roomGroup.add(eastWall);

    // West wall (negative X)
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomData.size.depth), wallMaterial);
    westWall.position.set(0, wallHeight / 2, roomData.size.depth / 2);
    westWall.castShadow = true; westWall.receiveShadow = true;
    roomGroup.add(westWall);

    scene.add(roomGroup);
    house[roomData.name] = roomGroup;
}

function addFurniture() {
    const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });

    const couchGeometry = new THREE.BoxGeometry(4, 1.5, 2);
    const couch = new THREE.Mesh(couchGeometry, furnitureMaterial);
    couch.position.set(-3, 0.75, 2);
    couch.castShadow = true;
    scene.add(couch);

    const tableGeometry = new THREE.BoxGeometry(2, 0.8, 1);
    const table = new THREE.Mesh(tableGeometry, furnitureMaterial);
    table.position.set(-1, 0.4, 3);
    table.castShadow = true;
    scene.add(table);

    const counterGeometry = new THREE.BoxGeometry(8, 1.5, 2);
    const counter = new THREE.Mesh(counterGeometry, furnitureMaterial);
    counter.position.set(15 + 4, 0.75, 0 + 1);
    counter.castShadow = true;
    scene.add(counter);

    const bedGeometry = new THREE.BoxGeometry(3, 1, 6);
    const bed = new THREE.Mesh(bedGeometry, furnitureMaterial);
    bed.position.set(0 + 1.5, 0.5, 12 + 3);
    bed.castShadow = true;
    scene.add(bed);

    const closetGeometry = new THREE.BoxGeometry(2, 4, 1);
    const closet = new THREE.Mesh(closetGeometry, furnitureMaterial);
    closet.position.set(0 + 4, 2, 12 + 0.5);
    closet.castShadow = true;
    scene.add(closet);
}

function createMarina() {
    const marinaGroup = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xFF8FAB, roughness: 0.6 });
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.4, 16);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    body.castShadow = true;
    marinaGroup.add(body);

    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xC68642, roughness: 0.5 });
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.4 + 0.25;
    head.castShadow = true;
    marinaGroup.add(head);

    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x3B2A24, roughness: 0.4 });
    const hairGeometry = new THREE.SphereGeometry(0.28, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.5);
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = head.position.y + 0.05;
    hair.scale.set(1, 0.7, 1);
    hair.rotation.x = -Math.PI / 10;
    hair.castShadow = true;
    marinaGroup.add(hair);

    marina = marinaGroup;
    marina.visible = false;
    scene.add(marina);
    hideMarina();
}

function setupPlayer() {
    player = {
        position: camera.position, // Player's position IS the camera's position
        velocity: new THREE.Vector3(),
        canMove: true,
        isScared: false
    };
    player.position.set(2, 1.6, -2); // Initial player/camera position
}

function startGame() {
    console.log("startGame function called.");
    hideAllScreens();
    document.getElementById('gameUI').classList.remove('hidden');
    document.getElementById('volumeControl').classList.remove('hidden');

    if (!scene) {
        setup3D();
    } else {
        setupPlayer(); // Reset player/camera position for restart
    }

    gameState = {
        isPlaying: true,
        isPaused: false,
        score: 0,
        scareCount: 0,
        timeRemaining: gameConfig.gameTimeLimit,
        marinaPosition: null,
        marinaVisible: false,
        lastScareTime: 0,
        nextScareTime: Date.now() + getRandomScareDelay()
    };

    camera.rotation.set(0,0,0); // Reset camera rotation

    updateUI();
    hideMarina();

    if (ambientSound && ambientSound.context.state === 'suspended') {
        ambientSound.context.resume().then(() => {
            if(ambientSound.play) ambientSound.play();
        });
    } else if (ambientSound && ambientSound.play) {
        ambientSound.play();
    }

    lastTime = performance.now(); // Initialize lastTime for gameLoop
    gameLoop();

    setTimeout(requestPointerLock, 100); // Request pointer lock after a short delay
}

function restartGame() {
    console.log("restartGame function called.");
    endGame("Restarting game..."); // Clean up current game state
    startGame(); // Start a new game
}

function pauseGame() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    console.log("pauseGame function called.");
    gameState.isPaused = true;
    player.canMove = false;
    document.getElementById('pauseScreen').classList.remove('hidden');
    document.exitPointerLock();
}

function resumeGame() {
    if (!gameState.isPlaying || !gameState.isPaused) return;
    console.log("resumeGame function called.");
    gameState.isPaused = false;
    player.canMove = true;
    document.getElementById('pauseScreen').classList.add('hidden');
    requestPointerLock();
    lastTime = performance.now(); // Reset lastTime when resuming to avoid large deltaTime jump
}

function endGame(reason) {
    console.log("endGame function called. Reason:", reason);
    gameState.isPlaying = false;
    gameState.isPaused = false; // Ensure not stuck in paused state
    if(player) player.canMove = false;


    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('volumeControl').classList.add('hidden');
    document.getElementById('scareMessage').classList.add('hidden');

    if (ambientSound && ambientSound.stop) {
        ambientSound.stop();
    }

    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalScares').textContent = gameState.scareCount;
    document.getElementById('gameOverReason').textContent = reason;

    document.getElementById('gameOverScreen').classList.remove('hidden');
    if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
}

function showStartScreen() {
    console.log("showStartScreen function called.");
    hideAllScreens();
    document.getElementById('startScreen').classList.remove('hidden');
    gameState.isPlaying = false;
    gameState.isPaused = false;
    if(player) player.canMove = false;

    if (ambientSound && ambientSound.stop) {
        ambientSound.stop();
    }

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
    return gameConfig.scareInterval + (Math.random() - 0.5) * gameConfig.scareVariance * 2;
}

function hideMarina() {
    if (marina) {
        marina.visible = false;
    }
    gameState.marinaVisible = false;

    const spotIndex = Math.floor(Math.random() * houseLayout.hidingSpots.length);
    const spot = houseLayout.hidingSpots[spotIndex];
    gameState.marinaPosition = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);

    if (marina) {
      marina.position.copy(gameState.marinaPosition);
    }
}

function showMarina() {
    if (!marina || !player || !gameState.marinaPosition) return;

    console.log("showMarina triggered!");
    marina.position.copy(gameState.marinaPosition);
    marina.lookAt(player.position);
    marina.visible = true;
    gameState.marinaVisible = true;
    player.isScared = true;
    player.canMove = false;

    if (scareSound && scareSound.play) {
        scareSound.play();
    }

    const scareMessage = document.getElementById('scareMessage');
    scareMessage.classList.remove('hidden');

    setTimeout(() => {
        scareMessage.classList.add('hidden');
        hideMarina();
        player.isScared = false;
        if(gameState.isPlaying && !gameState.isPaused) {
            player.canMove = true;
            // No need to re-request pointer lock here, it should still be active unless lost
        }
    }, 2000);

    gameState.score -= 50;
    if (gameState.score < 0) gameState.score = 0;
    gameState.scareCount++;
    gameState.lastScareTime = Date.now();
    gameState.nextScareTime = Date.now() + getRandomScareDelay();

    updateUI();

    if (gameState.scareCount >= gameConfig.maxScares) {
        endGame(`Marina scared you ${gameConfig.maxScares} times! She wins!`);
    }
}

function checkScareCondition() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.marinaVisible || !player || !gameState.marinaPosition || player.isScared) {
        return;
    }

    const now = Date.now();
    if (now < gameState.nextScareTime) {
        return;
    }

    const playerPos = player.position;
    const marinaHidingPos = gameState.marinaPosition;
    const distance = playerPos.distanceTo(marinaHidingPos);

    if (distance < gameConfig.scareDistance) {
        if (Math.random() < 0.75) {
            showMarina();
        } else {
            gameState.nextScareTime = Date.now() + getRandomScareDelay() / 2;
        }
    }
}

let lastTime = 0; // Used for calculating deltaTime

function gameLoop(currentTime) {
    if (!gameState.isPlaying) {
        return;
    }
    requestAnimationFrame(gameLoop);

    const now = performance.now();
    const deltaTime = (now - (lastTime || now)) / 1000; // Time difference in seconds
    lastTime = now;


    if (!gameState.isPaused) {
        updateMovement(deltaTime);
        updateGameTimer(deltaTime);
        checkScareCondition();
        updateUI();
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function updateMovement(deltaTime) {
    if (!gameState.isPlaying || gameState.isPaused || !player.canMove || player.isScared) return;

    const speed = gameConfig.moveSpeed * deltaTime;
    const moveDirection = new THREE.Vector3();

    if (keys.w) moveDirection.z = -1;
    if (keys.s) moveDirection.z = 1;
    if (keys.a) moveDirection.x = -1;
    if (keys.d) moveDirection.x = 1;

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        const euler = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
        moveDirection.applyEuler(euler);
        player.position.addScaledVector(moveDirection, speed);

        // Simple boundary collision
        player.position.x = Math.max(-28, Math.min(28, player.position.x));
        player.position.z = Math.max(-28, Math.min(28, player.position.z));
        camera.position.y = 1.6; // Keep camera at eye level
    }
}

function updateGameTimer(deltaTime) {
    gameState.timeRemaining -= deltaTime;

    if (gameState.timeRemaining <= 0) {
        gameState.timeRemaining = 0;
        updateUI();
        endGame("Time's up! You survived Marina's scares (for now)!");
    }
}

function updateUI() {
    document.getElementById('scoreDisplay').textContent = gameState.score;
    document.getElementById('scaresDisplay').textContent = `${gameState.scareCount}/${gameConfig.maxScares}`;

    const time = Math.max(0, gameState.timeRemaining);
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    document.getElementById('timeDisplay').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- NEW AND COMPLETED EVENT HANDLERS ---

function onKeyDown(event) {
    if (!gameState.isPlaying && event.code !== 'Escape') return; // Allow escape even if not "playing" to handle pause screen edge cases.

    switch(event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Escape':
            event.preventDefault();
            if (gameState.isPlaying) { // Only toggle pause if game has started
                if (gameState.isPaused) {
                    resumeGame();
                } else {
                    pauseGame();
                }
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
    if (gameState.isPlaying && !gameState.isPaused && document.pointerLockElement === canvas) {
        // Apply mouse movement to camera rotation
        camera.rotation.y -= event.movementX * gameConfig.mouseSensitivity;
        // Pitch (up/down look) is applied to the camera directly
        camera.rotation.x -= event.movementY * gameConfig.mouseSensitivity;
        // Clamp vertical rotation to prevent "somersaults"
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
}

function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

function requestPointerLock() {
    if (canvas && gameState.isPlaying && !gameState.isPaused) {
        canvas.requestPointerLock = canvas.requestPointerLock ||
                                   canvas.mozRequestPointerLock ||
                                   canvas.webkitRequestPointerLock;
        if (canvas.requestPointerLock) {
            canvas.requestPointerLock();
        } else {
            console.warn("Pointer Lock API not available on this browser/element.");
        }
    }
}

function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
        console.log('Pointer Lock: Engaged');
        // When pointer lock is engaged, ensure player can move if game is active and not paused by menu
        if (gameState.isPlaying && !gameState.isPaused) {
            player.canMove = true;
        }
    } else {
        console.log('Pointer Lock: Disengaged');
        // If game is playing and not intentionally paused by user (e.g. via ESC menu), then pause it
        if (gameState.isPlaying && !gameState.isPaused) {
            pauseGame(); // Automatically pause if pointer lock is lost unexpectedly
        }
         // player.canMove = false; // Movement is generally disabled when paused
    }
}

function onPointerLockError() {
    console.error('Pointer Lock Error.');
    // You could display a message to the user here if needed
}

// --- END OF NEW AND COMPLETED EVENT HANDLERS ---

// Call init to setup everything once the script is loaded
init();
