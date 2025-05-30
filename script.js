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
    marinaPosition: new THREE.Vector3(),
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
    setupEventListeners();
    setupAudio();
    showStartScreen();
}

function setupEventListeners() {
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', startGame);
    }
    
    const restartButton = document.getElementById('restartButton');
    if (restartButton) {
        restartButton.addEventListener('click', restartGame);
    }
    
    const resumeButton = document.getElementById('resumeButton');
    if (resumeButton) {
        resumeButton.addEventListener('click', resumeGame);
    }
    
    const mainMenuButton = document.getElementById('mainMenuButton');
    if (mainMenuButton) {
        mainMenuButton.addEventListener('click', showStartScreen);
    }
    
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', updateVolume);
    }
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    window.addEventListener('resize', onWindowResize);
}

function setupAudio() {
    if (!(window.AudioContext || window.webkitAudioContext)) {
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
    } catch (e) {
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
}

function setup3D() {
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
    couch.position.set(-3, 0
