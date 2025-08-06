/**
 * Enhanced Prayer Time Web Application
 * Improvements: Better error handling, performance optimization, code organization,
 * proper state management, and enhanced user experience
 */

class PrayerTimeApp {
    constructor() {
        // Constants - Updated to match CSV format (Imsak included for data but not display)
        this.PRAYER_NAMES = ["Imsak", "Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"];
        this.DISPLAY_PRAYER_NAMES = ["Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"]; // For table display only
        this.AUDIO_NAMES = ["imsak", "subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"];
        this.RECITATION_OFFSET_MIN = 10;
        this.UPDATE_INTERVAL = 1000;
        this.AUDIO_CLEAR_INTERVAL = 60 * 1000;
        this.AUDIO_TRIGGER_THRESHOLD = 1000; // 1 second tolerance

        // State management
        this.state = {
            audioCache: new Map(),
            audioPlayed: new Set(),
            currentDateKey: null,
            nextPrayer: null,
            nextTimeMs: null,
            todayPrayerTimes: {},
            currentHijriDate: "",
            csvDataRaw: "",
            isInitialized: false,
            clockInterval: null,
            audioInterval: null
        };

        // Localization
        this.locale = {
            days: ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"],
            months: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"],
            monthsEn: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            messages: {
                loading: "Memuatkan data waktu solat...",
                allPrayersComplete: "Semua waktu solat untuk hari ini telah selesai.",
                nextPrayerFormat: "Waktu Solat ({prayer}) dalam {hours}j {mins}m {secs}s",
                hijriDateFormat: "Tarikh Hijri: {date}",
                audioError: "Ralat memainkan audio",
                csvLoadError: "Ralat memuatkan data waktu solat",
                noDataFound: "Tiada data waktu solat dijumpai untuk tarikh ini"
            }
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            await this.preloadAllAudio();
            await this.loadCSVData();
            this.setupEventListeners();
            this.startClockUpdates();
            this.startAudioClearInterval();
            this.state.isInitialized = true;
            console.log("Prayer Time App initialized successfully");
        } catch (error) {
            console.error("Failed to initialize Prayer Time App:", error);
            this.showError("Gagal memulakan aplikasi. Sila muat semula halaman.");
        }
    }

    /**
     * Preload all audio files for better performance (excluding Imsak)
     */
    async preloadAllAudio() {
        // Only preload audio for actual prayers, not Imsak
        const audioNames = ["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"];
        const loadPromises = audioNames.flatMap(name => [
            this.preloadAudio(`${name}_recite.mp3`),
            this.preloadAudio(`${name}_adhan.mp3`)
        ]);

        try {
            await Promise.all(loadPromises);
            console.log("All audio files preloaded successfully");
        } catch (error) {
            console.warn("Some audio files failed to preload:", error);
        }
    }

    /**
     * Preload individual audio file
     */
    preloadAudio(filename) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(filename);
            audio.preload = "auto";
            
            audio.addEventListener('canplaythrough', () => {
                this.state.audioCache.set(filename, audio);
                resolve(audio);
            }, { once: true });

            audio.addEventListener('error', (e) => {
                console.warn(`Failed to preload ${filename}:`, e);
                reject(e);
            }, { once: true });

