/**
 * Enhanced Prayer Time Web Application
 * Improvements: Better error handling, performance optimization, code organization,
 * proper state management, enhanced user experience, warm color theming, and TV-friendly features
 * 
 * Version: 2.0
 * Compatible with JAKIM CSV format
 */

class PrayerTimeApp {
    constructor() {
        // Constants - Updated to match CSV format (Imsak included for data but not display)
        this.PRAYER_NAMES = ["Imsak", "Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"];
        this.DISPLAY_PRAYER_NAMES = ["Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"]; // For table display only
        this.AUDIO_NAMES = ["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"];
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
            audioInterval: null,
            performanceStats: {
                updateCount: 0,
                totalTime: 0
            }
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
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log("Initializing Prayer Time App...");
            
            // Add performance monitoring
            this.addPerformanceLogging();
            
            // Monitor connection status
            this.monitorConnection();
            
            // Load and validate data
            await this.preloadAllAudio();
            await this.loadCSVData();
            
            // Setup UI
            this.setupEventListeners();
            this.startClockUpdates();
            this.startAudioClearInterval();
            
            this.state.isInitialized = true;
            console.log("Prayer Time App initialized successfully");
            
            // Remove loading state from UI
            const loadingElements = document.querySelectorAll('.loading');
            loadingElements.forEach(el => el.classList.remove('loading'));
            
        } catch (error) {
            console.error("Failed to initialize Prayer Time App:", error);
            this.showError("Ralat memulakan aplikasi. Sila semak sambungan internet dan muat semula halaman.", false);
            
            // Retry initialization after 5 seconds
            setTimeout(() => {
                console.log("Retrying initialization...");
                this.init();
            }, 5000);
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
     * Enhanced CSV validation specific to JAKIM format
     */
    validateCSVFormat(csvText) {
        const lines = csvText.trim().split("\n");
        if (lines.length < 2) {
            throw new Error("CSV file must have at least header and one data row");
        }
        
        const headers = lines[0].split(",").map(h => h.trim());
        console.log("CSV Headers found:", headers);
        
        // Check for required columns based on actual JAKIM CSV
        const expectedHeaders = ["Date Masihi", "Date Hijri", "Day", "Imsak", "Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"];
        const missingHeaders = expectedHeaders.filter(expected => 
            !headers.includes(expected)
        );
        
        if (missingHeaders.length > 0) {
            throw new Error(`Missing required CSV columns: ${missingHeaders.join(", ")}`);
        }
        
        // Validate first data row format
        if (lines.length > 1) {
            const firstRow = lines[1].split(",").map(cell => cell.trim());
            
            // Check date format (should match: "1-Jan-25")
            const datePattern = /^\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/;
            if (!datePattern.test(firstRow[0])) {
                throw new Error(`Invalid date format in CSV. Expected format: "1-Jan-25", got: "${firstRow[0]}"`);
            }
            
            // Check time format (should match: "5:59 AM")
            const timePattern = /^\d{1,2}:\d{2} (AM|PM)$/;
            const timeColumns = [3, 4, 5, 6, 7, 8, 9]; // Imsak through Isyak
            
            for (let i of timeColumns) {
                if (i < firstRow.length && !timePattern.test(firstRow[i])) {
                    console.warn(`Potential time format issue in column ${headers[i]}: "${firstRow[i]}"`);
                }
            }
        }
        
        console.log("CSV format validation passed");
        return true;
    }

    /**
     * Enhanced CSV data loading with validation and debugging
     */
    async loadCSVData() {
        try {
            console.log("Loading CSV data from prayer_times.csv...");
            const response = await fetch("prayer_times.csv");
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.state.csvDataRaw = await response.text();
            
            if (!this.state.csvDataRaw.trim()) {
                throw new Error("CSV file is empty");
            }

            // Validate CSV format
            this.validateCSVFormat(this.state.csvDataRaw);
            
            // Debug CSV data
            this.debugCSVData();
            
            // Load today's data
            const today = this.getCurrentLocalTime();
            const success = this.loadPrayerTimesForDate(today);
            
            if (!success) {
                // Try next few days if today's data not found
                console.log("Today's data not found, checking next few days...");
                for (let i = 1; i <= 7; i++) {
                    const futureDate = new Date(today);
                    futureDate.setDate(today.getDate() + i);
                    if (this.loadPrayerTimesForDate(futureDate)) {
                        console.log(`Using data for: ${this.formatDate(futureDate)}`);
                        break;
                    }
                }
            }
            
            console.log("CSV data loaded successfully");
        } catch (error) {
            console.error("Failed to load CSV data:", error);
            this.showError(`Ralat memuatkan data: ${error.message}`);
            throw error;
        }
    }

    /**
     * Enhanced date formatting that matches JAKIM CSV exactly
     */
    formatDate(date) {
        const day = date.getDate(); // No padding needed for CSV format
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear().toString().slice(-2);
        return `${day}-${month}-${year}`;
    }

    /**
     * Get current time in Malaysia timezone (UTC+8)
     */
    getCurrentLocalTime() {
        const now = new Date();
        
        // Ensure we're working with Malaysia timezone (UTC+8)
        const malaysiaOffset = 8 * 60; // Malaysia is UTC+8
        const localOffset = now.getTimezoneOffset();
        const malaysiaTime = new Date(now.getTime() + (localOffset + malaysiaOffset) * 60000);
        
        return malaysiaTime;
    }

    /**
     * Enhanced prayer times loading with better error handling
     */
    loadPrayerTimesForDate(date) {
        if (!this.state.csvDataRaw) {
            console.warn("CSV data not available");
            return false;
        }

        const lines = this.state.csvDataRaw.trim().split("\n");
        if (lines.length < 2) {
            console.error("Invalid CSV format - no data rows");
            return false;
        }

        const headers = lines[0].split(",").map(h => h.trim());
        const dateKey = this.formatDate(date);
        
        console.log(`Looking for date: ${dateKey}`);

        // Find the exact row for this date
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(",").map(cell => cell.trim());
            
            // Check if this row matches our date
            if (row[0] === dateKey) {
                // Build prayer times object
                this.state.todayPrayerTimes = {};
                headers.forEach((header, idx) => {
                    if (idx < row.length) {
                        this.state.todayPrayerTimes[header] = row[idx];
                    }
                });

                // Extract specific fields
                this.state.currentHijriDate = this.state.todayPrayerTimes["Date Hijri"] || "";
                this.state.currentDateKey = dateKey;
                
                // Log loaded times for debugging
                console.log("Prayer times loaded for:", dateKey);
                console.log("Hijri date:", this.state.currentHijriDate);
                console.log("Day:", this.state.todayPrayerTimes["Day"]);
                
                // Log all prayer times
                this.PRAYER_NAMES.forEach(prayer => {
                    console.log(`${prayer}: ${this.state.todayPrayerTimes[prayer]}`);
                });
                
                this.updateHijriDateDisplay();
                this.populatePrayerTable();
                
                return true;
            }
        }

        console.warn(`No prayer times found for date: ${dateKey}`);
        
        // Show available dates for debugging
        const availableDates = lines.slice(1, 6).map(line => line.split(",")[0]);
        console.log("Available dates (first 5):", availableDates);
        
        this.showError(`Tiada data waktu solat untuk ${dateKey}`);
        return false;
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
     * Enhanced time parsing with better error messages
     */
    parseTime(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            throw new Error(`Invalid time string: ${timeStr}`);
        }

        const trimmed = timeStr.trim();
        const parts = trimmed.split(" ");
        
        if (parts.length !== 2) {
            throw new Error(`Invalid time format: "${timeStr}". Expected format: "5:59 AM"`);
        }

        const [time, modifier] = parts;
        const timeParts = time.split(":");
        
        if (timeParts.length !== 2) {
            throw new Error(`Invalid time format: "${timeStr}". Time part should be "HH:MM"`);
        }

        const [hourStr, minuteStr] = timeParts;
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        
        if (isNaN(hour) || isNaN(minute)) {
            throw new Error(`Invalid time values: "${timeStr}". Hour: ${hourStr}, Minute: ${minuteStr}`);
        }
        
        if (hour < 1 || hour > 12) {
            throw new Error(`Invalid hour in 12-hour format: ${hour}`);
        }
        
        if (minute < 0 || minute > 59) {
            throw new Error(`Invalid minute: ${minute}`);
        }
        
        if (modifier !== "AM" && modifier !== "PM") {
            throw new Error(`Invalid time modifier: "${modifier}". Expected AM or PM`);
        }

        // Convert to 24-hour format
        let hour24 = hour;
        if (modifier === "PM" && hour !== 12) {
            hour24 += 12;
        } else if (modifier === "AM" && hour === 12) {
            hour24 = 0;
        }
        
        return { hour: hour24, minute };
    }

