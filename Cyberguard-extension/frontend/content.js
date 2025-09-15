// Example: Monitor page for suspicious links
const links = document.querySelectorAll("a[href]");
links.forEach(link => {
    if (link.href.includes("suspicious-domain.com")) {
        console.warm("Potential phishing link detected:", link.href);
    }
});