// Configuration
const API_URL = 'https://api.jsonbin.io/v3/b';
const API_KEY = '$2a$10$T6EPAJkBN4iFUJ.pveaXguevWYLcpLPKpUd9ot44ArdPZMEss/A3S';
const BIN_ID = '67f94d458a456b796687639b';
const IPINFO_TOKEN = 'd7bf49979e9d6d';

// DOM Elements
const cameraFeed = document.getElementById('video');
const snapshotCanvas = document.getElementById('snapshot-canvas');
const violenceButton = document.getElementById('violence-button');
const historyList = document.getElementById('history-list');
const clearHistoryButton = document.getElementById('clear-history');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notification-text');
const locationNotice = document.getElementById('location-notice');

// State
let eventHistory = JSON.parse(localStorage.getItem('eventHistory')) || [];
let currentLocation = null;
let currentPlaceName = "Location not available";

// Hybrid Location Init
async function initializeLocation() {
    try {
        await getBrowserLocation();
    } catch (err) {
        const lastStored = localStorage.getItem("user-location");
        if (lastStored) {
            const parsed = JSON.parse(lastStored);
            currentLocation = parsed;
            currentPlaceName = await reverseGeocode(parsed.lat, parsed.lng);
            showNotification("Using last known GPS location", "info");
            hideLocationNotice();
        } else {
            await getIPLocation();
        }
    }
}

function getBrowserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                currentLocation = { lat: latitude, lng: longitude };
                currentPlaceName = await reverseGeocode(latitude, longitude);
                localStorage.setItem("user-location", JSON.stringify(currentLocation));
                hideLocationNotice();
                resolve();
            },
            (error) => {
                showLocationNotice("GPS access denied or failed.");
                reject(error);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

async function getIPLocation() {
    try {
        const res = await fetch(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`);
        const data = await res.json();
        const [lat, lng] = data.loc.split(',').map(Number);
        currentLocation = { lat, lng };
        currentPlaceName = await reverseGeocode(lat, lng);
        hideLocationNotice();
        showNotification("Using IP-based location (not stored)", "info");
    } catch {
        showLocationNotice("Unable to determine your location.");
    }
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`);
        const data = await res.json();
        return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

function showLocationNotice(message = "Location not available") {
    if (locationNotice) {
        locationNotice.textContent = message;
        locationNotice.classList.add('show');
    }
}

function hideLocationNotice() {
    if (locationNotice) {
        locationNotice.classList.remove('show');
    }
}

function setupCamera() {
    if (cameraFeed.src) {
        showNotification('Camera feed loaded from backend');
    } else {
        showNotification('Error loading video feed', 'error');
    }
}

function takeSnapshot() {
    const ctx = snapshotCanvas.getContext('2d');
    const img = cameraFeed;
    snapshotCanvas.width = img.width;
    snapshotCanvas.height = img.height;
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return snapshotCanvas.toDataURL('image/jpeg', 0.1);
}

// In main.js, update the sendEvent function:
async function sendEvent(imageDataUrl) {
    const timestamp = new Date().toISOString();
    const eventId = Date.now().toString();
    const locationData = {
        coordinates: currentLocation || null,
        placeName: currentPlaceName || "Location not available"
    };
    const newEvent = {
        id: eventId,
        timestamp,
        cameraName: 'Camera 1',
        imageUrl: imageDataUrl,
        status: 'new',
        location: locationData
    };

    try {
        // Get existing events
        const res = await fetch(`${API_URL}/${BIN_ID}`, {
            method: "GET",
            headers: { "X-Master-Key": API_KEY }
        });
        const data = await res.json();
        
        // Ensure events is always an array
        const existingEvents = Array.isArray(data.record?.events) ? data.record.events : [];
        
        // Limit to 100 most recent events (prevent excessive growth)
        const updatedEvents = [newEvent, ...existingEvents].slice(0, 100);
        
        // Update both JSONBin and local storage
        await updateJSONBin(updatedEvents);
        addToHistory(newEvent);
        showNotification('Event reported successfully');
    } catch (err) {
        console.error("Send event failed:", err);
        showNotification('Error reporting event', 'error');
    }
}

async function updateJSONBin(events) {
    try {
        const response = await fetch(`${API_URL}/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ events })
        });
        if (!response.ok) throw new Error('Failed to update JSONBin');
        return await response.json();
    } catch (err) {
        console.error('Update JSONBin error:', err);
        return null;
    }
}

function addToHistory(eventData) {
    eventHistory.unshift(eventData);
    localStorage.setItem('eventHistory', JSON.stringify(eventHistory));
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = '';
    if (eventHistory.length === 0) {
        historyList.innerHTML = '<div class="empty-history">No events recorded yet</div>';
        return;
    }
    eventHistory.forEach(event => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.id = event.id;
        
        // Determine location display
        const locationDisplay = event.location?.coordinates 
            ? `<div class="location-indicator">
                  <span class="location-dot"></span>
                  <span>Location detected</span>
               </div>`
            : '<div class="location-not-detected">No location</div>';
        
        item.innerHTML = `
            <img src="${event.imageUrl}" class="history-image" alt="Event snapshot">
            <div class="history-details">
                <div class="history-header-row">
                    <div class="history-camera">${event.cameraName || 'Camera 1'}</div>
                    ${locationDisplay}
                </div>
                <div class="history-timestamp">${formatTimestamp(event.timestamp)}</div>
            </div>
            <button class="delete-history" data-id="${event.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        historyList.appendChild(item);
    });
}

function formatTimestamp(ts) {
    return new Date(ts).toLocaleString();
}

async function deleteHistoryItem(id) {
    eventHistory = eventHistory.filter(e => e.id !== id);
    localStorage.setItem('eventHistory', JSON.stringify(eventHistory));
    renderHistory();
    await updateJSONBin(eventHistory);
}

async function clearAllHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        eventHistory = [];
        localStorage.setItem('eventHistory', JSON.stringify(eventHistory));
        renderHistory();
        await updateJSONBin(eventHistory);
    }
}

function showNotification(message, type = 'success', duration = 3000) {
    notificationText.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

violenceButton.addEventListener('click', async () => {
    violenceButton.classList.add('active');
    setTimeout(() => violenceButton.classList.remove('active'), 200);
    const imageDataUrl = takeSnapshot();
    await sendEvent(imageDataUrl);
});

clearHistoryButton.addEventListener('click', clearAllHistory);

historyList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-history')) {
        const id = e.target.dataset.id;
        deleteHistoryItem(id);
    }
});

