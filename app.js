// Game Configuration
const gameConfig = {
    playerName: "Mason",
    scarerName: "Marina",
    maxScares: 10,
    gameTimeLimit: 300,
    moveSpeed: 5,
    mouseSensitivity: 0.002,
    scareDistance: 3,
    scareInterval: 8000,
    scareVariance: 5000
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
let player, controls;
let house = {};
let marina;
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
        {name: "Living Room Corner", position: {x: -7, y: 0, z: -5}}
    ]
};

// Initialize game
function init() {
    setupEventListeners();
    setupAudio();
    showStartScreen();
}

function setupEventListeners() {
    // Start button
    document.getElementById('startButton').addEventListener('click', startGame);
    
    // Restart button
    document.getElementById('restartButton').addEventListener('click', restartGame);
    
    // Resume button
    document.getElementById('resumeButton').addEventListener('click', resumeGame);
    
    // Main menu button
    document.getElementById('mainMenuButton').addEventListener('click', showStartScreen);
    
    // Volume control
    document.getElementById('volumeSlider').addEventListener('input', updateVolume);
    
    // Keyboard events
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Mouse events
    document.addEventListener('mousemove', onMouseMove);
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
}

function setupAudio() {
    // Create audio context for sound effects
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ambient sound (simple oscillator for atmosphere)
        ambientSound = {
            context: audioContext,
            volume: 0.1,
            oscillator: null,
            play: function() {
                if (this.oscillator) return;
                
                const oscillator = this.context.createOscillator();
                const gainNode = this.context.createGain();
                
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(60, this.context.currentTime);
                gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
                
                oscillator.connect(gainNode);
                gainNode.connect(this.context.destination);
                
                oscillator.start();
                this.oscillator = oscillator;
            },
            stop: function() {
                if (this.oscillator) {
                    this.oscillator.stop();
                    this.oscillator = null;
                }
            }
        };
        
        // Scare sound effect
        scareSound = {
            context: audioContext,
            volume: 0.5,
            play: function() {
                const oscillator = this.context.createOscillator();
                const gainNode = this.context.createGain();
                
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(200, this.context.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.1);
                oscillator.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.5);
                
                gainNode.gain.setValueAtTime(0, this.context.currentTime);
                gainNode.gain.linearRampToValueAtTime(this.volume, this.context.currentTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
                
                oscillator.connect(gainNode);
                gainNode.connect(this.context.destination);
                
                oscillator.start();
                oscillator.stop(this.context.currentTime + 0.5);
            }
        };
    } catch (e) {
        console.log('Audio not supported');
    }
}

function setup3D() {
    canvas = document.getElementById('gameCanvas');
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    scene.fog = new THREE.Fog(0x2a2a2a, 10, 50);
    
    // Camera setup (first person)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Eye height
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Lighting
    setupLighting();
    
    // Create house
    createHouse();
    
    // Create Marina
    createMarina();
    
    // Setup player
    setupPlayer();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);
    
    // Main room light
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);
    
    // Additional room lights
    const roomLights = [
        { pos: [0, 8, 0], color: 0xffeaa7, intensity: 0.6 },
        { pos: [15, 8, 0], color: 0xffeaa7, intensity: 0.5 },
        { pos: [0, 8, 12], color: 0xffeaa7, intensity: 0.4 },
        { pos: [12, 8, 12], color: 0xffeaa7, intensity: 0.3 }
    ];
    
    roomLights.forEach(light => {
        const pointLight = new THREE.PointLight(light.color, light.intensity, 20);
        pointLight.position.set(...light.pos);
        scene.add(pointLight);
    });
}

function createHouse() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Walls for each room
    houseLayout.rooms.forEach(room => {
        createRoom(room);
    });
    
    // Add furniture
    addFurniture();
}

function createRoom(room) {
    const wallHeight = 8;
    const wallThickness = 0.2;
    
    // Wall material
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xF5F5DC });
    
    // Create walls
    const walls = [
        // North wall
        {
            width: room.size.width,
            height: wallHeight,
            position: [room.position.x + room.size.width/2, wallHeight/2, room.position.z + room.size.depth]
        },
        // South wall
        {
            width: room.size.width,
            height: wallHeight,
            position: [room.position.x + room.size.width/2, wallHeight/2, room.position.z]
        },
        // East wall
        {
            width: room.size.depth,
            height: wallHeight,
            position: [room.position.x + room.size.width, wallHeight/2, room.position.z + room.size.depth/2],
            rotation: Math.PI/2
        },
        // West wall
        {
            width: room.size.depth,
            height: wallHeight,
            position: [room.position.x, wallHeight/2, room.position.z + room.size.depth/2],
            rotation: Math.PI/2
        }
    ];
    
    walls.forEach(wall => {
        const wallGeometry = new THREE.BoxGeometry(wall.width, wall.height, wallThickness);
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(...wall.position);
        if (wall.rotation) wallMesh.rotation.y = wall.rotation;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
    });
}

