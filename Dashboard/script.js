// Configuration
const API_URL = "https://api.jsonbin.io/v3/b";
const API_KEY = "$2a$10$T6EPAJkBN4iFUJ.pveaXguevWYLcpLPKpUd9ot44ArdPZMEss/A3S";
const BIN_ID = "67f94d458a456b796687639b";
const POLLING_INTERVAL = 50000;
const EVENTS_PER_PAGE = 10;

// DOM Elements
const eventsGrid = document.getElementById("events-grid");
const emptyState = document.getElementById("empty-state");
const loadingIndicator = document.getElementById("loading-indicator");
const totalEventsElement = document.getElementById("total-events");
const todayEventsElement = document.getElementById("today-events");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const filterButtons = document.querySelectorAll(".filter-button");
const eventModal = document.getElementById("event-modal");
const modalImage = document.getElementById("modal-image");
const modalCamera = document.getElementById("modal-camera");
const modalTimestamp = document.getElementById("modal-timestamp");
const modalStatus = document.getElementById("modal-status");
const modalLocation = document.getElementById("modal-location");
const closeModal = document.getElementById("close-modal");
const markReviewed = document.getElementById("mark-reviewed");
const deleteEvent = document.getElementById("delete-event");
const notification = document.getElementById("notification");
const notificationText = document.getElementById("notification-text");
const connectionStatus = document.getElementById("connection-status");
const statusDot = document.querySelector(".status-dot");
const showMapButton = document.getElementById("show-map");
const mapModal = document.getElementById("map-modal");
const closeMapButton = document.getElementById("close-map");

// State
let events = [];
let currentFilter = "all";
let searchQuery = "";
let currentEventId = null;
let currentPage = 1;
let worldMap = null;

// Init
async function init() {
  await validateBinId();
  addBinIdStyles();
  setupEventListeners();
  
  // Add pagination container if it doesn't exist
  if (!document.getElementById("pagination-container")) {
    const paginationDiv = document.createElement("div");
    paginationDiv.id = "pagination-container";
    eventsGrid.parentNode.insertBefore(paginationDiv, eventsGrid.nextSibling);
  }
}

