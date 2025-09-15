function syncThreatLogToServer(log) {
    fetch('https://WRITE-NAME-OF-YOUR-API-DOMAIN.com/sync-threats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threats: log })
    })
    .then(response => {
        if (!response.ok) throw new Error('Sync failed');
        console.log('Threat log synced successfully');
    })
    .catch(error => {
        console.error('Sync error:' error);
        //Optionally queue for retry
    });
}