function addFurniture() {
    const furnitureMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    
    // Living room furniture
    // Couch
    const couchGeometry = new THREE.BoxGeometry(4, 1.5, 2);
    const couch = new THREE.Mesh(couchGeometry, furnitureMaterial);
    couch.position.set(-3, 0.75, 2);
    couch.castShadow = true;
    scene.add(couch);
    
    // Coffee table
    const tableGeometry = new THREE.BoxGeometry(2, 0.8, 1);
    const table = new THREE.Mesh(tableGeometry, furnitureMaterial);
    table.position.set(-1, 0.4, 3);
    table.castShadow = true;
    scene.add(table);
    
    // Kitchen counter
    const counterGeometry = new THREE.BoxGeometry(8, 1.5, 2);
    const counter = new THREE.Mesh(counterGeometry, furnitureMaterial);
    counter.position.set(18, 0.75, 2);
    counter.castShadow = true;
    scene.add(counter);
    
    // Bedroom bed
    const bedGeometry = new THREE.BoxGeometry(3, 1, 6);
    const bed = new THREE.Mesh(bedGeometry, furnitureMaterial);
    bed.position.set(2, 0.5, 16);
    bed.castShadow = true;
    scene.add(bed);
    
    // Closet
    const closetGeometry = new THREE.BoxGeometry(2, 7, 1);
    const closet = new THREE.Mesh(closetGeometry, furnitureMaterial);
    closet.position.set(3, 3.5, 21);
    closet.castShadow = true;
    scene.add(closet);
}

function createMarina() {
    // Simple representation of Marina
    const marinaGroup = new THREE.Group();
    
    // Body
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6B9D });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    marinaGroup.add(body);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.25);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xDDBEA9 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.65;
    marinaGroup.add(head);
    
    // Hair (short)
    const hairGeometry = new THREE.SphereGeometry(0.28);
    const hairMaterial = new THREE.MeshLambertMaterial({ color: 0x2F1B14 });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 1.75;
    hair.scale.y = 0.8;
    marinaGroup.add(hair);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.8);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xDDBEA9 });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 1, 0);
    leftArm.rotation.z = Math.PI / 4;
    marinaGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 1, 0);
    rightArm.rotation.z = -Math.PI / 4;
    marinaGroup.add(rightArm);
    
    marina = marinaGroup;
    marina.visible = false;
    marina.castShadow = true;
    scene.add(marina);
    
    hideMarina();
}

function setupPlayer() {
    player = {
        position: camera.position,
        velocity: new THREE.Vector3(),
        canMove: true
    };
    
    // Set initial position
    player.position.set(0, 1.6, -8);
}

function startGame() {
    hideAllScreens();
    document.getElementById('gameUI').classList.remove('hidden');
    document.getElementById('volumeControl').classList.remove('hidden');
    
    if (!scene) {
        setup3D();
    }
    
    // Reset game state
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
    
    updateUI();
    hideMarina();
    
    // Start audio
    if (ambientSound && ambientSound.context.state === 'suspended') {
        ambientSound.context.resume().then(() => {
            ambientSound.play();
        });
    } else if (ambientSound) {
        ambientSound.play();
    }
    
    // Start the game loop
    gameLoop();
    
    // Request pointer lock after a short delay to allow the game to initialize
    setTimeout(() => {
        requestPointerLock();
    }, 100);
}

function restartGame() {
    hideAllScreens();
    startGame();
}

function pauseGame() {
    if (!gameState.isPlaying) return;
    
    gameState.isPaused = true;
    document.getElementById('pauseScreen').classList.remove('hidden');
    document.exitPointerLock();
}

function resumeGame() {
    if (!gameState.isPlaying) return;
    
    gameState.isPaused = false;
    document.getElementById('pauseScreen').classList.add('hidden');
    requestPointerLock();
}

function endGame(reason) {
    gameState.isPlaying = false;
    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('volumeControl').classList.add('hidden');
    
    // Stop ambient sound
    if (ambientSound) {
        ambientSound.stop();
    }
    
    // Update final stats
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalScares').textContent = gameState.scareCount;
    document.getElementById('gameOverReason').textContent = reason;
    
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.exitPointerLock();
}

function showStartScreen() {
    hideAllScreens();
    document.getElementById('startScreen').classList.remove('hidden');
    gameState.isPlaying = false;
    gameState.isPaused = false;
    
    // Stop ambient sound
    if (ambientSound) {
        ambientSound.stop();
    }
    
    document.exitPointerLock();
}

function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
}

function getRandomScareDelay() {
    return gameConfig.scareInterval + (Math.random() - 0.5) * gameConfig.scareVariance;
}

function hideMarina() {
    marina.visible = false;
    gameState.marinaVisible = false;
    
    // Choose random hiding spot
    const spot = houseLayout.hidingSpots[Math.floor(Math.random() * houseLayout.hidingSpots.length)];
    gameState.marinaPosition = spot.position;
    marina.position.set(spot.position.x, spot.position.y, spot.position.z);
}