// Validate Bin ID
async function validateBinId() {
  try {
    const response = await fetch(`${API_URL}/${BIN_ID}`, {
      method: "GET",
      headers: { "X-Master-Key": API_KEY },
    });

    if (!response.ok) throw new Error("Invalid bin ID");

    const data = await response.json();

    // Initialize with empty array if no events exist
    if (!data.record || !Array.isArray(data.record.events)) {
      await fetch(`${API_URL}/${BIN_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": API_KEY,
        },
        body: JSON.stringify({ events: [] }),
      });
    }

    startPolling();
    showNotification("Successfully connected to event data");
  } catch (error) {
    console.error("Error validating bin ID:", error);
    setConnectionStatus(false, "Invalid bin ID");
    showNotification("Invalid bin ID. Please try again.", "error");
  }
}

// Polling
function startPolling() {
  loadEvents();
  addBinIdDisplay();
  setInterval(loadEvents, POLLING_INTERVAL);
}

function addBinIdDisplay() {
  const headerLeft = document.querySelector(".header-left");
  if (headerLeft && !document.querySelector(".bin-id-display")) {
    const binIdDisplay = document.createElement("div");
    binIdDisplay.className = "bin-id-display";
    binIdDisplay.innerHTML = `<span class="bin-id-label">Bin ID:</span> <span id="bin-id-value">${BIN_ID}</span>`;
    binIdDisplay.style.marginLeft = "15px";
    binIdDisplay.style.cursor = "pointer";
    binIdDisplay.title = "Click to copy Bin ID";

    binIdDisplay.addEventListener("click", () => {
      navigator.clipboard
        .writeText(BIN_ID)
        .then(() => showNotification("Bin ID copied to clipboard"))
        .catch((err) => console.error("Could not copy text:", err));
    });

    headerLeft.appendChild(binIdDisplay);
  }
}

function addBinIdStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .bin-id-display {
      display: inline-flex;
      align-items: center;
      background-color: rgba(0, 0, 0, 0.2);
      padding: 4px 8px;
      border-radius: 4px;
      margin-left: 10px;
      transition: background-color 0.3s;
    }
    .bin-id-display:hover {
      background-color: rgba(0, 0, 0, 0.4);
    }
    .bin-id-label {
      margin-right: 5px;
      font-weight: 500;
    }
    #bin-id-value {
      font-family: monospace;
    }
  `;
  document.head.appendChild(style);
}

// Load Events
// In the dashboard code, modify the loadEvents function:
async function loadEvents() {
  showLoading(true);

  try {
    const response = await fetch(`${API_URL}/${BIN_ID}`, {
      method: "GET",
      headers: { "X-Master-Key": API_KEY },
    });

    if (!response.ok) throw new Error("Failed to fetch data");

    const data = await response.json();
    
    // Ensure events is always an array, even if empty
    events = Array.isArray(data.record?.events) ? data.record.events : [];

    // Sort newest first and limit to 100 most recent
    events = events
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    setConnectionStatus(true);
    updateStats();
    filterAndRenderEvents();
  } catch (error) {
    console.error("Error loading events:", error);
    setConnectionStatus(false, "Error connecting to server");
    showNotification("Error loading events. Please check your connection.", "error");
  } finally {
    showLoading(false);
  }
}

// Add new event function
async function addNewEvent(newEvent) {
  try {
    // Generate a unique ID if not provided
    if (!newEvent.id) {
      newEvent.id = Math.random().toString(36).substring(2, 9);
    }

    // Set default status if not provided
    if (!newEvent.status) {
      newEvent.status = "new";
    }

    // Add timestamp if not provided
    if (!newEvent.timestamp) {
      newEvent.timestamp = new Date().toISOString();
    }

    // Add the new event to the beginning of the array
    events.unshift(newEvent);

    // Update the remote storage
    await updateEvents();

    // Reset to first page when adding new events
    currentPage = 1;

    // Update UI
    updateStats();
    filterAndRenderEvents();

    showNotification("New event added successfully");
    return true;
  } catch (error) {
    console.error("Error adding new event:", error);
    showNotification("Error adding new event", "error");
    return false;
  }
}

// Stats
function updateStats() {
  totalEventsElement.textContent = events.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEvents = events.filter((event) => new Date(event.timestamp) >= today);
  todayEventsElement.textContent = todayEvents.length;
}

// Filtering with pagination support
function filterAndRenderEvents() {
  let filteredEvents = events.filter((event) => currentFilter === "all" || event.status === currentFilter);

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(
      (event) =>
        event.cameraName.toLowerCase().includes(query) ||
        new Date(event.timestamp).toLocaleString().toLowerCase().includes(query),
    );
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredEvents.length / EVENTS_PER_PAGE);
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages; // Adjust current page if it's out of bounds
  }

  const startIdx = (currentPage - 1) * EVENTS_PER_PAGE;
  const paginatedEvents = filteredEvents.slice(startIdx, startIdx + EVENTS_PER_PAGE);

  renderEvents(paginatedEvents);
  updatePaginationControls(filteredEvents.length);
}

// Update pagination controls
function updatePaginationControls(totalFilteredEvents) {
  const totalPages = Math.ceil(totalFilteredEvents / EVENTS_PER_PAGE);
  const paginationContainer = document.getElementById("pagination-container");

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }

  paginationContainer.innerHTML = `
    <div class="pagination">
      <button class="page-btn" id="prev-page" ${currentPage === 1 ? "disabled" : ""}>
        Previous
      </button>
      <span class="page-info">
        Page ${currentPage} of ${totalPages}
      </span>
      <button class="page-btn" id="next-page" 
        ${currentPage >= totalPages ? "disabled" : ""}>
        Next
      </button>
    </div>
  `;
}