            // Timeout fallback
            setTimeout(() => {
                if (!this.state.audioCache.has(filename)) {
                    this.state.audioCache.set(filename, audio);
                    resolve(audio);
                }
            }, 5000);
        });
    }

    /**
     * Load CSV data with better error handling
     */
    async loadCSVData() {
        try {
            const response = await fetch("prayer_times.csv");
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.state.csvDataRaw = await response.text();
            if (!this.state.csvDataRaw.trim()) {
                throw new Error("CSV file is empty");
            }

            const today = new Date();
            this.loadPrayerTimesForDate(today);
            console.log("CSV data loaded successfully");
        } catch (error) {
            console.error("Failed to load CSV data:", error);
            throw new Error(this.locale.messages.csvLoadError);
        }
    }

    /**
     * Parse and load prayer times for a specific date
     */
    loadPrayerTimesForDate(date) {
        if (!this.state.csvDataRaw) {
            console.warn("CSV data not available");
            return false;
        }

        const lines = this.state.csvDataRaw.trim().split("\n");
        if (lines.length < 2) {
            console.error("Invalid CSV format");
            return false;
        }

        const headers = lines[0].split(",").map(h => h.trim());
        const dateKey = this.formatDate(date);

        // Find the "Date Masihi" column index
        const dateColumnIndex = headers.findIndex(header => 
            header.toLowerCase().includes('date masihi') || 
            header.toLowerCase().includes('masihi') ||
            header === 'Date Masihi'
        );

        if (dateColumnIndex === -1) {
            console.error("Could not find 'Date Masihi' column in CSV");
            return false;
        }

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(",").map(cell => cell.trim());
            
            // Compare with the date in the correct column
            if (row[dateColumnIndex] === dateKey) {
                this.state.todayPrayerTimes = {};
                headers.forEach((header, idx) => {
                    if (idx < row.length) {
                        this.state.todayPrayerTimes[header] = row[idx];
                    }
                });

                this.state.currentHijriDate = this.state.todayPrayerTimes["Date Hijri"] || "";
                this.state.currentDateKey = dateKey;
                
                this.updateHijriDateDisplay();
                this.populatePrayerTable();
                
                console.log("Prayer times loaded for:", dateKey, this.state.todayPrayerTimes);
                return true;
            }
        }

        console.warn("No prayer times found for date:", dateKey);
        this.showError(this.locale.messages.noDataFound);
        return false;
    }

    /**
     * Main clock update function with optimized checks
     */
    updateClock() {
        if (!this.state.isInitialized) return;

        const now = new Date();
        
        // Check for date change (only once per minute to optimize performance)
        if (now.getSeconds() === 0) {
            this.checkDateChange(now);
        }

        this.updateTimeDisplay(now);
        this.checkAndUpdatePrayerHighlight(now);
        this.updateNextPrayerTimer(now);
        this.checkPrayerAudio(now);
    }

    /**
     * Check if date has changed and reload data if necessary
     */
    checkDateChange(now) {
        const todayKey = this.formatDate(now);
        if (todayKey !== this.state.currentDateKey && this.state.csvDataRaw) {
            console.log("New day detected. Reloading prayer data.", {
                old: this.state.currentDateKey,
                new: todayKey
            });
            this.loadPrayerTimesForDate(now);
        }
    }

    /**
     * Update time and date displays
     */
    updateTimeDisplay(now) {
        const timeElement = document.getElementById("current-time");
        const dateElement = document.getElementById("gregorian-date");
        
        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
        
        if (dateElement) {
            dateElement.textContent = this.formatLongDate(now);
        }
    }

    /**
     * Update Hijri date display
     */
    updateHijriDateDisplay() {
        const hijriElement = document.getElementById("hijri-date");
        if (hijriElement && this.state.currentHijriDate) {
            hijriElement.textContent = this.locale.messages.hijriDateFormat
                .replace('{date}', this.state.currentHijriDate);
        }
    }

    /**
     * Format date for CSV lookup (optimized)
     */
    formatDate(date) {
        const day = date.getDate();
        const month = this.locale.monthsEn[date.getMonth()];
        const year = date.getFullYear().toString().slice(-2);
        return `${day}-${month}-${year}`;
    }

    /**
     * Format long date for display
     */
    formatLongDate(date) {
        const dayName = this.locale.days[date.getDay()];
        const dayNum = String(date.getDate()).padStart(2, '0');
        const monthName = this.locale.months[date.getMonth()];
        const year = date.getFullYear();
        return `${dayName}, ${dayNum} ${monthName} ${year}`;
    }

    /**
     * Parse time string to hour and minute
     */
    parseTime(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            throw new Error(`Invalid time string: ${timeStr}`);
        }

        const parts = timeStr.trim().split(" ");
        if (parts.length !== 2) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [time, modifier] = parts;
        const timeParts = time.split(":");
        
        if (timeParts.length !== 2) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        let [hour, minute] = timeParts.map(Number);
        
        if (isNaN(hour) || isNaN(minute)) {
            throw new Error(`Invalid time values: ${timeStr}`);
        }

        if (modifier === "PM" && hour !== 12) hour += 12;
        if (modifier === "AM" && hour === 12) hour = 0;
        
        return { hour, minute };
    }

    /**
     * Get time in milliseconds for today
     */
    getTimeInMs(hour, minute) {
        const now = new Date();
        const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
        return time.getTime();
    }

    /**
     * Populate prayer table with current data (excluding Imsak)
     */
    populatePrayerTable() {
        const container = document.getElementById("prayer-table");
        if (!container) return;

        // Clear existing content
        const existingRow = container.querySelector("tr");
        if (existingRow) {
            existingRow.innerHTML = "";
        } else {
            const newRow = document.createElement("tr");
            container.appendChild(newRow);
        }

        const row = container.querySelector("tr");

        // Only display prayers excluding Imsak
        this.DISPLAY_PRAYER_NAMES.forEach(name => {
            const time = this.state.todayPrayerTimes[name];
            if (!time) return;

            const cell = document.createElement("td");
            cell.setAttribute("data-prayer", name);
            cell.innerHTML = `
                <div class="prayer-name">${name}</div>
                <div class="prayer-time">${time}</div>
            `;
            row.appendChild(cell);
        });
    }

    /**
     * Update prayer highlight with error handling (only for displayed prayers)
     */
    checkAndUpdatePrayerHighlight(now) {
        if (!this.hasPrayerTimes()) return;

        let currentPrayer = null;
        const nowMs = now.getTime();

        // Check all prayers including Imsak for current prayer logic
        for (const name of this.PRAYER_NAMES) {
            const timeStr = this.state.todayPrayerTimes[name];
            if (!timeStr) continue;

            try {
                const { hour, minute } = this.parseTime(timeStr);
                const timeMs = this.getTimeInMs(hour, minute);
                if (nowMs >= timeMs) {
                    currentPrayer = name;
                }
            } catch (error) {
                console.warn(`Error parsing time for ${name}:`, error);
                continue;
            }
        }

        this.updatePrayerHighlight(currentPrayer);
    }

    /**
     * Update visual highlight for current prayer (only for displayed prayers)
     */
    updatePrayerHighlight(currentPrayer) {
        const cells = document.querySelectorAll("td[data-prayer]");
        cells.forEach(cell => {
            const prayerName = cell.getAttribute("data-prayer");
            const isCurrentPrayer = prayerName === currentPrayer;
            
            // Remove existing classes
            cell.className = cell.className.replace(/\bcurrent\b/g, '').trim();
            
            // Add current class if this is the current prayer and it's displayed
            if (isCurrentPrayer && this.DISPLAY_PRAYER_NAMES.includes(currentPrayer)) {
                cell.className += (cell.className ? ' ' : '') + 'current';
            }
        });
    }

    /**
     * Update next prayer timer with improved logic
     */
    updateNextPrayerTimer(now) {
        const timerElement = document.getElementById("next-prayer-timer");
        if (!timerElement) return;

        if (!this.hasPrayerTimes()) {
            timerElement.textContent = this.locale.messages.loading;
            return;
        }

        const nowMs = now.getTime();
        let nextPrayer = null;
        let nextTimeMs = Infinity;

        // Skip Imsak for next prayer calculation as it's for fasting preparation
        const prayersForTimer = this.PRAYER_NAMES.filter(name => name !== "Imsak");

        for (const name of prayersForTimer) {
            const timeStr = this.state.todayPrayerTimes[name];
            if (!timeStr) continue;

            try {
                const { hour, minute } = this.parseTime(timeStr);
                const timeMs = this.getTimeInMs(hour, minute);
                
                if (timeMs > nowMs && timeMs < nextTimeMs) {
                    nextTimeMs = timeMs;
                    nextPrayer = name;
                }
            } catch (error) {
                console.warn(`Error parsing time for ${name}:`, error);
                continue;
            }
        }

        // Update state
        this.state.nextPrayer = nextPrayer;
        this.state.nextTimeMs = nextTimeMs === Infinity ? null : nextTimeMs;

        if (!nextPrayer) {
            timerElement.textContent = this.locale.messages.allPrayersComplete;
            return;
        }

        const diffMs = nextTimeMs - nowMs;
        const { hours, mins, secs } = this.formatTimeDifference(diffMs);
        
        timerElement.textContent = this.locale.messages.nextPrayerFormat
            .replace('{prayer}', nextPrayer)
            .replace('{hours}', String(hours).padStart(2, '0'))
            .replace('{mins}', String(mins).padStart(2, '0'))
            .replace('{secs}', String(secs).padStart(2, '0'));
    }

    /**
     * Format time difference into hours, minutes, seconds
     */
    formatTimeDifference(diffMs) {
        const totalSecs = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return { hours, mins, secs };
    }

    /**
     * Check and trigger prayer audio with improved timing
     */
    checkPrayerAudio(now) {
        if (!this.state.nextPrayer || !this.state.nextTimeMs) return;

        const nowMs = now.getTime();
        const reciteTime = this.state.nextTimeMs - (this.RECITATION_OFFSET_MIN * 60 * 1000);
        
        // Skip audio for Imsak as it's not a prayer time, just fasting preparation
        if (this.state.nextPrayer === "Imsak") return;
        
        const reciteFile = `${this.state.nextPrayer.toLowerCase()}_recite.mp3`;
        const adhanFile = `${this.state.nextPrayer.toLowerCase()}_adhan.mp3`;

        // Check for recitation audio
        if (this.shouldPlayAudio(nowMs, reciteTime, reciteFile)) {
            console.log(`Playing recitation for ${this.state.nextPrayer}`);
            this.playAudio(reciteFile);
            this.state.audioPlayed.add(reciteFile);
        }

        // Check for adhan audio
        if (this.shouldPlayAudio(nowMs, this.state.nextTimeMs, adhanFile)) {
            console.log(`Playing adhan for ${this.state.nextPrayer}`);
            this.playAudio(adhanFile);
            this.state.audioPlayed.add(adhanFile);
        }
    }

    /**
     * Determine if audio should be played
     */
    shouldPlayAudio(nowMs, targetMs, filename) {
        return Math.abs(nowMs - targetMs) < this.AUDIO_TRIGGER_THRESHOLD && 
               !this.state.audioPlayed.has(filename);
    }

    /**
     * Play audio with error handling
     */
    playAudio(filename) {
        if (!filename) {
            console.warn("playAudio called with no filename");
            return;
        }

        const audio = this.state.audioCache.get(filename);
        if (!audio) {
            console.warn("Audio not preloaded:", filename);
            return;
        }

        console.log("Playing:", filename);
        audio.currentTime = 0;
        
        audio.play()
            .then(() => console.log(`Successfully playing ${filename}`))
            .catch(error => {
                console.error(`Failed to play ${filename}:`, error);
                this.showError(this.locale.messages.audioError);
            });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const startButton = document.getElementById("start-button");
        if (startButton) {
            startButton.addEventListener("click", this.handleStartButtonClick.bind(this));
        }

        // Add other event listeners as needed
        this.setupTestButtons();
    }

    /**
     * Handle start button click
     */
    handleStartButtonClick() {
        const startScreen = document.getElementById("start-screen");
        if (startScreen) {
            startScreen.style.display = "none";
        }

        // Unlock audio playback
        this.unlockAudioPlayback();
    }

    /**
     * Unlock audio playback for all browsers
     */
    unlockAudioPlayback() {
        const unlockPromises = Array.from(this.state.audioCache.values()).map(audio => {
            return audio.play()
                .then(() => audio.pause())
                .then(() => { audio.currentTime = 0; })
                .catch(() => {}); // Ignore errors during unlock
        });

        Promise.all(unlockPromises)
            .then(() => console.log("Audio playback unlocked"))
            .catch(() => console.warn("Some audio unlock attempts failed"));
    }

    /**
     * Setup test buttons (optional)
     */
    setupTestButtons() {
        const adhanButton = document.getElementById("button-adhan");
        if (adhanButton) {
            adhanButton.addEventListener("click", () => {
                if (this.state.nextPrayer) {
                    const filename = `${this.state.nextPrayer.toLowerCase()}_adhan.mp3`;
                    this.playAudio(filename);
                }
            });
        }

        const reciteButton = document.getElementById("button-recite");
        if (reciteButton) {
            reciteButton.addEventListener("click", () => {
                if (this.state.nextPrayer) {
                    const filename = `${this.state.nextPrayer.toLowerCase()}_recite.mp3`;
                    this.playAudio(filename);
                }
            });
        }
    }

    /**
     * Start clock update intervals
     */
    startClockUpdates() {
        if (this.state.clockInterval) {
            clearInterval(this.state.clockInterval);
        }
        
        this.state.clockInterval = setInterval(() => {
            this.updateClock();
        }, this.UPDATE_INTERVAL);
        
        // Initial update
        this.updateClock();
    }

    /**
     * Start audio clear interval
     */
    startAudioClearInterval() {
        if (this.state.audioInterval) {
            clearInterval(this.state.audioInterval);
        }
        
        this.state.audioInterval = setInterval(() => {
            console.log("Clearing audioPlayed set for the new minute");
            this.state.audioPlayed.clear();
        }, this.AUDIO_CLEAR_INTERVAL);
    }

    /**
     * Check if prayer times are loaded
     */
    hasPrayerTimes() {
        return Object.keys(this.state.todayPrayerTimes).length > 0;
    }

    /**
     * Show error message to user
     */
    showError(message) {
        console.error(message);
        // You can implement a toast notification or error display here
        const errorElement = document.getElementById("error-message");
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = "block";
            setTimeout(() => {
                errorElement.style.display = "none";
            }, 5000);
        }
    }

    /**
     * Cleanup method
     */
    destroy() {
        if (this.state.clockInterval) {
            clearInterval(this.state.clockInterval);
        }
        if (this.state.audioInterval) {
            clearInterval(this.state.audioInterval);
        }
        
        // Pause and cleanup audio
        this.state.audioCache.forEach(audio => {
            audio.pause();
            audio.src = "";
        });
        
        this.state.audioCache.clear();
        this.state.audioPlayed.clear();
    }
}

// Initialize the application when DOM is loaded
let prayerApp;

window.addEventListener("DOMContentLoaded", () => {
    prayerApp = new PrayerTimeApp();
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    if (prayerApp) {
        prayerApp.destroy();
    }
});