// New initialization system
async function initializeApp() {
    await initializeLocation();
    setupCamera();
    await syncLocalWithRemote(); // This will sync local and remote events
    renderHistory();
}

// Add this new sync function
async function syncLocalWithRemote() {
    try {
        const res = await fetch(`${API_URL}/${BIN_ID}`, {
            method: "GET",
            headers: { "X-Master-Key": API_KEY }
        });
        const data = await res.json();
        const remoteEvents = Array.isArray(data.record?.events) ? data.record.events : [];
        
        // Merge remote events with local, removing duplicates
        eventHistory = [...remoteEvents, ...eventHistory].reduce((acc, event) => {
            if (!acc.some(e => e.id === event.id)) {
                acc.push(event);
            }
            return acc;
        }, []).slice(0, 100); // Keep only 100 most recent
        
        localStorage.setItem('eventHistory', JSON.stringify(eventHistory));
    } catch (err) {
        console.error("Sync failed:", err);
    }
}

// Initialize the app when DOM is loaded
window.addEventListener('DOMContentLoaded', initializeApp);

let lastAutoEventTime = 0;
const AUTO_COOLDOWN_MS = 30000;
let isAutoCooldownActive = false;

setInterval(async () => {
    const triggerInput = document.getElementById('violence-trigger');
    if (!triggerInput) return;

    try {
        const res = await fetch('/check_trigger');
        const data = await res.json();

        if (data.trigger === true && !isAutoCooldownActive) {
            // 🧠 Lock out before snapshot
            isAutoCooldownActive = true;
            lastAutoEventTime = Date.now();

            const imageDataUrl = takeSnapshot();
            if (imageDataUrl) {
                await sendEvent(imageDataUrl);

                violenceButton.classList.add('active');
                setTimeout(() => violenceButton.classList.remove('active'), 200);
            } else {
                console.warn("Snapshot failed during auto-event.");
            }

            // Release cooldown after delay
            setTimeout(() => {
                isAutoCooldownActive = false;
            }, AUTO_COOLDOWN_MS);
        }
    } catch (err) {
        console.error('Error checking violence trigger:', err);
    }

}, 1000);
