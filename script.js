const PRAYER_NAMES = ["Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"];
const audioQueue = [];
const recitationOffsetMin = 10;

const AUDIO_NAMES = ["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"];
const audioCache = {};
const audioPlayed = new Set(); // Keeps track of filenames played in this minute
let currentDateKey = "";
let nextPrayer = null;
let nextTimeMs = null;
let todayPrayerTimes = {};
let currentHijriDate = "";

function updateClock() {
  const now = new Date();

  // Check for date change
  const todayKey = formatDate(now);
  if (todayKey !== currentDateKey && csvDataRaw) {
    console.log("New day detected. Reloading prayer data.");
    loadPrayerTimesForDate(now, csvDataRaw);
  }
document.getElementById("current-time").textContent = now.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
  });
document.getElementById("gregorian-date").textContent = formatLongDate(now);
  checkAndUpdatePrayerHighlight(now);
  updateNextPrayerTimer(now);
  checkPrayerAudio(now); 
}

function formatLongDate(date) {
  const days = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  const months = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
  const dayName = days[date.getDay()];
  const dayNum = String(date.getDate()).padStart(2, '0');
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

function loadPrayerTimesForDate(date, csvText) {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",");
  const dateKey = formatDate(date); // "1-Jan-25"

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row[0] === dateKey) {
      todayPrayerTimes = {};
      headers.forEach((h, idx) => {
        todayPrayerTimes[h.trim()] = row[idx].trim();
      });
      currentHijriDate = todayPrayerTimes["Date Hijri"];
      currentDateKey = dateKey;
      document.getElementById("hijri-date").textContent = `Tarikh Hijri: ${currentHijriDate}`;
      populatePrayerTable(todayPrayerTimes);
      console.log("Prayer times loaded for:", dateKey);
      break;
    }
  }
}

let csvDataRaw = ""; // to keep loaded CSV for reuse

function loadCSVandInit() {
  fetch("prayer_times.csv")
    .then(res => res.text())
    .then(csvText => {
      csvDataRaw = csvText; // Save it globally for reuse
      const today = new Date();
      loadPrayerTimesForDate(today, csvDataRaw);
      setInterval(updateClock, 1000);
      updateClock();
    });
}

function preloadAllAudio() {
  AUDIO_NAMES.forEach(name => {
    const recite = new Audio(`${name}_recite.mp3`);
    const adhan = new Audio(`${name}_adhan.mp3`);
    recite.preload = "auto";
    adhan.preload = "auto";
    audioCache[`${name}_recite.mp3`] = recite;
    audioCache[`${name}_adhan.mp3`] = adhan;
  });
}


function formatDate(date) {
  const day = date.getDate();
  const monthNames = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
}

