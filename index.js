import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'EverTrade API is active',
        timestamp: new Date()
    });
});

app.listen(PORT, () => {
    console.log(`EverTrade Server running on port ${PORT}`);
});
