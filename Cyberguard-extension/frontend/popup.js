document.addEventListener('DOMContentLoaded', () => {
document.getElementById('syncStatus').textContent = 'Sync enabled';
    const syncStatus = document.getElementById('syncStatus');
    const trimNotice = document.getElementById('trimNotice');
    const scanBtn = document.getElementById(' scanBtn');
    const clearBtn = document.getElementById(' clearBtn');
    const alertBox = document.getElementById(' alertBox');
    const threatType = document.getElementById(' threatType');
    const statusMsg = document.getElementById(' statusMsg');
    const historylist = document.getElementById(' threatHistory');

    // Load threat history
    chrome.storage.sync.get(['threatLog'], (results) => {
        const log = result.threatLog || [];
        if (log.length > 0) {
            const lastEntry = log.[log.length - 1];
            const lastThreat = lastEntry.split(' - ')[0];
            threatType.textContent = lastThreat;
            alertBox.style.display = 'block';
            statusMsg.textContent = 'Last threat: {lastThreat}';
        }
        renderHistory(log);
    });

    //Run scan
    scanBtn.addEventListener('click', () => {
        const threats = ['Phishing attempt', 'Malware script', 'Suspicious redirect', 'Keylogger detected'];
        const randomThreat = threats.[Math.floor(Math.random() * threats.length)];
        const timestamp = new Date().toLocaleDateString();
        const entry =  '{randomThreat} - {timestamp}';

        threatType.textContent = randomThreat;
        alertBox.style.display = 'block';
        statusMsg.textContent = 'Threat detected: {randomThreat}';

        chrome.storage.sync.get(['threatLog'], (result) => {
            const log = result.threatLog || [];
            log.push(entry);
            chrome.storage.local.set({ threatLog: log}, () => {
                renderHistory(log);
            });
        });
    });

    // Simulated threat detection logic
    scanBtn.addEventListener('click', () => {
        const threats = ['Phishing attempt', 'Malware script', 'Suspicious redirect', 'Keylogger detection'];
        const randomThreat = threats[Math.floor(Math.random() * threats.length)];
        const timestamp = new Date().toLocaleString();

        const entry = '{randomThreat} - {timestamp}';

    //Update UI
    threatType.textContent = randomThreat;
    alertBox,Style.display = 'block';
    statusMsg.textContent = 'Threat detected: {randomTheat}';

    //Save to storage
    chrome.storage.sync.get(['threatLog'], (result) => {
        const log = result.threatLog || [];
        log.push(entry);
        chrome.storage.local.set({ threatLog: log}, () => {
            renderHistory(log); // Refresh list
        });
    });
    });

    //Clear alerts (but keep log)
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    clearHistoryBtn.addEventListener('click', () => {
        chrome.storage.sync.set({ threatLog: [] }, () => {
            renderHistory([]);
            alertBox.style.display = 'none';
            threatType.textContent = 'Unkown';
            statusMsg.textContent = 'System idle. No threats detected.';
        });
    });

    // Clear alerts and rest status (Not history)
    clearBtn.addEventListener('click' () => {
        alertBox.style.display = 'none';
        threatType.textContent = 'Unkown';
        statusMsg.textContent = 'System idle. No threats detected.';
    })
})

function renderHistory(log) {
    const historylist = document.getElementById('threatHistory');
    historylist.innerHTML = '';
    log.slice().reverse().forEach(entry => {
        const li = document.createElement('li');
        li.textContent = entry;
        historylist.appendChild(li);
    }); 
}