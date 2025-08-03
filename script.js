let currentDateKey; // Variable is now in the global scope

function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}:${seconds}`;
    document.getElementById('clock').textContent = currentTime;

    // This check runs every second to see if a new day has started
    const newDateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (newDateKey !== currentDateKey) {
        // It's a new day, reload the page to fetch new prayer times
        location.reload();
    }
}

function fetchPrayerTimes(year, month, day, dateKey) {
    const city = 'Segamat';
    const country = 'Malaysia';
    const url = `https://api.aladhan.com/v1/calendarByCity/${year}/${month}?city=${city}&country=${country}&method=2`;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            const dayData = data.data.find(d => d.date.gregorian.day == day);
            if (dayData) {
                localStorage.setItem(dateKey, JSON.stringify({ data: dayData }));
                updatePrayerTimesUI(dayData.timings);
            } else {
                console.error('Prayer times for today not found.');
                document.getElementById('prayer-times').innerHTML = '<p>Could not retrieve prayer times for today.</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching prayer times:', error);
            document.getElementById('prayer-times').innerHTML = '<p>Failed to load prayer times. Please check your connection and try again.</p>';
        });
}

function updatePrayerTimesUI(timings) {
    const prayerTimesList = document.getElementById('prayer-times');
    prayerTimesList.innerHTML = ''; // Clear previous times

    const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    prayerOrder.forEach(prayer => {
        const time = timings[prayer].split(' ')[0]; // Get only the time part
        const listItem = document.createElement('li');
        listItem.innerHTML = `<strong>${prayer}:</strong> ${time}`;
        prayerTimesList.appendChild(listItem);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    // Assign value to the global variable
    currentDateKey = `${year}-${month}-${day}`;

    // Update the displayed date
    document.getElementById('date').textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const storedTimes = localStorage.getItem(currentDateKey);

    if (storedTimes) {
        const prayerTimes = JSON.parse(storedTimes);
        updatePrayerTimesUI(prayerTimes.data.timings);
    } else {
        fetchPrayerTimes(year, month, day, currentDateKey);
    }

    // Initial clock update and set interval
    updateClock();
    setInterval(updateClock, 1000);
});
