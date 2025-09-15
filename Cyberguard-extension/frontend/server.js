const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.post('/sync-threats', (req, res) => {
    const { threats } = req.body;
    console.log('Received threats:', threats);

    //Save to database or file (placeholder)
    //fs.appendFileSync('threats.log', JSON.stringify(threats) + '\n');

    res.status(200).send({ message: 'Threats synced' });
});

app.listen(PORT, () => {
    console.log('CyberGuard API running on port {PORT}');
})