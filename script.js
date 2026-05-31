const GOOGLE_MAPS_API_KEY = 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE';

let map;
let directionsService;
let directionsRenderer;
let googleMapsLoadPromise;
let currentLocationLoaded = false;
let demoRouteLayer;

const destinationProfiles = {
    paris: {
        stopovers: [
            'Bruges, Belgium for canals and a relaxed lunch stop.',
            'Reims, France for a champagne-region break.',
            'Lille, France for a quick urban coffee stop.'
        ],
        stays: [
            'Le Marais for boutique hotels and walkable streets.',
            'Saint-Germain for classic Paris charm and easy transit.',
            '8th arrondissement for landmark views and upscale stays.'
        ]
    },
    kyoto: {
        stopovers: [
            'Osaka for food and an easy train transfer.',
            'Nara for temples and deer park visits.',
            'Uji for matcha cafes and riverside walks.'
        ],
        stays: [
            'Gion for traditional ryokan stays and evening walks.',
            'Higashiyama for temple access and quiet lanes.',
            'Central Kyoto for transit-friendly hotels.'
        ]
    },
    santorini: {
        stopovers: [
            'Athens for a one-night history stop before the islands.',
            'Naxos for a slower island connection.',
            'Mykonos for a ferry-side add-on if you want nightlife.'
        ],
        stays: [
            'Oia for sunset caldera views and premium suites.',
            'Fira for central access and lively restaurants.',
            'Imerovigli for quieter cliffside stays.'
        ]
    },
    default: {
        stopovers: [
            'Choose a destination to see personalized stopovers.',
            'Try a major city name like Paris, Kyoto, or Santorini.',
            'We will suggest scenic breaks and easy transfers.'
        ],
        stays: [
            'Choose a destination to see stay ideas.',
            'Try a destination above to tailor the list.',
            'You can also use the search box to explore more routes.'
        ]
    }
};

function normalizeText(value) {
    return value.trim().toLowerCase();
}

function getDestinationProfile(destination) {
    const normalized = normalizeText(destination);

    if (normalized.includes('paris')) {
        return destinationProfiles.paris;
    }

    if (normalized.includes('kyoto')) {
        return destinationProfiles.kyoto;
    }

    if (normalized.includes('santorini')) {
        return destinationProfiles.santorini;
    }

    return destinationProfiles.default;
}

function renderSuggestionList(listElement, items) {
    if (!listElement) {
        return;
    }

    listElement.innerHTML = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderTravelSuggestions(destination) {
    const profile = getDestinationProfile(destination);
    renderSuggestionList(document.getElementById('stopover-list'), profile.stopovers);
    renderSuggestionList(document.getElementById('stay-list'), profile.stays);
}

function attachAutocomplete() {
    const startInput = document.getElementById('start-point');
    const endInput = document.getElementById('end-point');

    if (startInput) {
        startInput.setAttribute('autocomplete', 'off');
    }

    if (endInput) {
        endInput.setAttribute('autocomplete', 'off');
    }
}

function setStartLocationLabel(label) {
    const startInput = document.getElementById('start-point');

    if (startInput && label) {
        startInput.value = label;
    }
}

function loadGoogleMapsScript() {
    if (googleMapsLoadPromise) {
        return googleMapsLoadPromise;
    }

    googleMapsLoadPromise = new Promise((resolve, reject) => {
        if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE') {
            reject(new Error('Google Maps API key is not configured.'));
            return;
        }

        if (window.google?.maps) {
            initializeMap().then(resolve).catch(reject);
            return;
        }

        window.initMap = () => {
            initializeMap().then(resolve).catch(reject);
        };

        const existingScript = document.querySelector('script[data-google-maps-loader]');
        if (existingScript) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.dataset.googleMapsLoader = 'true';
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&callback=initMap&loading=async`;
        script.onerror = () => reject(new Error('Google Maps failed to load.'));
        document.head.appendChild(script);
    });

    return googleMapsLoadPromise;
}

function setMapStatus(message) {
    const mapStatus = document.getElementById('map-status');

    if (!mapStatus) {
        return;
    }

    mapStatus.textContent = message;
    mapStatus.classList.toggle('visible', Boolean(message));
}

function renderFallbackMap(place) {
    const mapElement = document.getElementById('google-map');

    if (!mapElement) {
        return;
    }

    mapElement.innerHTML = `
        <iframe
            id="google-map-fallback"
            title="Google Maps preview"
            src="${buildGoogleMapsPlaceUrl(place || 'Paris, France')}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            class="fallback-map-frame"
        ></iframe>
    `;
}

function buildDirectionsUrl(start, end) {
    const origin = encodeURIComponent(start || '');
    const destination = encodeURIComponent(end || '');

    if (!start || !end) {
        return 'https://www.google.com/maps?q=travel';
    }

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving&dir_action=navigate`;
}

async function initializeMap() {
    const mapElement = document.getElementById('google-map');
    if (!mapElement || !window.google?.maps) {
        return;
    }

    mapElement.innerHTML = '';

    map = new google.maps.Map(mapElement, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: false,
        preserveViewport: false,
    });

    attachAutocomplete();
    setMapStatus('');

    const destination = document.getElementById('end-point')?.value || 'Paris, France';
    renderTravelSuggestions(destination);
    await autoFetchCurrentLocation();
}

window.initMap = initializeMap;
function buildGoogleMapsPlaceUrl(place) {
    const query = encodeURIComponent(place || 'Paris, France');
    return `https://www.google.com/maps?q=${query}&output=embed`;
}

function reverseGeocodeCoordinates(latitude, longitude) {
    if (!window.google?.maps?.Geocoder) {
        return Promise.resolve(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }

    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();

        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
                resolve(results[0].formatted_address || results[0].name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                return;
            }

            resolve(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        });
    });
}