// Rendering
function renderEvents(eventsToRender) {
  eventsGrid.innerHTML = "";

  if (eventsToRender.length === 0) {
    emptyState.style.display = "flex";
    return;
  }

  emptyState.style.display = "none";

  eventsToRender.forEach((event) => {
    const eventId = event.id || Math.random().toString(36).substring(2, 9);
    const cameraName = event.cameraName || "Unknown Camera";
    const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleString() : "Unknown Time";
    const imageUrl = event.imageUrl || "/placeholder.svg";
    const status = event.status || "new";

    const card = document.createElement("div");
    card.className = "event-card";
    card.dataset.id = eventId;

    card.innerHTML = `
      <div class="event-image-container">
          <img src="${imageUrl}" class="event-image" alt="Event from ${cameraName}">
          ${
            event.location && event.location.coordinates
              ? '<div class="location-indicator"><span class="location-dot"></span>Location detected</div>'
              : ""
          }
          <div class="event-actions">
              <button class="event-action escalate-btn" title="Escalate Event">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m19 14-7-7-7 7"/>
                  </svg>
              </button>
              <button class="event-action delete-btn" title="Delete Event">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
              </button>
          </div>
      </div>
      <div class="event-info">
          <div class="event-camera">${cameraName}</div>
          <div class="event-timestamp">${timestamp}</div>
      </div>
    `;

    eventsGrid.appendChild(card);

    // Card button events
    const escalateBtn = card.querySelector(".escalate-btn");
    const deleteBtn = card.querySelector(".delete-btn");

    card.addEventListener("click", (e) => {
      if (!e.target.closest(".event-action")) {
        openEventModal(event);
      }
    });

    escalateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      escalateEvent(eventId);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEventById(eventId);
    });
  });
}

// Event modal
function openEventModal(event) {
  currentEventId = event.id;
  modalImage.src = event.imageUrl || "/placeholder.svg";
  modalCamera.textContent = event.cameraName || "Unknown Camera";
  modalTimestamp.textContent = event.timestamp ? new Date(event.timestamp).toLocaleString() : "Unknown Time";

  document.querySelector(".status-container").style.display = "none";

  if (event.location && event.location.placeName) {
    modalLocation.textContent = event.location.placeName;
    document.querySelector(".location-container").style.display = "";
    document.querySelector(".divider").style.display = "";
  } else if (event.location && event.location.coordinates) {
    modalLocation.textContent = `${event.location.coordinates.lat.toFixed(4)}, ${event.location.coordinates.lng.toFixed(4)}`;
    document.querySelector(".location-container").style.display = "";
    document.querySelector(".divider").style.display = "";
  } else {
    document.querySelector(".location-container").style.display = "none";
    document.querySelector(".divider").style.display = "none";
  }

  eventModal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeEventModal() {
  eventModal.classList.remove("show");
  document.body.style.overflow = "";
  currentEventId = null;

  document.querySelector(".status-container").style.display = "none";
  document.querySelector(".location-container").style.display = "";
  document.querySelector(".divider").style.display = "";
}

// Escalate & Delete
async function escalateEvent(eventId) {
  try {
    const eventIndex = events.findIndex((e) => e.id === eventId);
    if (eventIndex === -1) return;
    events[eventIndex].status = "reviewed";
    await updateEvents();
    showNotification(`Event escalated successfully`);
    filterAndRenderEvents();
    if (currentEventId === eventId) modalStatus.textContent = "reviewed";
  } catch (error) {
    console.error("Error escalating event:", error);
    showNotification("Error escalating event", "error");
  }
}

async function deleteEventById(eventId) {
  try {
    const eventIndex = events.findIndex((e) => e.id === eventId);
    if (eventIndex === -1) return;
    const eventName = events[eventIndex].cameraName || "Unknown";
    events.splice(eventIndex, 1);
    await updateEvents();
    showNotification(`Event from ${eventName} deleted`);
    if (currentEventId === eventId) closeEventModal();
    filterAndRenderEvents();
    updateStats();
  } catch (error) {
    console.error("Error deleting event:", error);
    showNotification("Error deleting event", "error");
  }
}

// Update events in bin
async function updateEvents() {
  const response = await fetch(`${API_URL}/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) throw new Error("Failed to update events");
  return await response.json();
}

// UI helpers
function showNotification(message, type = "success", duration = 3000) {
  notificationText.textContent = message;
  notification.className = `notification ${type} show`;
  setTimeout(() => notification.classList.remove("show"), duration);
}

function setConnectionStatus(connected, message = "") {
  connectionStatus.textContent = connected ? "Connected" : message || "Disconnected";
  statusDot.classList.toggle("disconnected", !connected);
}

function showLoading(show) {
  loadingIndicator.style.display = show ? "flex" : "none";
}

// Map functionality
function showMapModal() {
  mapModal.classList.add("show");
  document.body.style.overflow = "hidden";
  
  // Initialize map if not already done
  if (!worldMap) {
    initWorldMap();
  }
  
  renderEventMarkers();
}

function closeMapModal() {
  mapModal.classList.remove("show");
  document.body.style.overflow = "";
}

function initWorldMap() {
  // Create map centered on world view
  worldMap = L.map('world-map').setView([20, 0], 2);
  
  // Add tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(worldMap);
}

function renderEventMarkers() {
  // Clear existing markers
  if (worldMap) {
    worldMap.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        worldMap.removeLayer(layer);
      }
    });
  }

  // Group events by location to cluster nearby events
  const locationGroups = {};

  events.forEach((event) => {
    if (event.location && event.location.coordinates) {
      const key = `${event.location.coordinates.lat.toFixed(2)}_${event.location.coordinates.lng.toFixed(2)}`;
      if (!locationGroups[key]) {
        locationGroups[key] = {
          count: 0,
          lat: event.location.coordinates.lat,
          lng: event.location.coordinates.lng,
          events: [],
        };
      }
      locationGroups[key].count++;
      locationGroups[key].events.push(event);
    }
  });

  // Create markers for each location group
  Object.values(locationGroups).forEach((group) => {
    const marker = L.marker([group.lat, group.lng], {
      icon: L.divIcon({
        className: 'event-marker',
        html: `<div class="marker-pin"></div><div class="marker-count">${group.count}</div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -36]
      })
    }).addTo(worldMap);

    // Add popup with event information
    const popupContent = `
      <div class="map-popup">
        <strong>${group.count} event${group.count > 1 ? 's' : ''}</strong><br>
        ${group.lat.toFixed(4)}, ${group.lng.toFixed(4)}<br>
      </div>
    `;
    
    marker.bindPopup(popupContent);
    
    // Fit map to show all markers
    if (Object.keys(locationGroups).length > 1) {
      const bounds = L.latLngBounds(Object.values(locationGroups).map(group => [group.lat, group.lng]));
      worldMap.fitBounds(bounds, { padding: [50, 50] });
    } else if (Object.keys(locationGroups).length === 1) {
      worldMap.setView([group.lat, group.lng], 8);
    }
  });
}