    /**
     * Get time in milliseconds for today
     */
    getTimeInMs(hour, minute) {
        const now = this.getCurrentLocalTime();
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
     * Main clock update function with optimized checks
     */
    updateClock() {
        if (!this.state.isInitialized) return;

        const now = this.getCurrentLocalTime();
        
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
     * Enhanced Hijri date display with day name
     */
    updateHijriDateDisplay() {
        const hijriElement = document.getElementById("hijri-date");
        if (hijriElement && this.state.currentHijriDate) {
            const dayName = this.state.todayPrayerTimes["Day"] || "";
            const hijriText = dayName ? 
                `${dayName} - ${this.state.currentHijriDate}` : 
                this.state.currentHijriDate;
                
            hijriElement.textContent = `Tarikh Hijri: ${hijriText}`;
        }
    }

    /**
     * Update prayer highlight with visual states (including passed prayers)
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

        this.updatePrayerHighlight(currentPrayer, now);
    }

    /**
     * Enhanced visual highlight with passed prayer states
     */
    updatePrayerHighlight(currentPrayer, now) {
        const cells = document.querySelectorAll("td[data-prayer]");
        const nowMs = now.getTime();
        
        cells.forEach(cell => {
            const prayerName = cell.getAttribute("data-prayer");
            const timeStr = this.state.todayPrayerTimes[prayerName];
            
            // Remove existing classes
            cell.className = cell.className.replace(/\b(current|passed)\b/g, '').trim();
            
            if (timeStr) {
                try {
                    const { hour, minute } = this.parseTime(timeStr);
                    const timeMs = this.getTimeInMs(hour, minute);
                    
                    if (prayerName === currentPrayer && this.DISPLAY_PRAYER_NAMES.includes(currentPrayer)) {
                        cell.classList.add('current');
                    } else if (nowMs > timeMs + (5 * 60 * 1000)) { // 5 minutes grace
                        cell.classList.add('passed');
                    }
                } catch (error) {
                    console.warn(`Error parsing time for ${prayerName}:`, error);
                }
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
     * Add performance monitoring
     */
    addPerformanceLogging() {
        const originalUpdateClock = this.updateClock.bind(this);
        
        this.updateClock = function() {
            const startTime = performance.now();
            originalUpdateClock();
            const endTime = performance.now();
            
            this.state.performanceStats.updateCount++;
            this.state.performanceStats.totalTime += (endTime - startTime);
            
            // Log performance every 60 updates (1 minute)
            if (this.state.performanceStats.updateCount % 60 === 0) {
                const avgTime = this.state.performanceStats.totalTime / this.state.performanceStats.updateCount;
                console.log(`Performance: ${this.state.performanceStats.updateCount} updates, avg ${avgTime.toFixed(2)}ms per update`);
            }
        }.bind(this);
    }

    /**
     * Add connection status monitoring
     */
    monitorConnection() {
        const updateConnectionStatus = () => {
            const statusBar = document.querySelector('.status-bar');
            if (statusBar) {
                if (navigator.onLine) {
                    statusBar.classList.add('connected');
                    statusBar.innerHTML = '<span>● Data JAKIM Rasmi</span>';
                } else {
                    statusBar.classList.remove('connected');
                    statusBar.innerHTML = '<span class="status-offline">● Offline</span>';
                }
            }
        };
        
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);
        
        // Initial check
        updateConnectionStatus();
    }

    /**
     * Add debugging method to check CSV data
     */
    debugCSVData() {
        if (!this.state.csvDataRaw) {
            console.log("No CSV data loaded");
            return;
        }
        
        const lines = this.state.csvDataRaw.trim().split("\n");
        console.log("=== CSV Debug Info ===");
        console.log(`Total lines: ${lines.length}`);
        console.log("Headers:", lines[0]);
        console.log("First data row:", lines[1]);
        console.log("Last data row:", lines[lines.length - 1]);
        
        // Check date range
        if (lines.length > 1) {
            const firstDate = lines[1].split(",")[0];
            const lastDate = lines[lines.length - 1].split(",")[0];
            console.log(`Date range: ${firstDate} to ${lastDate}`);
        }
        
        // Current lookup
        const today = this.getCurrentLocalTime();
        const todayKey = this.formatDate(today);
        console.log(`Today's lookup key: ${todayKey}`);
        
        const foundRow = lines.find(line => line.startsWith(todayKey));
        console.log("Today's row found:", !!foundRow);
        if (foundRow) {
            console.log("Today's data:", foundRow);
        }
    }

    /**
     * Check if prayer times are loaded
     */
    hasPrayerTimes() {
        return Object.keys(this.state.todayPrayerTimes).length > 0;
    }

    /**
     * Enhanced error handling with user-friendly messages
     */
    showError(message, autoHide = true) {
        console.error(message);
        const errorElement = document.getElementById("error-message");
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = "block";
            
            if (autoHide) {
                setTimeout(() => {
                    errorElement.style.display = "none";
                }, 5000);
            }
        }
        
        // Also show in console for debugging
        console.error("Prayer App Error:", message);
    }

    /**
     * Add method to manually refresh data
     */
    async refreshData() {
        try {
            console.log("Manually refreshing prayer data...");
            await this.loadCSVData();
            this.updateClock(); // Force immediate update
            console.log("Data refreshed successfully");
        } catch (error) {
            console.error("Failed to refresh data:", error);
            this.showError("Gagal menyegarkan data");
        }
    }

    /**
     * Get debug information for troubleshooting
     */
    getDebugInfo() {
        return {
            isInitialized: this.state.isInitialized,
            currentDate: this.state.currentDateKey,
            nextPrayer: this.state.nextPrayer,
            prayerTimesCount: Object.keys(this.state.todayPrayerTimes).length,
            audioFilesLoaded: this.state.audioCache.size,
            audioPlayed: Array.from(this.state.audioPlayed),
            hijriDate: this.state.currentHijriDate,
            performanceStats: this.state.performanceStats,
            csvDataLength: this.state.csvDataRaw.length
        };
    }

    /**
     * Manual audio test methods for debugging
     */
    testAudio(prayerName, type = 'adhan') {
        if (!this.AUDIO_NAMES.includes(prayerName.toLowerCase())) {
            console.error(`Invalid prayer name: ${prayerName}`);
            return;
        }
        
        if (!['adhan', 'recite'].includes(type)) {
            console.error(`Invalid audio type: ${type}. Use 'adhan' or 'recite'`);
            return;
        }
        
        const filename = `${prayerName.toLowerCase()}_${type}.mp3`;
        console.log(`Testing audio: ${filename}`);
        this.playAudio(filename);
    }

    /**
     * Force next prayer for testing
     */
    forceNextPrayer(prayerName) {
        if (!this.PRAYER_NAMES.includes(prayerName)) {
            console.error(`Invalid prayer name: ${prayerName}`);
            return;
        }
        
        const timeStr = this.state.todayPrayerTimes[prayerName];
        if (!timeStr) {
            console.error(`No time found for prayer: ${prayerName}`);
            return;
        }
        
        try {
            const { hour, minute } = this.parseTime(timeStr);
            const timeMs = this.getTimeInMs(hour, minute);
            
            this.state.nextPrayer = prayerName;
            this.state.nextTimeMs = timeMs;
            
            console.log(`Forced next prayer to: ${prayerName} at ${timeStr}`);
            this.updateNextPrayerTimer(this.getCurrentLocalTime());
        } catch (error) {
            console.error(`Error setting next prayer:`, error);
        }
    }

    /**
     * Get prayer times for any date (for debugging)
     */
    getPrayerTimesForDate(dateStr) {
        if (!this.state.csvDataRaw) {
            console.log("No CSV data loaded");
            return null;
        }
        
        const lines = this.state.csvDataRaw.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(",").map(cell => cell.trim());
            
            if (row[0] === dateStr) {
                const prayerTimes = {};
                headers.forEach((header, idx) => {
                    if (idx < row.length) {
                        prayerTimes[header] = row[idx];
                    }
                });
                return prayerTimes;
            }
        }
        
        return null;
    }

    /**
     * List available dates in CSV (for debugging)
     */
    getAvailableDates(limit = 10) {
        if (!this.state.csvDataRaw) {
            console.log("No CSV data loaded");
            return [];
        }
        
        const lines = this.state.csvDataRaw.trim().split("\n");
        return lines.slice(1, limit + 1).map(line => line.split(",")[0]);
    }

    /**
     * Enhanced cleanup method
     */
    destroy() {
        console.log("Destroying Prayer Time App...");
        
        // Clear intervals
        if (this.state.clockInterval) {
            clearInterval(this.state.clockInterval);
            this.state.clockInterval = null;
        }
        if (this.state.audioInterval) {
            clearInterval(this.state.audioInterval);
            this.state.audioInterval = null;
        }
        
        // Pause and cleanup audio
        this.state.audioCache.forEach(audio => {
            audio.pause();
            audio.src = "";
        });
        
        // Clear state
        this.state.audioCache.clear();
        this.state.audioPlayed.clear();
        this.state.todayPrayerTimes = {};
        this.state.csvDataRaw = "";
        this.state.isInitialized = false;
        
        console.log("Prayer Time App destroyed");
    }

    /**
     * Restart the application
     */
    restart() {
        console.log("Restarting Prayer Time App...");
        this.destroy();
        setTimeout(() => {
            this.init();
        }, 1000);
    }
}

// Global instance and initialization
let prayerApp;

/**
 * Initialize the application when DOM is loaded
 */
window.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded, initializing Prayer Time App...");
    prayerApp = new PrayerTimeApp();
    
    // Expose to global scope for debugging
    window.prayerApp = prayerApp;
    
    // Add global debugging helpers
    window.debugPrayerApp = {
        getInfo: () => prayerApp.getDebugInfo(),
        refreshData: () => prayerApp.refreshData(),
        testAudio: (prayer, type) => prayerApp.testAudio(prayer, type),
        forceNext: (prayer) => prayerApp.forceNextPrayer(prayer),
        getPrayerTimes: (date) => prayerApp.getPrayerTimesForDate(date),
        getAvailableDates: (limit) => prayerApp.getAvailableDates(limit),
        restart: () => prayerApp.restart(),
        debugCSV: () => prayerApp.debugCSVData()
    };
    
    console.log("Prayer App debugging helpers available at: window.debugPrayerApp");
});

/**
 * Cleanup on page unload
 */
window.addEventListener("beforeunload", () => {
    if (prayerApp) {
        prayerApp.destroy();
    }
});

/**
 * Handle visibility changes for better performance
 */
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && prayerApp && prayerApp.state.isInitialized) {
        console.log("Page became visible, forcing clock update");
        prayerApp.updateClock();
    }
});

/**
 * Global error handler for uncaught errors
 */
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    if (prayerApp) {
        prayerApp.showError('Ralat aplikasi. Cuba muat semula halaman jika masalah berterusan.');
    }
});

/**
 * Handle unhandled promise rejections
 */
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (prayerApp) {
        prayerApp.showError('Ralat sistem. Sila semak sambungan internet.');
    }
});

// Console welcome message
console.log(`
🕌 Enhanced Prayer Times Application v2.0
=====================================
• JAKIM official data support
• TV-friendly interface with warm colors
• Smart audio management
• Performance monitoring
• Enhanced debugging tools

Debug commands available:
• window.debugPrayerApp.getInfo() - Get app status
• window.debugPrayerApp.testAudio('subuh', 'adhan') - Test audio
• window.debugPrayerApp.refreshData() - Reload CSV data
• window.debugPrayerApp.debugCSV() - Debug CSV parsing
• window.debugPrayerApp.getAvailableDates(10) - Show dates in CSV

For TV usage: 
• Warm color scheme for night viewing
• Fullscreen start button for easy clicking
• Auto-start for returning users
• Supports any input method (remote, keyboard, mouse)
`);

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrayerTimeApp;
}