async function autoFetchCurrentLocation() {
    const startInput = document.getElementById('start-point');
    const routeSummary = document.getElementById('route-summary');

    if (!startInput || currentLocationLoaded) {
        return;
    }

    if (!navigator.geolocation) {
        if (!startInput.value) {
            startInput.value = 'Current location';
        }

        if (routeSummary && !routeSummary.textContent) {
            routeSummary.textContent = 'Geolocation is not available in this browser. Type a start point manually.';
        }

        return;
    }

    currentLocationLoaded = true;

    if (routeSummary && !routeSummary.textContent) {
        routeSummary.textContent = 'Fetching your current location...';
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const label = await reverseGeocodeCoordinates(latitude, longitude);
            setStartLocationLabel(label);

            if (routeSummary) {
                routeSummary.textContent = 'Current location detected. Choose a destination to draw a route.';
            }

            if (map && window.google?.maps) {
                const currentPoint = { lat: latitude, lng: longitude };
                map.setCenter(currentPoint);
                map.setZoom(11);

                new google.maps.Marker({
                    position: currentPoint,
                    map,
                    title: 'Your current location'
                });
            }
        },
        () => {
            if (!startInput.value) {
                startInput.value = 'Current location';
            }

            if (routeSummary) {
                routeSummary.textContent = 'Location access was denied. Type a starting point manually.';
            }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
}

function getDemoRouteLayer() {
    if (demoRouteLayer) {
        return demoRouteLayer;
    }

    const mapContainer = document.getElementById('google-map');
    if (!mapContainer) {
        return null;
    }

    const existingLayer = document.getElementById('demo-route-layer');
    if (existingLayer) {
        demoRouteLayer = existingLayer;
        return demoRouteLayer;
    }

    demoRouteLayer = document.createElement('div');
    demoRouteLayer.id = 'demo-route-layer';
    demoRouteLayer.className = 'demo-route-layer';
    mapContainer.appendChild(demoRouteLayer);
    return demoRouteLayer;
}

function renderDemoRoute(start, end) {
    const mapContainer = document.getElementById('google-map');
    const routeSummary = document.getElementById('route-summary');
    const layer = getDemoRouteLayer();

    if (!mapContainer || !layer) {
        return;
    }

    const originLabel = start || 'Start point';
    const destinationLabel = end || 'Destination';

    layer.innerHTML = `
        <svg class="demo-route-svg" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="routeLine" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f59e0b" />
                    <stop offset="100%" stop-color="#f97316" />
                </linearGradient>
            </defs>
            <path d="M 130 430 C 280 220, 430 230, 540 325 S 770 455, 860 170" class="demo-route-path"></path>
            <circle cx="130" cy="430" r="22" class="demo-route-pin demo-route-pin-start"></circle>
            <circle cx="860" cy="170" r="22" class="demo-route-pin demo-route-pin-end"></circle>
            <text x="160" y="425" class="demo-route-label">${escapeHtml(originLabel)}</text>
            <text x="668" y="162" class="demo-route-label">${escapeHtml(destinationLabel)}</text>
        </svg>
    `;

    if (routeSummary) {
        routeSummary.textContent = `Demo route drawn from ${originLabel} to ${destinationLabel}.`;
    }

    mapContainer.classList.add('demo-route-active');
}

function clearDemoRoute() {
    const routeSummary = document.getElementById('route-summary');

    if (routeSummary) {
        routeSummary.textContent = 'Enter a start and destination, then draw the route on Google Maps.';
    }
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function showMessage(message) {
    const messageBox = document.getElementById('message-box');
    const messageText = document.getElementById('message-text');

    messageText.textContent = message;
    messageBox.classList.remove('translate-x-full');

    setTimeout(() => {
        messageBox.classList.add('translate-x-full');
    }, 3000);
}

function buildGoogleMapsDirectionsUrl(start, end) {
    const origin = encodeURIComponent(start || '');
    const destination = encodeURIComponent(end || '');

    if (!start || !end) {
        return 'https://www.google.com/maps?q=travel';
    }

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving&dir_action=navigate`;
}

function updateGoogleMapsFrame(start, end) {
    const openLink = document.getElementById('open-google-maps-link');

    if (!map) {
        renderFallbackMap(end || start || 'Paris, France');

        if (openLink) {
            openLink.href = buildGoogleMapsDirectionsUrl(start, end);
        }

        return;
    }

    const targetUrl = buildGoogleMapsDirectionsUrl(start, end);

    if (openLink) {
        openLink.href = targetUrl;
    }

    directionsService.route(
        {
            origin: start,
            destination: end,
            travelMode: google.maps.TravelMode.DRIVING,
        },
        (response, status) => {
            if (status === 'OK') {
                directionsRenderer.setDirections(response);
                map.setZoom(9);
                setMapStatus('');
                return;
            }

            setMapStatus('Google Maps could not draw the route. Check the start and destination values.');
        }
    );
}

function openModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.modal-backdrop').classList.add('opacity-100');
        modal.querySelector('.modal-content').classList.remove('scale-95');
        modal.querySelector('.modal-content').classList.add('scale-100');
    }, 10);
}

function closeModal(modal) {
    modal.querySelector('.modal-backdrop').classList.remove('opacity-100');
    modal.querySelector('.modal-content').classList.remove('scale-100');
    modal.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const bookingModal = document.getElementById('booking-modal');
    const loginBtn = document.getElementById('login-btn');
    const closeAuthModalBtn = document.getElementById('close-auth-modal');
    const closeBookingModalBtn = document.getElementById('close-booking-modal');
    const bookNowButtons = document.querySelectorAll('.book-now-btn');
    const authForm = document.getElementById('auth-form');
    const searchForm = document.getElementById('search-form');
    const bookingForm = document.getElementById('booking-form');
    const authLinks = document.getElementById('auth-links');
    const userInfo = document.getElementById('user-info');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutBtn = document.getElementById('logout-btn');
    const showRouteBtn = document.getElementById('show-route-btn');
    const mapStatus = document.getElementById('map-status');
    const endPointInput = document.getElementById('end-point');

    renderTravelSuggestions(endPointInput?.value || '');
    clearDemoRoute();

    loadGoogleMapsScript().catch(() => {
        renderFallbackMap(endPointInput?.value || 'Paris, France');
    });

    endPointInput?.addEventListener('input', () => {
        renderTravelSuggestions(endPointInput.value);
    });

    loginBtn.addEventListener('click', () => openModal(authModal));
    closeAuthModalBtn.addEventListener('click', () => closeModal(authModal));
    authModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(authModal));

    closeBookingModalBtn.addEventListener('click', () => closeModal(bookingModal));
    bookingModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(bookingModal));

    bookNowButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const destination = e.currentTarget.getAttribute('data-destination');
            document.getElementById('booking-modal-title').innerText = `Book Your Trip to ${destination}`;
            openModal(bookingModal);
        });
    });

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const username = email ? email.split('@')[0] : 'Traveler';

        closeModal(authModal);
        authLinks.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        welcomeMessage.textContent = `Welcome, ${username}!`;
        showMessage('Login successful!');
        authForm.reset();
    });

    logoutBtn.addEventListener('click', () => {
        userInfo.classList.add('hidden');
        userInfo.classList.remove('flex');
        authLinks.classList.remove('hidden');
        showMessage('You have been logged out.');
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const destination = document.getElementById('destination').value.trim();
        const searchResultEl = document.getElementById('search-result');

        searchResultEl.textContent = `Searching for ${destination || 'popular destinations'}...`;

        setTimeout(() => {
            if (destination) {
                searchResultEl.textContent = `Found 3 amazing packages for ${destination}!`;
            } else {
                searchResultEl.textContent = 'Showing our top-rated travel packages.';
            }
        }, 1000);
    });

    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        closeModal(bookingModal);
        showMessage('Your booking has been confirmed!');
        bookingForm.reset();
    });

    const calculateAndDisplayRoute = () => {
        const start = document.getElementById('start-point').value.trim();
        const end = document.getElementById('end-point').value.trim();

        if (!start || !end) {
            showMessage('Please enter both a start and end point.');
            return;
        }

        if (!map || !directionsService || !directionsRenderer) {
            updateGoogleMapsFrame(start, end);
            renderTravelSuggestions(end);
            const routeSummary = document.getElementById('route-summary');
            if (routeSummary) {
                routeSummary.textContent = `Preview map updated from ${start} to ${end}.`;
            }

            showMessage('Showing preview map because the live API key is not configured.');
            return;
        }

        updateGoogleMapsFrame(start, end);
        renderTravelSuggestions(end);

        const routeSummary = document.getElementById('route-summary');
        if (routeSummary) {
            routeSummary.textContent = `Route preview updated from ${start} to ${end}.`;
        }

        showMessage('Route updated on Google Maps.');
    };

    showRouteBtn.addEventListener('click', calculateAndDisplayRoute);
});