function showMarina() {
    marina.visible = true;
    gameState.marinaVisible = true;
    
    // Play scare sound
    if (scareSound) {
        scareSound.play();
    }
    
    // Show scare message
    const scareMessage = document.getElementById('scareMessage');
    scareMessage.classList.remove('hidden');
    setTimeout(() => {
        scareMessage.classList.add('hidden');
    }, 2000);
    
    // Update score and stats
    gameState.score += 100;
    gameState.scareCount++;
    gameState.lastScareTime = Date.now();
    gameState.nextScareTime = Date.now() + getRandomScareDelay();
    
    updateUI();
    
    // Hide Marina after a short time
    setTimeout(() => {
        hideMarina();
    }, 1500);
    
    // Check win condition
    if (gameState.scareCount >= gameConfig.maxScares) {
        endGame(`Marina scared you ${gameConfig.maxScares} times! She wins!`);
    }
}

function checkScareCondition() {
    if (!gameState.isPlaying || gameState.isPaused || gameState.marinaVisible) return;
    
    const now = Date.now();
    if (now < gameState.nextScareTime) return;
    
    // Check distance to Marina's hiding spot
    const playerPos = camera.position;
    const marinaPos = gameState.marinaPosition;
    const distance = Math.sqrt(
        Math.pow(playerPos.x - marinaPos.x, 2) + 
        Math.pow(playerPos.z - marinaPos.z, 2)
    );
    
    if (distance < gameConfig.scareDistance) {
        showMarina();
    }
}

function updateMovement() {
    if (!gameState.isPlaying || gameState.isPaused || !player.canMove) return;
    
    const speed = gameConfig.moveSpeed * 0.016; // Assuming 60fps
    const direction = new THREE.Vector3();
    
    if (keys.w) direction.z -= 1;
    if (keys.s) direction.z += 1;
    if (keys.a) direction.x -= 1;
    if (keys.d) direction.x += 1;
    
    if (direction.length() > 0) {
        direction.normalize();
        
        // Apply camera rotation to movement direction
        const euler = new THREE.Euler(0, camera.rotation.y, 0);
        direction.applyEuler(euler);
        
        player.position.add(direction.multiplyScalar(speed));
        
        // Keep player within house bounds
        player.position.x = Math.max(-15, Math.min(25, player.position.x));
        player.position.z = Math.max(-15, Math.min(25, player.position.z));
    }
}

function updateGameTimer() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    
    gameState.timeRemaining -= 1/60; // Assuming 60fps
    
    if (gameState.timeRemaining <= 0) {
        endGame("Time's up! You survived Marina's scares!");
    }
}

function updateUI() {
    document.getElementById('scoreDisplay').textContent = gameState.score;
    document.getElementById('scaresDisplay').textContent = `${gameState.scareCount}/${gameConfig.maxScares}`;
    
    const minutes = Math.floor(gameState.timeRemaining / 60);
    const seconds = Math.floor(gameState.timeRemaining % 60);
    document.getElementById('timeDisplay').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function gameLoop() {
    if (!gameState.isPlaying) return;
    
    updateMovement();
    updateGameTimer();
    checkScareCondition();
    updateUI();
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    
    requestAnimationFrame(gameLoop);
}

// Event handlers
function onKeyDown(event) {
    switch(event.code) {
        case 'KeyW':
            keys.w = true;
            break;
        case 'KeyA':
            keys.a = true;
            break;
        case 'KeyS':
            keys.s = true;
            break;
        case 'KeyD':
            keys.d = true;
            break;
        case 'Escape':
            event.preventDefault();
            if (gameState.isPlaying) {
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
        case 'KeyW':
            keys.w = false;
            break;
        case 'KeyA':
            keys.a = false;
            break;
        case 'KeyS':
            keys.s = false;
            break;
        case 'KeyD':
            keys.d = false;
            break;
    }
}

function onMouseMove(event) {
    if (!gameState.isPlaying || gameState.isPaused) return;
    if (document.pointerLockElement !== canvas) return;
    
    const sensitivity = gameConfig.mouseSensitivity;
    camera.rotation.y -= event.movementX * sensitivity;
    camera.rotation.x -= event.movementY * sensitivity;
    
    // Limit vertical rotation
    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
}

function requestPointerLock() {
    if (canvas && gameState.isPlaying && !gameState.isPaused) {
        canvas.requestPointerLock().catch(err => {
            console.log("Pointer lock failed:", err);
        });
    }
}

function onPointerLockChange() {
    // This function handles pointer lock state changes
    if (document.pointerLockElement === canvas) {
        console.log("Pointer lock acquired");
    } else {
        console.log("Pointer lock released");
    }
}

function onPointerLockError() {
    console.log("Pointer lock error");
}

function onWindowResize() {
    if (!camera || !renderer) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateVolume(event) {
    const volume = parseFloat(event.target.value);
    if (ambientSound) ambientSound.volume = volume * 0.1;
    if (scareSound) scareSound.volume = volume * 0.5;
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);