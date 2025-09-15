chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if  (message.action === "runScan") {
       fetch( // The actual mock URL)
        .then(response => response.json())
        .then(data => {
            console.log("Scan results:", data);
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icons/icon48.png",
                title: "CyberGuard AI",
                message: "Scan complete. ${data.threat.length == 0 ? "No threats detected." : "Threats found!"}'
            });
        })
        .catch(error =>{
        console.error("Scan error:" error);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "CyberGuard AI",
            message: "Scan failed. Please try again."
        });
      })
    }
});