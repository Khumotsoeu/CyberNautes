// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const syncStatus = document.getElementById("syncStatus");
  const trimNotice = document.getElementById("trimNotice");
  const scanBtn = document.getElementById("scanBtn");
  const clearBtn = document.getElementById("clearBtn");
  const alertBox = document.getElementById("alertBox");
  const threatType = document.getElementById("threatType");
  const statusMsg = document.getElementById("statusMsg");
  const historyList = document.getElementById("threatHistory");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  syncStatus.textContent = "Sync enabled";

  // Load threat history
  chrome.storage.local.get(["threatLog"], (result) => {
    const log = result.threatLog || [];
    if (log.length > 0) {
      const lastEntry = log[log.length - 1];
      const lastThreat = lastEntry.split(" - ")[0];
      threatType.textContent = lastThreat;
      alertBox.style.display = "block";
      statusMsg.textContent = `Last threat: ${lastThreat}`;
    }
    renderHistory(log);
  });

  // Simulated scan button
  scanBtn.addEventListener("click", () => {
    const threats = [
      "Phishing attempt",
      "Malware script",
      "Suspicious redirect",
      "Keylogger detected",
    ];
    const randomThreat =
      threats[Math.floor(Math.random() * threats.length)];
    const timestamp = new Date().toLocaleString();
    const entry = `${randomThreat} - ${timestamp}`;

    // Update UI
    threatType.textContent = randomThreat;
    alertBox.style.display = "block";
    statusMsg.textContent = `Threat detected: ${randomThreat}`;

    // Save to storage
    chrome.storage.local.get(["threatLog"], (result) => {
      const log = result.threatLog || [];
      log.push(entry);
      chrome.storage.local.set({ threatLog: log }, () => {
        renderHistory(log);
      });
    });
  });

  // Clear full history
  clearHistoryBtn.addEventListener("click", () => {
    chrome.storage.local.set({ threatLog: [] }, () => {
      renderHistory([]);
      alertBox.style.display = "none";
      threatType.textContent = "Unknown";
      statusMsg.textContent = "System idle. No threats detected.";
    });
  });

  // Clear current alert only (keep history)
  clearBtn.addEventListener("click", () => {
    alertBox.style.display = "none";
    threatType.textContent = "Unknown";
    statusMsg.textContent = "System idle. No threats detected.";
  });

  function renderHistory(log) {
    historyList.innerHTML = "";
    log
      .slice()
      .reverse()
      .forEach((entry) => {
        const li = document.createElement("li");
        li.textContent = entry;
        historyList.appendChild(li);
      });
  }
});