function parseTime(str) {
  const [time, modifier] = str.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (modifier === "PM" && hour !== 12) hour += 12;
  if (modifier === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

function getTimeInMs(hour, minute) {
  const now = new Date();
  const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  return time.getTime();
}

function populatePrayerTable(data) {
  const container = document.getElementById("prayer-table");
  container.innerHTML = ""; // clear previous

  PRAYER_NAMES.forEach(name => {
    const time = data[name];
    const cell = document.createElement("div");
    cell.classList.add("prayer-cell");
    cell.setAttribute("data-prayer", name);
    cell.innerHTML = `
      <div class="prayer-name">${name}</div>
      <div class="prayer-time">${time}</div>
    `;
    container.appendChild(cell);
  });
}

function checkAndUpdatePrayerHighlight(now) {
  let current = null;
  const nowMs = now.getTime();

  PRAYER_NAMES.forEach(name => {
    const { hour, minute } = parseTime(todayPrayerTimes[name]);
    const timeMs = getTimeInMs(hour, minute);
    if (nowMs >= timeMs) current = name;
  });

  const cells = document.querySelectorAll(".prayer-cell");
  cells.forEach(cell => {
    cell.classList.remove("current");
    if (cell.getAttribute("data-prayer") === current) {
      cell.classList.add("current");
    }
  });
}// updated script.js

// ... (keep all the code from the top until checkAndUpdatePrayerHighlight)

function updateNextPrayerTimer(now) {
    const nowMs = now.getTime();
    nextPrayer = null;
    let tempNextTimeMs = Infinity; // Use a temporary variable

    PRAYER_NAMES.forEach(name => {
        // Ensure todayPrayerTimes[name] exists before parsing
        if (todayPrayerTimes[name]) {
            const { hour, minute } = parseTime(todayPrayerTimes[name]);
            const timeMs = getTimeInMs(hour, minute);
            if (timeMs > nowMs && timeMs < tempNextTimeMs) {
                tempNextTimeMs = timeMs;
                nextPrayer = name;
            }
        }
    });

    nextTimeMs = tempNextTimeMs; // Assign to the global variable

    if (!nextPrayer) {
        document.getElementById("next-prayer-timer").textContent = "Semua waktu solat untuk hari ini telah selesai.";
        // Optional: You could add logic here to find the next day's Subuh prayer.
        return;
    }

    const diffMs = nextTimeMs - nowMs;
    const totalSecs = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    document.getElementById("next-prayer-timer").textContent =
        `Waktu Solat (${nextPrayer}) dalam ${String(hours).padStart(2, '0')}j ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}


// Audio triggers
function checkPrayerAudio(now) {
    // Exit if there's no next prayer or its time is not calculated yet
    if (!nextPrayer || !nextTimeMs) {
        return;
    }

    const nowMs = now.getTime();
    const nowMinuteKey = `${now.getHours()}:${now.getMinutes()}`;

    const reciteTime = nextTimeMs - recitationOffsetMin * 60 * 1000;
    const reciteFile = `${nextPrayer.toLowerCase()}_recite.mp3`;
    const adhanFile = `${nextPrayer.toLowerCase()}_adhan.mp3`;

    // Check for Recitation audio
    // Math.abs(nowMs - reciteTime) < 1000 checks if we are within 1 second of the target time
    if (Math.abs(nowMs - reciteTime) < 1000 && !audioPlayed.has(reciteFile)) {
        console.log(`Playing recitation for ${nextPrayer}`);
        playAudio(reciteFile);
        audioPlayed.add(reciteFile); // Prevent re-playing this specific file
    }

    // Check for Adhan audio
    if (Math.abs(nowMs - nextTimeMs) < 1000 && !audioPlayed.has(adhanFile)) {
        console.log(`Playing adhan for ${nextPrayer}`);
        playAudio(adhanFile);
        audioPlayed.add(adhanFile); // Prevent re-playing this specific file
    }
}


function playAudio(filename) {
    if (!filename) {
        console.warn("playAudio called with no filename.");
        return;
    }
    const audio = audioCache[filename];
    if (audio) {
        console.log("Playing:", filename);
        audio.currentTime = 0;
        audio.play().catch(e => console.error("Audio play error:", e));
    } else {
        console.warn("Audio not preloaded:", filename);
    }
}

/**
 * Sets up event listeners for UI elements that should only be configured once.
 */
function setupEventListeners() {
    // Handles the start screen button
    const startButton = document.getElementById("start-button");
    if (startButton) {
        startButton.addEventListener("click", () => {
            document.getElementById("start-screen").style.display = "none";
            // Attempt to unlock audio playback on all browsers
            Object.values(audioCache).forEach(audio => {
                audio.play().then(() => audio.pause()).catch(() => {});
                audio.currentTime = 0;
            });
        });
    }

    // Uncomment these lines in your HTML to use the test buttons
    // const adhanButton = document.getElementById("button-adhan");
    // if (adhanButton) {
    //     adhanButton.addEventListener("click", () => {
    //         if (nextPrayer) {
    //             const adhanFilename = `${nextPrayer.toLowerCase()}_adhan.mp3`;
    //             playAudio(adhanFilename);
    //         }
    //     });
    // }

    // const reciteButton = document.getElementById("button-recite");
    // if (reciteButton) {
    //     reciteButton.addEventListener("click", () => {
    //         if (nextPrayer) {
    //             const reciteFilename = `${nextPrayer.toLowerCase()}_recite.mp3`;
    //             playAudio(reciteFilename);
    //         }
    //     });
    // }
}


// Start
window.addEventListener("DOMContentLoaded", () => {
    preloadAllAudio();
    loadCSVandInit();
    setupEventListeners(); // <-- ADD THIS LINE
});

// This interval clears the record of which audios have played.
// It resets every minute, allowing audio to be triggered again if conditions are met in a new minute.
setInterval(() => {
    console.log("Clearing audioPlayed set for the new minute.");
    audioPlayed.clear();
}, 60 * 1000);

// (The rest of your code like loadCSVandInit, formatDate, etc., can remain the same)
// Just make sure to replace the functions I've provided above.


