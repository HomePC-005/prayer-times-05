const PRAYER_NAMES = ["Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak"];
const audioQueue = [];
const recitationOffsetMin = 10;

const AUDIO_NAMES = ["subuh", "syuruk", "zohor", "asar", "maghrib", "isyak"];
const audioCache = {};
const audioPlayed = new Set(); // Keeps track of filenames played in this minute

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
}
function updateNextPrayerTimer(now) {
  const nowMs = now.getTime();
  nextPrayer = null;
  nextTimeMs = Infinity;

  PRAYER_NAMES.forEach(name => {
    const { hour, minute } = parseTime(todayPrayerTimes[name]);
    const timeMs = getTimeInMs(hour, minute);
    if (timeMs > nowMs && timeMs < nextTimeMs) {
      nextTimeMs = timeMs;
      nextPrayer = name;
    }
  });

  if (!nextPrayer) {
    document.getElementById("next-prayer-timer").textContent = "All prayers done for today.";
    return;
  }

  const diffMs = nextTimeMs - nowMs;
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  document.getElementById("next-prayer-timer").textContent =
  `Waktu Solat (${nextPrayer}) dalam ${hours}h ${mins}m ${secs}s`;


}

  // Audio triggers
function checkPrayerAudio(now) {
  const nowMs = now.getTime();
  const nowMinuteKey = `${now.getHours()}:${now.getMinutes()}`;

  const reciteTime = nextTimeMs - recitationOffsetMin * 60000;
  const reciteFile = `${nextPrayer.toLowerCase()}_recite.mp3`;
  const adhanFile = `${nextPrayer.toLowerCase()}_adhan.mp3`;

//new add 

if (nextPrayer) {
  const reciteFilename = `${nextPrayer.toLowerCase()}_recite.mp3`;
  const adhanFilename = `${nextPrayer.toLowerCase()}_adhan.mp3`;

  const reciteTime = nextTimeMs - recitationOffsetMin * 60000;
  if (Math.abs(nowMs - reciteTime) < 1000) {
    playAudio(reciteFilename);
  }

  if (Math.abs(nowMs - nextTimeMs) < 1000) {
    playAudio(adhanFilename);
  }

  document.getElementById("button-adhan").addEventListener("click", () => {
playAudio(adhanFilename)
  });

  document.getElementById("button-recite").addEventListener("click", () => {
playAudio(reciteFilename)
  });
}


  if (Math.abs(nowMs - reciteTime) < 1000 && !audioPlayed.has(`${reciteFile}-${nowMinuteKey}`)) {
    playAudio(reciteFile);
    audioPlayed.add(`${reciteFile}-${nowMinuteKey}`);
  }

  if (Math.abs(nowMs - nextTimeMs) < 1000 && !audioPlayed.has(`${adhanFile}-${nowMinuteKey}`)) {
    playAudio(adhanFile);
    audioPlayed.add(`${adhanFile}-${nowMinuteKey}`);
  }
}


function playAudio(filename) {
  const audio = audioCache[filename];
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.error("Audio play error:", e));
  } else {
    console.warn("Audio not preloaded:", filename);
  }
}


// Start

window.addEventListener("DOMContentLoaded", () => {
  preloadAllAudio();
  loadCSVandInit();
});

setInterval(() => {
  audioPlayed.clear();
}, 60 * 1000);