// Event listeners
function setupEventListeners() {
  searchButton.addEventListener("click", () => {
    searchQuery = searchInput.value.trim();
    currentPage = 1; // Reset to first page when searching
    filterAndRenderEvents();
  });

  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      searchQuery = searchInput.value.trim();
      currentPage = 1; // Reset to first page when searching
      filterAndRenderEvents();
    }
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      currentFilter = button.dataset.filter;
      currentPage = 1; // Reset to first page when changing filters
      filterAndRenderEvents();
    });
  });

  closeModal.addEventListener("click", closeEventModal);

  eventModal.addEventListener("click", (e) => {
    if (e.target === eventModal) {
      closeEventModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && eventModal.classList.contains("show")) {
      closeEventModal();
    }
    if (e.key === "Escape" && mapModal.classList.contains("show")) {
      closeMapModal();
    }
  });

  markReviewed.addEventListener("click", () => {
    if (currentEventId) escalateEvent(currentEventId);
  });

  deleteEvent.addEventListener("click", () => {
    if (currentEventId) deleteEventById(currentEventId);
  });

  // Map related event listeners
  showMapButton.addEventListener("click", showMapModal);
  closeMapButton.addEventListener("click", closeMapModal);
  mapModal.addEventListener("click", (e) => {
    if (e.target === mapModal) {
      closeMapModal();
    }
  });

  // Pagination event delegation
  document.addEventListener("click", (e) => {
    if (e.target.id === "prev-page") {
      currentPage--;
      filterAndRenderEvents();
    } else if (e.target.id === "next-page") {
      currentPage++;
      filterAndRenderEvents();
    }
  });
}

// Responsive UI setup
function handleResize() {
  const windowHeight = window.innerHeight;
  const headerHeight = document.querySelector(".dashboard-header").offsetHeight;
  const filtersHeight = document.querySelector(".filters").offsetHeight;
  const availableHeight = windowHeight - headerHeight - filtersHeight - 60;
  document.querySelector(".events-container").style.minHeight = Math.max(300, availableHeight) + "px";
}

window.addEventListener("resize", handleResize);
window.addEventListener("DOMContentLoaded", () => {
  init();
  setTimeout(handleResize, 100);
});

// Make addNewEvent available globally for testing
window.addNewEvent = addNewEvent;